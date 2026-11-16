import { timingSafeEqual } from 'node:crypto';
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Ctx } from './app/context.ts';
import { storeReceipt } from './app/expenses.ts';
import { invoicePdf } from './app/invoices.ts';
import { formatEur } from './core/money.ts';
import { BookizError } from './errors.ts';
import { MAX_RECEIPT_BYTES, verifySignature } from './receipts.ts';
import { createServer, VERSION } from './server.ts';
import * as store from './store.ts';

function tokenMatches(ctx: Ctx, given: string | undefined): boolean {
  const expected = Buffer.from(ctx.config.token ?? '');
  const candidate = Buffer.from(given ?? '');
  return expected.length > 0 && expected.length === candidate.length && timingSafeEqual(expected, candidate);
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new BookizError('Het bestand is groter dan 10 MB.');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

function send(res: ServerResponse, status: number, body: string, type = 'text/plain; charset=utf-8'): void {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(body);
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string);

/** The one screen Bookiz has: pick a photo of a receipt, done. No account, no app. */
function uploadPage(title: string, detail: string, done: boolean): string {
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Bon bewaren</title>
<style>
  body { font: 17px/1.5 system-ui, sans-serif; margin: 0; padding: 32px 20px; background: #f6f5f1; color: #16181d; }
  main { max-width: 440px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  p { margin: 0 0 20px; color: #55595f; }
  label { display: block; padding: 28px 16px; border: 2px dashed #9aa0a6; border-radius: 12px; text-align: center; font-weight: 600; background: #fff; }
  input { position: absolute; opacity: 0; width: 1px; height: 1px; }
  label:focus-within { outline: 3px solid #1d4ed8; outline-offset: 2px; }
  #status { margin-top: 20px; font-weight: 600; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(detail)}</p>
${
  done
    ? ''
    : `<label>Kies een foto of pdf van de bon<input id="file" type="file" accept="image/*,application/pdf"></label>
<div id="status" role="status"></div>
<script>
  const status = document.getElementById('status');
  document.getElementById('file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    status.textContent = 'Bezig met bewaren…';
    const response = await fetch(location.href, { method: 'PUT', body: file });
    status.textContent = await response.text();
  });
</script>`
}
</main>
</body>
</html>`;
}

async function handleReceipt(ctx: Ctx, req: IncomingMessage, res: ServerResponse, ref: string, signature: string) {
  if (!verifySignature(ctx.config, `bon:${ref}`, signature)) return send(res, 404, 'Niet gevonden.');
  const expense = await store.getExpense(ctx.db, ref);
  const title = `${expense.vendor}, ${formatEur(expense.total_cents)}`;
  if (req.method === 'GET') {
    const done = Boolean(expense.receipt) || Boolean(expense.voided_at);
    const detail = expense.receipt
      ? 'Bij deze uitgave is het bewijsstuk al bewaard. Je kunt dit venster sluiten.'
      : `Uitgave ${expense.ref} van ${expense.date}. De foto gaat naar je eigen archief; Bookiz bewaart alleen een controlegetal.`;
    return send(res, 200, uploadPage(title, detail, done), 'text/html; charset=utf-8');
  }
  if (req.method !== 'PUT') return send(res, 405, 'Niet toegestaan.');
  if (expense.receipt) return send(res, 409, 'Bij deze uitgave is al een bewijsstuk bewaard.');
  const bytes = await readBody(req, MAX_RECEIPT_BYTES);
  await storeReceipt(ctx, expense, bytes, await store.requireBusiness(ctx.db));
  await store.logAudit(ctx.db, 'upload_receipt', { ref: expense.ref, bytes: bytes.length }, 'ok');
  return send(res, 200, 'Bewaard. Je kunt dit venster sluiten.');
}

async function handleMcp(ctx: Ctx, req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    // Stateless server: there is no session to resume or stream to listen on.
    res.writeHead(405, { allow: 'POST' }).end();
    return;
  }
  const body = JSON.parse((await readBody(req, 16 * 1024 * 1024)).toString('utf8'));
  const server = createServer(ctx);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport as never);
  await transport.handleRequest(req, res, body);
}

export function createHttp(ctx: Ctx): Server {
  return createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const parts = url.pathname.split('/').filter(Boolean);

      if (url.pathname === '/health') return send(res, 200, JSON.stringify({ ok: true, version: VERSION }), 'application/json');

      if (parts[0] === 'mcp') {
        const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
        // Header for clients that can send one; the path form exists because
        // claude.ai and ChatGPT accept only OAuth or a bare URL.
        if (!tokenMatches(ctx, bearer) && !tokenMatches(ctx, parts[1])) return send(res, 401, 'Unauthorized');
        return await handleMcp(ctx, req, res);
      }

      if (parts[0] === 'bon' && parts[1] && parts[2]) return await handleReceipt(ctx, req, res, parts[1], parts[2]);

      const pdf = parts[0] === 'factuur' && parts[1] && /^([0-9a-f]+)\.pdf$/.exec(parts[2] ?? '');
      if (pdf && req.method === 'GET') {
        const number = parts[1] as string;
        if (!verifySignature(ctx.config, `factuur:${number}`, pdf[1] as string)) return send(res, 404, 'Niet gevonden.');
        const invoice = await store.getInvoice(ctx.db, number);
        res.writeHead(200, {
          'content-type': 'application/pdf',
          'content-disposition': `inline; filename="factuur-${number}.pdf"`,
          'cache-control': 'private, no-store',
        });
        res.end(await invoicePdf(ctx, invoice));
        return;
      }

      return send(res, 404, 'Niet gevonden.');
    } catch (error) {
      if (res.headersSent) return res.end();
      if (error instanceof BookizError) return send(res, 400, error.message);
      console.error('[bookiz] request failed', error);
      return send(res, 500, 'Er ging iets mis.');
    }
  });
}
