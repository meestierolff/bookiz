import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ElicitRequestSchema, type ElicitResult } from '@modelcontextprotocol/sdk/types.js';
import * as invoices from '../src/app/invoices.ts';
import { createHttp } from '../src/http.ts';
import { createServer } from '../src/server.ts';
import * as store from '../src/store.ts';
import { makeCtx, seed, type TestCtx } from './helpers.ts';

type ToolResult = { isError?: boolean; content: { type: string; text: string }[] };
type Answer = ElicitResult['action'] | 'fail';

/** A client that can show a confirmation form and answers it from a script; it records every question. */
async function connectWithForms(ctx: TestCtx, answers: Answer[]) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(ctx).connect(serverSide);
  const client = new Client({ name: 'test', version: '0' }, { capabilities: { elicitation: {} } });
  const asked: string[] = [];
  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    asked.push(request.params.message);
    const answer = answers.shift() ?? 'decline';
    if (answer === 'fail') throw new Error('the client could not show the form');
    return { action: answer, ...(answer === 'accept' ? { content: {} } : {}) };
  });
  await client.connect(clientSide);
  return { asked, call: (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args }) as Promise<ToolResult> };
}

async function lastAudit(ctx: TestCtx) {
  const rows = await ctx.db.query<{ tool: string; outcome: string; approval: string | null }>(
    'select tool, outcome, approval from audit_log order by id desc limit 1',
  );
  return rows[0];
}

test('the owner confirms a final step in a form Bookiz shows; anything but yes changes nothing', async () => {
  const ctx = await makeCtx();
  const customer = await seed(ctx);
  const draft = await invoices.createInvoice(ctx, { contact_id: customer, lines: [{ description: 'Advies', quantity: 4, unit_price: 95 }] });
  const { asked, call } = await connectWithForms(ctx, ['decline', 'cancel', 'fail', 'accept']);

  for (const expected of [/niet bevestigd/, /niet bevestigd/, /kon je niet om bevestiging vragen/]) {
    const refused = await call('finalize_invoice', { draft_id: draft.draft_id });
    assert.equal(refused.isError, true);
    assert.match(refused.content[0]?.text ?? '', expected);
    assert.match(refused.content[0]?.text ?? '', /er is niets gewijzigd/);
    assert.equal((await store.getInvoice(ctx.db, draft.draft_id)).status, 'draft');
    assert.deepEqual(await lastAudit(ctx), { tool: 'finalize_invoice', outcome: `error: ${(refused.content[0]?.text ?? '').split('\n')[0]}`, approval: null });
  }

  // The question comes from the stored draft, not from what the assistant says about it.
  assert.match(asked[0] ?? '', /Klant BV/);
  assert.match(asked[0] ?? '', /Advies \(4 × € 95,00\)/);
  assert.match(asked[0] ?? '', /€ 380,00 \+ € 79,80 btw = € 459,80/);

  const final = await call('finalize_invoice', { draft_id: draft.draft_id });
  assert.ok(!final.isError);
  assert.equal(JSON.parse(final.content[0]?.text ?? '{}').number, '2026-001');
  assert.equal((await lastAudit(ctx))?.approval, 'owner');
  assert.equal(asked.length, 4);
});

test('a yes that arrives after the assistant gave up runs nothing', async () => {
  const ctx = await makeCtx();
  const customer = await seed(ctx);
  const draft = await invoices.createInvoice(ctx, { contact_id: customer, lines: [{ description: 'Werk', quantity: 1, unit_price: 100 }] });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(ctx).connect(serverSide);
  const client = new Client({ name: 'test', version: '0' }, { capabilities: { elicitation: {} } });
  client.setRequestHandler(ElicitRequestSchema, async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { action: 'accept', content: {} };
  });
  await client.connect(clientSide);

  await assert.rejects(client.callTool({ name: 'finalize_invoice', arguments: { draft_id: draft.draft_id } }, undefined, { timeout: 100 }), /timed out/i);
  // Wait until the server has finished with the call and written its audit line.
  for (let tries = 0; tries < 40 && (await lastAudit(ctx))?.tool !== 'finalize_invoice'; tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal((await store.getInvoice(ctx.db, draft.draft_id)).status, 'draft');
  assert.match((await lastAudit(ctx))?.outcome ?? '', /^error: Bookiz kon je niet om bevestiging vragen/);
});

test('the send question names the address the e-mail really goes to', async () => {
  const ctx = await makeCtx({ mailOnlyTo: 'sam@voorbeeld.test' });
  const customer = await seed(ctx);
  const draft = await invoices.createInvoice(ctx, { contact_id: customer, lines: [{ description: 'Werk', quantity: 1, unit_price: 100 }] });
  const invoice = await invoices.finalizeInvoice(ctx, draft.draft_id);
  const { asked, call } = await connectWithForms(ctx, ['decline', 'accept']);

  const refused = await call('send_invoice', { number: invoice.number, message: 'Hierbij de factuur.' });
  assert.equal(refused.isError, true);
  assert.equal(ctx.sent.length, 0, 'a no sends nothing');
  // During a trial the invoice only goes to the owner, so that is what the owner is asked about.
  assert.match(asked[0] ?? '', /naar sam@voorbeeld\.test\?/);
  assert.doesNotMatch(asked[0] ?? '', /klant\.test/);
  assert.match(asked[0] ?? '', /Hierbij de factuur\./);

  const sent = await call('send_invoice', { number: invoice.number });
  assert.ok(!sent.isError);
  assert.equal(ctx.sent.length, 1);
  assert.equal((await lastAudit(ctx))?.approval, 'owner');
});

