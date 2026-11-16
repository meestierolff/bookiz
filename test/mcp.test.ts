import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as expenses from '../src/app/expenses.ts';
import * as invoices from '../src/app/invoices.ts';
import { createHttp } from '../src/http.ts';
import { invoiceLink, uploadLink } from '../src/receipts.ts';
import { createServer } from '../src/server.ts';
import { makeCtx, PNG, seed } from './helpers.ts';

const TOKEN = 'test-token-with-at-least-24-characters';

type ToolResult = { isError?: boolean; content: { type: string; text: string }[] };

async function connect(ctx: Awaited<ReturnType<typeof makeCtx>>) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(ctx).connect(serverSide);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(clientSide);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = (await client.callTool({ name, arguments: args })) as ToolResult;
    const text = result.content[0]?.text ?? '';
    return { isError: Boolean(result.isError), text, data: result.isError ? null : JSON.parse(text) };
  };
  return { client, call };
}

test('an agent can run the books through MCP tools alone', async () => {
  const ctx = await makeCtx();
  const { client, call } = await connect(ctx);

  const { tools } = await client.listTools();
  assert.equal(tools.length, 21);
  assert.ok(tools.every((tool) => (tool.description ?? '').length > 40), 'every tool explains itself');
  const attach = tools.find((tool) => tool.name === 'attach_receipt');
  assert.deepEqual(attach?._meta?.['openai/fileParams'], ['file']);
  assert.match(client.getInstructions() ?? '', /Never invent a figure/);

  const empty = await call('get_overview');
  assert.equal(empty.data.setup, 'nog niet ingericht');

  const tooEarly = await call('record_expense', { date: '2026-11-10', vendor: 'NS', amount: 21.8, vat_amount: 1.8 });
  assert.equal(tooEarly.isError, true);
  assert.match(tooEarly.text, /nog niet ingericht[\s\S]*Wat nu: Roep eerst setup_business aan/);

  await call('setup_business', {
    name: 'Studio Voorbeeld',
    address_line: 'Dorpsstraat 1',
    postal_code: '1234 AB',
    city: 'Utrecht',
    kvk_number: '12345678',
    vat_id: 'NL123456789B01',
    iban: 'NL00BANK0123456789',
  });
  const contact = await call('save_contact', { name: 'Klant BV', address_line: 'Kade 5', city: 'Rotterdam' });
  const draft = await call('create_invoice', {
    contact_id: contact.data.id,
    lines: [{ description: 'Advies', quantity: 4, unit_price: 95 }],
  });
  assert.equal(draft.data.total, 459.8, 'amounts leave the server in euros, not cents');
  const final = await call('finalize_invoice', { draft_id: draft.data.draft_id });
  assert.equal(final.data.number, '2026-001');

  const expense = await call('record_expense', { date: '2026-11-10', vendor: 'NS', amount: 21.8, vat_amount: 1.8, category: 'reiskosten' });
  assert.equal(expense.data.ref, 'K2026-001');
  await call('attach_receipt', { ref: 'K2026-001', content_base64: PNG.toString('base64') });

  const overview = await call('get_overview');
  assert.equal(overview.data.invoices.unpaid_total, 459.8);
  assert.equal(overview.data.expenses_without_receipt, 0);
  assert.equal(overview.data.btw.tussenstand_te_betalen, 77);

  const rule = await call('get_tax_rules', { key: 'zelfstandigenaftrek' });
  assert.equal(rule.data.value, 1200);
  assert.match(rule.data.source, /belastingdienst\.nl/);

  const audit = await ctx.db.query<{ tool: string; input: Record<string, unknown> }>('select tool, input from audit_log order by id');
  assert.deepEqual(
    audit.map((entry) => entry.tool),
    ['record_expense', 'setup_business', 'save_contact', 'create_invoice', 'finalize_invoice', 'record_expense', 'attach_receipt'],
  );
  assert.equal(audit.at(-1)?.input.content_base64, undefined, 'the audit trail never holds the document');
});

test('over HTTP: token required, receipt upload page and invoice PDF behind signed links', async () => {
  const ctx = await makeCtx({ mode: 'http', token: TOKEN });
  const server = createHttp(ctx).listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  ctx.config.publicUrl = base;
  try {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/mcp`, { method: 'POST', body: '{}' })).status, 401);
    assert.equal((await fetch(`${base}/mcp/wrong-token`, { method: 'POST', body: '{}' })).status, 401);

    for (const transport of [
      new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${TOKEN}` } } }),
      new StreamableHTTPClientTransport(new URL(`${base}/mcp/${TOKEN}`)),
    ]) {
      const client = new Client({ name: 'test', version: '0' });
      await client.connect(transport);
      const result = (await client.callTool({ name: 'get_overview', arguments: {} })) as ToolResult;
      assert.match(result.content[0]?.text ?? '', /nog niet ingericht/);
      await client.close();
    }

    const customer = await seed(ctx);
    const expense = await expenses.recordExpense(ctx, { date: '2026-11-10', vendor: 'Bakker', amount: 8.72, vat_amount: 0.72 });
    const link = uploadLink(ctx.config, expense.ref) as string;
    assert.ok(expense.receipt_help.includes(link));
    assert.equal((await fetch(link.replace(/.$/, '0'))).status, 404, 'a wrong signature finds nothing');
    assert.match(await (await fetch(link)).text(), /Kies een foto of pdf van de bon/);
    assert.equal((await fetch(link, { method: 'PUT', body: 'geen foto' })).status, 400);
    const uploaded = await fetch(link, { method: 'PUT', body: PNG });
    assert.equal(uploaded.status, 200);
    assert.equal((await fetch(link, { method: 'PUT', body: PNG })).status, 409);
    assert.equal((await expenses.listExpenses(ctx, { missing_receipt: true })).count, 0);

    const draft = await invoices.createInvoice(ctx, { contact_id: customer, lines: [{ description: 'Werk', quantity: 1, unit_price: 100 }] });
    const invoice = await invoices.finalizeInvoice(ctx, draft.draft_id);
    assert.equal(invoice.pdf, invoiceLink(ctx.config, '2026-001'));
    const pdf = await fetch(invoice.pdf);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  } finally {
    server.close();
    server.closeAllConnections();
  }
});
