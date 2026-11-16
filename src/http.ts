import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Ctx } from './app/context.ts';
import { storeReceipt } from './app/expenses.ts';
import { invoicePdf } from './app/invoices.ts';
import { formatEur } from './core/money.ts';
import { BookizError } from './errors.ts';
import { tooLarge, verifyLink } from './receipts.ts';
import { createServer, VERSION } from './server.ts';
import * as store from './store.ts';

export function secretMatches(secret: string | undefined, given: string | undefined): boolean {
  const expected = Buffer.from(secret ?? '');
  const candidate = Buffer.from(given ?? '');
  return expected.length > 0 && expected.length === candidate.length && timingSafeEqual(expected, candidate);
}

export async function readBody(req: IncomingMessage, limit: number, message = 'Het verzoek is te groot.'): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new BookizError(message);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export function send(
  res: ServerResponse,
  status: number,
  body: string,
  type = 'text/plain; charset=utf-8',
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    // Not `no-referrer`: that makes browsers send `Origin: null` on our own forms, which the origin check rightly refuses.
    'referrer-policy': 'same-origin',
    ...headers,
  });
  res.end(body);
}

/** HTML with a strict policy: no outside resources, inline script only with this response's nonce. */
export function sendHtml(res: ServerResponse, status: number, html: (nonce: string) => string, headers: Record<string, string> = {}): void {
  const nonce = randomBytes(16).toString('base64');
  send(res, status, html(nonce), 'text/html; charset=utf-8', {
    'content-security-policy': `default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
    ...headers,
  });
}

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string);

/** The one screen of the self-hosted server: pick a photo of a receipt, done. No account, no app. */
function uploadPage(title: string, detail: string, done: boolean, maxBytes: number, nonce: string): string {
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Bon bewaren</title>
<style>
  body { font: 17px/1.5 system-ui, sans-serif; margin: 0; padding: 32px 20px; background: #0d0d0d; color: #fff; }
  main { max-width: 440px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  p { margin: 0 0 20px; color: #b4b4b4; }
  label { display: block; padding: 28px 16px; border: 2px dashed #555; border-radius: 16px; text-align: center; font-weight: 600; background: #161616; }
  input { position: absolute; opacity: 0; width: 1px; height: 1px; }
  label:focus-within { outline: 3px solid #fa4901; outline-offset: 2px; }
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
<script nonce="${nonce}">
  const status = document.getElementById('status');
  const limit = ${maxBytes};
  // Phone photos are often larger than the server accepts; shrink them until they fit and stay readable.
  async function shrink(file) {
    if (file.size <= limit || !file.type.startsWith('image/')) return file;
    const image = await createImageBitmap(file);
    for (const edge of [2400, 1800, 1400]) {
      const scale = Math.min(1, edge / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      if (blob && blob.size <= limit) return blob;
    }
    return file;
  }
  document.getElementById('file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    status.textContent = 'Bezig met bewaren…';
    try {
      const response = await fetch(location.href, { method: 'PUT', body: await shrink(file) });
      status.textContent = await response.text();
    } catch {
      status.textContent = 'Het bewaren is niet gelukt. Probeer het opnieuw.';
    }
  });
</script>`
}
</main>
</body>
</html>`;
}

export async function handleReceipt(ctx: Ctx, req: IncomingMessage, res: ServerResponse, ref: string, signature: string) {
  if (!verifyLink(ctx.config, 'bon', ref, signature)) return send(res, 404, 'Niet gevonden.');
  const expense = await store.getExpense(ctx.db, ref);
  const title = `${expense.vendor}, ${formatEur(expense.total_cents)}`;
  if (req.method === 'GET') {
    const done = Boolean(expense.receipt) || Boolean(expense.voided_at);
    const detail = expense.receipt
      ? 'Bij deze uitgave is het bewijsstuk al bewaard. Je kunt dit venster sluiten.'
      : `Uitgave ${expense.ref} van ${expense.date}. De foto gaat naar je eigen archief; Bookiz bewaart alleen een controlegetal.`;
    return sendHtml(res, 200, (nonce) => uploadPage(title, detail, done, ctx.config.maxReceiptBytes, nonce));
  }
  if (req.method !== 'PUT') return send(res, 405, 'Niet toegestaan.');
  if (ctx.locked) return send(res, 403, ctx.locked);
  if (expense.receipt) return send(res, 409, 'Bij deze uitgave is al een bewijsstuk bewaard.');
  const bytes = await readBody(req, ctx.config.maxReceiptBytes, tooLarge(ctx.config));
  await storeReceipt(ctx, expense, bytes, await store.requireBusiness(ctx.db));
  await store.logAudit(ctx.db, 'upload_receipt', { ref: expense.ref, bytes: bytes.length }, 'ok');
  return send(res, 200, 'Bewaard. Je kunt dit venster sluiten.');
}

export async function handleInvoicePdf(ctx: Ctx, res: ServerResponse, number: string, signature: string) {
  if (!verifyLink(ctx.config, 'factuur', number, signature)) return send(res, 404, 'Niet gevonden.');
  const invoice = await store.getInvoice(ctx.db, number);
  const pdf = await invoicePdf(ctx, invoice);
  res.writeHead(200, {
    'content-type': 'application/pdf',
    'content-disposition': `inline; filename="factuur-${number}.pdf"`,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(pdf);
}

/** One stateless MCP exchange: a fresh server per request, nothing kept in memory between them. */
export async function handleMcp(ctx: Ctx, req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    // Stateless server: there is no session to resume or stream to listen on.
    res.writeHead(405, { allow: 'POST' }).end();
    return;
  }
  const body = JSON.parse((await readBody(req, 16 * 1024 * 1024)).toString('utf8'));
  if (Array.isArray(body)) {
    // A batch would run its calls side by side on one database connection, where locks and limits no longer hold.
    return send(
      res,
      400,
      JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Batches are not supported; send one message per request.' } }),
      'application/json',
    );
  }
  const server = createServer(ctx);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const finished = new Promise<void>((resolve) => res.on('close', resolve));
  await server.connect(transport as never);
  await transport.handleRequest(req, res, body);
  await finished;
  await transport.close();
  await server.close();
}

/** `/bon/<ref>/<sig>` and `/factuur/<number>/<sig>.pdf`; returns false when the path is neither. */
export async function handleDocumentLink(ctx: Ctx, req: IncomingMessage, res: ServerResponse, parts: string[]): Promise<boolean> {
  if (parts[0] === 'bon' && parts[1] && parts[2]) {
    await handleReceipt(ctx, req, res, parts[1], parts[2]);
    return true;
  }
  const pdf = parts[0] === 'factuur' && parts[1] && /^([0-9a-f]+)\.pdf$/.exec(parts[2] ?? '');
  if (pdf && req.method === 'GET') {
    await handleInvoicePdf(ctx, res, parts[1] as string, pdf[1] as string);
    return true;
  }
  return false;
}

export function fail(res: ServerResponse, error: unknown): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  if (error instanceof BookizError) return send(res, 400, error.message);
  if (error instanceof SyntaxError) return send(res, 400, 'Ongeldig verzoek.');
  console.error('[bookiz] request failed', error);
  send(res, 500, 'Er ging iets mis.');
}

/** The self-hosted HTTP server: one administration, guarded by a token. */
export function createHttp(ctx: Ctx): Server {
  return createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const parts = url.pathname.split('/').filter(Boolean);

      if (url.pathname === '/health') return send(res, 200, JSON.stringify({ ok: true, version: VERSION }), 'application/json');

      if (parts[0] === 'mcp') {
        const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
        // The server token only ever travels in a header. Clients that accept
        // nothing but a URL (claude.ai, ChatGPT, Grok) get their own secret,
        // which is off unless configured and can be rotated on its own.
        const viaHeader = secretMatches(ctx.config.token, bearer);
        const viaUrl = secretMatches(ctx.config.urlToken, parts[1]);
        if (!viaHeader && !viaUrl) return send(res, 401, 'Unauthorized');
        return await handleMcp(ctx, req, res);
      }

      if (await handleDocumentLink(ctx, req, res, parts)) return;
      return send(res, 404, 'Niet gevonden.');
    } catch (error) {
      fail(res, error);
    }
  });
}