test('credit and filing are confirmed with their own figures', async () => {
  const ctx = await makeCtx();
  const customer = await seed(ctx);
  ctx.setNow('2026-10-05T10:00:00Z');
  const draft = await invoices.createInvoice(ctx, { contact_id: customer, issue_date: '2026-09-10', lines: [{ description: 'Werk', quantity: 1, unit_price: 100 }] });
  const invoice = await invoices.finalizeInvoice(ctx, draft.draft_id);
  const { asked, call } = await connectWithForms(ctx, ['accept', 'accept']);

  assert.ok(!(await call('mark_vat_return_filed', { period: '2026-Q3', filed_on: '2026-10-04' })).isError);
  assert.match(asked[0] ?? '', /2026-Q3 vastleggen als ingediend op 04-10-2026\? Te betalen: € 21\./);

  assert.ok(!(await call('credit_invoice', { number: invoice.number, reason: 'dubbel' })).isError);
  assert.match(asked[1] ?? '', /Factuur 2026-001 aan Klant BV van € 121,00 crediteren\? .*-€ 121,00.* Reden: dubbel/);
});

test('without a form the assistant’s word counts, and the audit log says whose yes it was', async () => {
  const ctx = await makeCtx();
  const customer = await seed(ctx);
  const draft = await invoices.createInvoice(ctx, { contact_id: customer, lines: [{ description: 'Werk', quantity: 1, unit_price: 100 }] });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(ctx).connect(serverSide);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(clientSide);

  const final = (await client.callTool({ name: 'finalize_invoice', arguments: { draft_id: draft.draft_id } })) as ToolResult;
  assert.equal(final.isError, undefined);
  assert.equal((await lastAudit(ctx))?.approval, 'assistant');

  await client.callTool({ name: 'save_contact', arguments: { name: 'Nieuwe klant' } });
  assert.equal((await lastAudit(ctx))?.approval, null, 'only steps that cannot be taken back carry an approval');
});

test('over stateless HTTP Bookiz cannot hold a question open, so it falls back to the assistant', async () => {
  const token = 'test-token-with-at-least-24-characters';
  const ctx = await makeCtx({ mode: 'http', token });
  const customer = await seed(ctx);
  const draft = await invoices.createInvoice(ctx, { contact_id: customer, lines: [{ description: 'Werk', quantity: 1, unit_price: 100 }] });
  const server = createHttp(ctx).listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const client = new Client({ name: 'test', version: '0' }, { capabilities: { elicitation: {} } });
    let asked = 0;
    client.setRequestHandler(ElicitRequestSchema, async () => {
      asked += 1;
      return { action: 'decline' };
    });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
    const final = (await client.callTool({ name: 'finalize_invoice', arguments: { draft_id: draft.draft_id } })) as ToolResult;
    assert.equal(final.isError, undefined);
    assert.equal(asked, 0);
    assert.equal((await lastAudit(ctx))?.approval, 'assistant');
    await client.close();
  } finally {
    server.close();
    server.closeAllConnections();
  }
});

test('the export carries the audit log of its own calendar year, as it was written', async () => {
  const ctx = await makeCtx();
  await seed(ctx);
  // 1 January starts at 23:00 UTC the evening before.
  for (const [n, at] of [
    [0, '2025-12-31T22:30:00Z'],
    [1, '2025-12-31T23:30:00Z'],
    [2, '2026-12-31T22:30:00Z'],
    [3, '2026-12-31T23:30:00Z'],
  ] as const) {
    await ctx.db.query(`insert into audit_log (at, tool, input, outcome) values ($1, 'probe', $2::jsonb, 'ok')`, [at, JSON.stringify({ n })]);
  }
  const probes = async (year: number) =>
    (await store.listAudit(ctx.db, year)).filter((entry) => entry.tool === 'probe').map((entry) => (entry.input as { n: number }).n);
  assert.deepEqual(await probes(2025), [0]);
  assert.deepEqual(await probes(2026), [1, 2]);
  assert.deepEqual(await probes(2027), [3]);

  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(ctx).connect(serverSide);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(clientSide);
  await client.callTool({ name: 'record_expense', arguments: { date: '2026-11-10', vendor: 'Café', amount: 54.5, vat_amount: 4.5, category: 'eten_drinken_horeca' } });
  // The database stamps the real time; pin it so the test does not depend on the year it runs in.
  await ctx.db.query(`update audit_log set at = '2026-11-10T10:00:00Z' where tool = 'record_expense'`);

  const exported = (await client.callTool({ name: 'export_books', arguments: { year: 2026 } })) as ToolResult;
  const log = JSON.parse(exported.content[0]?.text ?? '{}').audit_log as { tool: string; input: Record<string, unknown>; at: string }[];
  const entry = log.find((line) => line.tool === 'record_expense');
  assert.equal(entry?.input.amount, 54.5, 'amounts in the log stay as the assistant sent them');
  assert.equal(entry?.at, '2026-11-10T10:00:00.000Z');
});
