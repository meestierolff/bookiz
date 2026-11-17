import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Ctx } from './app/context.ts';
import { inEuros, todayOf } from './app/context.ts';
import { setupBusiness } from './app/business.ts';
import * as expenses from './app/expenses.ts';
import * as invoices from './app/invoices.ts';
import * as recurring from './app/recurring.ts';
import * as reports from './app/reports.ts';
import { importOpeningState } from './app/switch.ts';
import { CATEGORIES } from './core/categories.ts';
import { toCents } from './core/money.ts';
import { EXPENSE_VAT_TREATMENTS, SALE_VAT_CODES } from './core/types.ts';
import { BookizError } from './errors.ts';
import * as store from './store.ts';

export const VERSION = '0.1.0';

const INSTRUCTIONS = `Bookiz is the bookkeeping of one Dutch eenmanszaak (sole proprietor). You operate it for the owner.

How to work:
- Start with get_overview when you do not know the state of the books. It tells you what needs attention.
- Speak Dutch with the owner unless they write in another language. Amounts are euros.
- Never invent a figure. Read amounts, dates and btw from the receipt or ask. If a receipt is unreadable, say so.
- The engine decides the tax treatment from rules in /rules; you supply facts. If a result surprises you, call get_tax_rules and show the source instead of working around it.
- Show a draft invoice to the owner and get a yes before finalize_invoice. Final invoices and filed btw periods cannot be changed, only reversed.
- Ask before send_invoice and before mark_vat_return_filed. Bookiz never files with the Belastingdienst itself.
- Results are calculations under published rules, not tax advice. Say so when the owner is about to rely on a number for the income tax return.`;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').describe('Calendar date, YYYY-MM-DD');
const euros = z.number().describe('Amount in euros, at most two decimals, e.g. 121.00');
const optionalText = z.string().trim().min(1).max(500).optional();

type Shape = Record<string, z.ZodType>;

/** Build a fresh MCP server around one application context. */
export function createServer(ctx: Ctx): McpServer {
  const server = new McpServer(
    {
      name: 'bookiz',
      title: 'Bookiz',
      version: VERSION,
      websiteUrl: 'https://boekiehouder.nl',
      icons: [{ src: 'https://boekiehouder.nl/icon-192.png', mimeType: 'image/png', sizes: ['192x192'] }],
    },
    { instructions: INSTRUCTIONS },
  );

  function tool<S extends Shape>(
    name: string,
    config: {
      title: string;
      description: string;
      input: S;
      /** Changes nothing at all. */
      readOnly?: boolean;
      /** Changes or reverses something that exists, as opposed to only adding a new record. */
      changes?: boolean;
      /** Reaches outside Bookiz: sends e-mail or fetches a file. */
      outbound?: boolean;
      /** Still allowed when the administration is locked, and not worth an audit line. */
      housekeeping?: boolean;
      meta?: Record<string, unknown>;
    },
    run: (args: z.infer<z.ZodObject<S>>) => Promise<unknown> | unknown,
  ): void {
    server.registerTool(
      name,
      {
        title: config.title,
        description: config.description,
        inputSchema: config.input,
        // Honest hints let a client ask the owner before a step that cannot be taken back or leaves the system.
        annotations: {
          readOnlyHint: Boolean(config.readOnly),
          destructiveHint: Boolean(config.changes),
          openWorldHint: Boolean(config.outbound),
        },
        ...(config.meta ? { _meta: config.meta } : {}),
      },
      (async (args: z.infer<z.ZodObject<S>>) => {
        let outcome = 'ok';
        try {
          if (ctx.locked && !config.readOnly && !config.housekeeping) throw new BookizError(ctx.locked);
          const result = await run(args);
          return { content: [{ type: 'text' as const, text: JSON.stringify(inEuros(result), null, 2) }] };
        } catch (error) {
          const known = error instanceof BookizError;
          if (!known) console.error(`[bookiz] ${name} failed`, error);
          const message = known ? error.message : 'Er ging iets mis in Bookiz; er is niets gewijzigd.';
          const hint = known ? error.hint : 'Kijk in het serverlog voor de oorzaak.';
          outcome = `error: ${message}`;
          return {
            isError: true,
            content: [{ type: 'text' as const, text: hint ? `${message}\nWat nu: ${hint}` : message }],
          };
        } finally {
          if (!config.readOnly && !config.housekeeping) {
            // The audit trail must never contain the document itself.
            const { content_base64: _omitted, ...logged } = args as Record<string, unknown>;
            await store.logAudit(ctx.db, name, logged, outcome).catch((e) => console.error('[bookiz] audit failed', e));
          }
        }
      }) as never,
    );
  }

  tool(
    'get_overview',
    {
      title: 'Overzicht',
      description:
        'The state of the books right now: open btw periods and deadlines, unpaid and overdue invoices, expenses without a receipt, profit this year, an indication of what to set aside for tax, and a list of next actions. Call this first. It also prepares a draft for any recurring invoice that has come due; it never finalizes or sends anything.',
      input: {},
      housekeeping: true,
    },
    () => reports.overview(ctx),
  );

  tool(
    'setup_business',
    {
      title: 'Bedrijfsgegevens',
      description:
        'Create or update the business profile. Only pass fields that change. Name, address, KvK-nummer, IBAN and (unless the KOR applies) btw-id are legally required on invoices. kor_since is the first day of the kleineondernemersregeling (omit when the business charges btw); kor_until is the last day it applied, set only when the owner left the KOR. Neither may change how documents already booked are treated.',
      changes: true,
      input: {
        name: optionalText,
        owner_name: optionalText,
        address_line: optionalText,
        postal_code: optionalText,
        city: optionalText,
        kvk_number: z.string().regex(/^\d{8}$/, 'KvK-nummer is 8 digits').optional(),
        vat_id: z.string().regex(/^NL\d{9}B\d{2}$/, 'Dutch btw-id looks like NL123456789B01').optional(),
        iban: z.string().regex(/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/, 'IBAN without spaces').optional(),
        email: z.email().optional().describe('Shown on invoices; receives a copy of every sent invoice'),
        archive_email: z.email().optional().describe('Mailbox that receives receipts as its archive; defaults to email'),
        kor_since: date.nullable().optional(),
        kor_until: date.nullable().optional(),
        vat_period: z
          .enum(['month', 'quarter', 'year'])
          .optional()
          .describe('How often the Belastingdienst wants a btw-aangifte: quarter (the default), month, or year when the Belastingdienst approved a yearly return. Set it before booking anything; it cannot change afterwards.'),
        payment_term_days: z.number().int().min(0).max(365).optional(),
      },
    },
    (args) => setupBusiness(ctx, args),
  );

  tool(
    'set_year_facts',
    {
      title: 'Jaargegevens',
      description:
        'Facts about a tax year that documents cannot show. hours_criterion: did the owner work at least 1,225 hours in the business (needed for zelfstandigenaftrek). starter: entitled to startersaftrek. wage_income: gross wage from employment that year, used only to estimate how much tax to set aside. Ask the owner; do not assume.',
      changes: true,
      input: {
        year: z.number().int().min(2020).max(2100),
        hours_criterion: z.boolean().optional(),
        starter: z.boolean().optional(),
        wage_income: euros.nonnegative().nullable().optional(),
      },
    },
    async (args) => {
      const current = await store.getTaxYear(ctx.db, args.year);
      const next = {
        year: args.year,
        hours_criterion: args.hours_criterion ?? current.hours_criterion,
        starter: args.starter ?? current.starter,
        wage_income_cents:
          args.wage_income === undefined ? current.wage_income_cents : args.wage_income === null ? null : toCents(args.wage_income),
      };
      if (next.starter && !next.hours_criterion) {
        throw new BookizError('Startersaftrek bestaat alleen samen met de zelfstandigenaftrek, dus alleen als het urencriterium is gehaald.');
      }
      await store.saveTaxYear(ctx.db, next);
      return next;
    },
  );

  tool(
    'save_contact',
    {
      title: 'Relatie opslaan',
      description:
        'Create a customer (omit id) or update one (pass id). Name and address are required on an invoice. vat_id is required to invoice an EU business with btw verlegd. country is an ISO code such as NL, BE, DE, US.',
      changes: true,
      input: {
        id: z.number().int().optional(),
        name: optionalText,
        email: z.email().optional(),
        address_line: optionalText,
        postal_code: optionalText,
        city: optionalText,
        country: z.string().regex(/^[A-Z]{2}$/).optional(),
        vat_id: optionalText,
        kvk_number: optionalText,
      },
    },
    ({ id, ...patch }) => store.saveContact(ctx.db, id, patch),
  );

  tool(
    'find_contacts',
    {
      title: 'Relaties zoeken',
      description: 'Find customers by part of their name or e-mail address. Without a query it lists all of them. Check here before creating a new contact.',
      input: { query: z.string().optional() },
      readOnly: true,
    },
    async ({ query }) => ({ contacts: await store.findContacts(ctx.db, query) }),
  );

  tool(
    'create_invoice',
    {
      title: 'Conceptfactuur',
      description:
        'Create a draft invoice, or replace one by passing draft_id. A draft has no number and changes nothing in the books. unit_price is excluding btw. vat_code per line: high (21%, the default), low (9%), zero, exempt, eu_reverse_charge (services to a business in another EU country, btw verlegd), outside_eu (services to a customer outside the EU). Under the KOR every line is invoiced without btw automatically. Show the result to the owner before finalize_invoice.',
      changes: true,
      input: {
        draft_id: z.number().int().optional(),
        contact_id: z.number().int(),
        lines: z
          .array(
            z.object({
              description: z.string().trim().min(1).max(500),
              quantity: z.number().describe('Hours, days or pieces; decimals allowed'),
              unit_price: euros,
              vat_code: z.enum(SALE_VAT_CODES).optional(),
            }),
          )
          .min(1)
          .max(50),
        issue_date: date.optional().describe('Defaults to today'),
        supply_date: date.optional().describe('Date the service was delivered, when it differs from the invoice date'),
        payment_term_days: z.number().int().min(0).max(365).optional(),
        note: z.string().max(1000).optional(),
      },
    },
    (args) => invoices.createInvoice(ctx, args),
  );

  tool(
    'finalize_invoice',
    {
      title: 'Factuur definitief maken',
      description:
        'Turn a draft into a final invoice: it gets the next consecutive number, a PDF, and counts for btw and profit. This cannot be undone, only reversed with credit_invoice. Only call after the owner approved the draft.',
      changes: true,
      input: { draft_id: z.number().int() },
    },
    ({ draft_id }) => invoices.finalizeInvoice(ctx, draft_id),
  );

  tool(
    'send_invoice',
    {
      title: 'Factuur versturen',
      description:
        'E-mail a final invoice as PDF to the customer, with a copy to the owner. Needs SMTP on the server. Ask the owner before sending; this leaves the building.',
      outbound: true,
      input: {
        number: z.string().describe('Invoice number, e.g. 2026-001'),
        to: z.email().optional().describe('Overrides the customer e-mail address'),
        message: z.string().max(4000).optional().describe('Plain-text body; a polite Dutch default is used when omitted'),
      },
    },
    (args) => invoices.sendInvoice(ctx, args),
  );

  tool(
    'register_payment',
    {
      title: 'Betaling registreren',
      description: 'Mark a final invoice as paid on a date (default today). Pass paid_on: null to undo a mistake.',
      changes: true,
      input: { number: z.string(), paid_on: date.nullable().optional() },
    },
    (args) => invoices.registerPayment(ctx, args),
  );

  tool(
    'credit_invoice',
    {
      title: 'Factuur crediteren',
      description:
        'Reverse a final invoice with a creditfactuur dated today. Use this for any mistake on a final invoice, then create a correct new one.',
      changes: true,
      input: { number: z.string(), reason: z.string().max(500).optional() },
    },
    (args) => invoices.creditInvoice(ctx, args),
  );

  tool(
    'list_invoices',
    {
      title: 'Facturen',
      description: 'List invoices, optionally for one year or one status: concept, open, "te laat" (past the due date) or betaald.',
      input: { year: z.number().int().optional(), status: z.enum(['concept', 'open', 'te laat', 'betaald']).optional() },
      readOnly: true,
    },
    (args) => invoices.listInvoices(ctx, args),
  );

  tool(
    'save_recurring_invoice',
    {
      title: 'Periodieke factuur',
      description:
        'Create (omit id), change or stop (active: false) an invoice that repeats every 1, 3 or 12 months, for example a monthly retainer. On each date Bookiz prepares a draft, never a final invoice; get_overview reports the draft and the owner approves it as usual.',
      changes: true,
      input: {
        id: z.number().int().optional(),
        contact_id: z.number().int().optional(),
        lines: z
          .array(
            z.object({
              description: z.string().trim().min(1).max(500),
              quantity: z.number(),
              unit_price: euros,
              vat_code: z.enum(SALE_VAT_CODES).optional(),
            }),
          )
          .min(1)
          .max(50)
          .optional(),
        every_months: z.union([z.literal(1), z.literal(3), z.literal(12)]).optional(),
        next_date: date.optional().describe('The first date a draft should be prepared'),
        note: z.string().max(1000).nullable().optional(),
        active: z.boolean().optional(),
      },
    },
    (args) => recurring.saveRecurringInvoice(ctx, args),
  );

  tool(
    'list_recurring_invoices',
    {
      title: 'Periodieke facturen',
      description: 'The invoices that repeat, with their interval and next date.',
      input: {},
      readOnly: true,
    },
    () => recurring.listRecurring(ctx),
  );

  tool(
    'import_opening_state',
    {
      title: 'Overstappen',
      description: `Take over what is still alive when the owner switches from another bookkeeping package (Moneybird, e-Boekhouden, Jortt, a spreadsheet). Use it once, after setup_business and after creating the customers with save_contact. It does NOT copy the old administration: the owner keeps an export of the old package for seven years.
switch_date: the first day the books are kept here; btw returns and reports start from that day.
last_invoice_number: the year and the highest sequence number already used there, so numbering continues without a gap or duplicate (not needed when switching on 1 January).
open_invoices: invoices sent from the old package that are not paid yet, with their original number and amounts. They appear as outstanding and can be paid or credited here, but do not count again for turnover or btw.
assets: equipment still being depreciated, at its book value on the switch date, with the original purchase price and the remaining years.
If the owner uses another package with an MCP server or export, read the figures from there; never estimate them.`,
      changes: true,
      input: {
        switch_date: date.describe('First day the books are kept in Bookiz, e.g. 2027-01-01. Nothing dated earlier can be booked here afterwards.'),
        last_invoice_number: z.object({ year: z.number().int().min(2020).max(2100), last_used: z.number().int().min(0).max(99999) }).optional(),
        open_invoices: z
          .array(
            z.object({
              number: z.string().trim().min(1).max(40),
              contact_id: z.number().int(),
              issue_date: date,
              due_date: date,
              net: euros.describe('Amount excluding btw'),
              vat: euros.describe('The btw amount on the invoice'),
              vat_code: z.enum(SALE_VAT_CODES).optional(),
              description: optionalText,
            }),
          )
          .max(100)
          .optional(),
        assets: z
          .array(
            z.object({
              description: z.string().trim().min(2).max(200),
              original_cost: euros.positive().describe('Purchase price excluding reclaimable btw'),
              book_value: euros.positive().describe('Value still on the books on the switch date'),
              remaining_years: z.number().int().min(1).max(50),
              residual_value: euros.nonnegative().optional(),
              opening_date: date.optional().describe('Defaults to switch_date'),
            }),
          )
          .max(50)
          .optional(),
      },
    },
    (args) => importOpeningState(ctx, args),
  );

  tool(
    'record_expense',
    {
      title: 'Uitgave boeken',
      description: `Book a business purchase from a receipt or purchase invoice. amount is the total paid including btw; vat_amount is the btw printed on the document (required for Dutch suppliers, 0 if none is shown).
vat_treatment: nl (Dutch supplier, the default), eu_reverse_charge (supplier in another EU country charged no btw, e.g. Google Ireland), non_eu_reverse_charge (supplier outside the EU, e.g. a US SaaS), none (no btw involved: private seller, exempt, insurance).
paid_from: business account, or private when the owner paid with private money.
kind: investment for a durable asset of €450 or more excluding btw (laptop, camera); it is depreciated over useful_life_years (default 5).
category: ${CATEGORIES.map((c) => `${c.key} (${c.examples})`).join('; ')}.
Refuses a likely duplicate unless allow_duplicate is true. Afterwards, store the original with attach_receipt.`,
      input: {
        date,
        vendor: z.string().trim().min(1).max(200),
        description: optionalText,
        amount: euros,
        vat_amount: euros.optional(),
        vat_treatment: z.enum(EXPENSE_VAT_TREATMENTS).optional(),
        category: z.enum(CATEGORIES.map((c) => c.key) as [string, ...string[]]).optional(),
        paid_from: z.enum(['business', 'private']).optional(),
        kind: z.enum(['cost', 'investment']).optional(),
        useful_life_years: z.number().int().min(1).max(50).optional(),
        residual_value: euros.nonnegative().optional(),
        allow_duplicate: z.boolean().optional(),
      },
    },
    (args) => expenses.recordExpense(ctx, args),
  );

  tool(
    'record_mileage',
    {
      title: 'Zakelijke kilometers',
      description:
        'Book business kilometres driven with the owner’s private car at the fixed rate per kilometre. Not for a company car, and not for commuting to an employer.',
      input: { date, km: z.number().int().positive().max(5000), description: z.string().trim().min(3).max(300).describe('From, to and purpose') },
    },
    (args) => expenses.recordMileage(ctx, args),
  );

  tool(
    'attach_receipt',
    {
      title: 'Bewijsstuk bewaren',
      description:
        'Store the original receipt or purchase invoice of an expense (JPG, PNG, WEBP, HEIC or PDF, max 10 MB). Pass exactly one source: file when the app hands you an uploaded file object, file_path when Bookiz runs on the same computer as you, url for an https download link, or content_base64. The file is e-mailed to the owner’s archive mailbox or written to the data folder; the database keeps only a SHA-256 hash. If you cannot pass the file, give the owner the upload link from record_expense.',
      outbound: true,
      input: {
        ref: z.string().describe('Expense reference, e.g. K2026-001'),
        file: z
          .object({
            download_url: z.string(),
            file_id: z.string(),
            mime_type: z.string().optional(),
            file_name: z.string().optional(),
          })
          .optional(),
        file_path: z.string().optional(),
        url: z.url().optional(),
        content_base64: z.string().optional(),
      },
      // ChatGPT fills this field with the user's upload; other clients ignore the hint.
      meta: { 'openai/fileParams': ['file'] },
    },
    ({ ref, ...source }) => expenses.attachReceipt(ctx, ref, source),
  );

  tool(
    'void_expense',
    {
      title: 'Uitgave laten vervallen',
      description: 'Cancel an expense that was booked by mistake. It stays visible with the reason. Not possible once its btw period has been filed.',
      changes: true,
      input: { ref: z.string(), reason: z.string().trim().min(3).max(300) },
    },
    (args) => expenses.voidExpense(ctx, args),
  );

  tool(
    'list_expenses',
    {
      title: 'Uitgaven',
      description: 'List expenses, optionally for one year or only those still missing a receipt.',
      input: { year: z.number().int().optional(), missing_receipt: z.boolean().optional(), include_voided: z.boolean().optional() },
      readOnly: true,
    },
    (args) => expenses.listExpenses(ctx, args),
  );

  tool(
    'vat_return',
    {
      title: 'Btw-aangifte',
      description:
        'The btw-aangifte for a period (2026-Q4, 2026-11, or 2026 for a yearly filer), per rubriek in whole euros exactly as the form of Mijn Belastingdienst Zakelijk asks, with the documents behind every number, the ICP list and the deadline. Without a period it picks the oldest one that still has to be filed. The owner copies the figures into the form; Bookiz does not submit.',
      input: { period: z.string().optional() },
      readOnly: true,
    },
    (args) => reports.vatReturn(ctx, args),
  );

  tool(
    'mark_vat_return_filed',
    {
      title: 'Btw-aangifte afsluiten',
      description:
        'Record that the owner filed the btw-aangifte for a period. This freezes the figures and locks the period. Only call after the owner confirms the filing was actually submitted.',
      changes: true,
      input: { period: z.string(), filed_on: date.optional() },
    },
    (args) => reports.markVatReturnFiled(ctx, args),
  );

  tool(
    'year_report',
    {
      title: 'Jaaroverzicht',
      description:
        'Profit and loss for a year and the steps to taxable profit: omzet, kosten per category, afschrijvingen, kleinschaligheidsinvesteringsaftrek, zelfstandigenaftrek, startersaftrek, MKB-winstvrijstelling, plus an indication of income tax and Zvw to set aside. These are the figures for "winst uit onderneming" in the aangifte inkomstenbelasting.',
      input: { year: z.number().int().optional() },
      readOnly: true,
    },
    (args) => reports.yearReport(ctx, args),
  );

  tool(
    'export_books',
    {
      title: 'Administratie exporteren',
      description:
        'Everything for one year as JSON: business profile, invoices, expenses with receipt hashes, filed btw returns, the year report and the tax rules used. For a bookkeeper, a backup, or leaving Bookiz.',
      input: { year: z.number().int() },
      readOnly: true,
    },
    (args) => reports.exportBooks(ctx, args),
  );

  tool(
    'get_tax_rules',
    {
      title: 'Belastingregels',
      description:
        'The Dutch tax figures Bookiz calculates with for a year (btw rates, KOR limit, zelfstandigenaftrek, MKB-winstvrijstelling, KIA table, kilometre rate, income tax brackets), each with its official source. Pass key for one rule including the literal quote from the source page.',
      input: { year: z.number().int().optional(), key: z.string().optional() },
      readOnly: true,
    },
    (args) => reports.taxRules(args, todayOf(ctx)),
  );

  return server;
}
