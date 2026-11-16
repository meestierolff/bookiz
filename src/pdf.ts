import PDFDocument from 'pdfkit';
import { formatDutchDate } from './core/dates.ts';
import { formatEur } from './core/money.ts';
import type { Business, Contact, Invoice } from './core/types.ts';
import { invoiceTotals, lineNet, SALE_VAT_LABELS, saleRate } from './core/vat.ts';
import type { RuleSet } from './rules.ts';

const INK = '#16181d';
const MUTED = '#6b7280';
const RULE = '#d9dce1';
const LEFT = 56;
const RIGHT = 539;

/** Statements the Belastingdienst requires on invoices without Dutch btw. */
export function invoiceRemarks(invoice: Invoice): string[] {
  const codes = new Set(invoice.lines.map((line) => line.vat_code));
  const remarks: string[] = [];
  if (codes.has('eu_reverse_charge')) remarks.push('Btw verlegd.');
  if (codes.has('kor')) remarks.push('Geen btw berekend: de kleineondernemersregeling (KOR) is van toepassing.');
  if (codes.has('exempt')) remarks.push('Geen btw berekend: er is een btw-vrijstelling van toepassing.');
  return remarks;
}

export function renderInvoicePdf(invoice: Invoice, business: Business, contact: Contact, rules: RuleSet): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: LEFT, info: { Title: `Factuur ${invoice.number ?? 'concept'}` } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const isCredit = invoice.total_cents < 0;
  const totals = invoiceTotals(invoice.lines, rules);

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(16).text(business.name, LEFT, 56);
  doc.font('Helvetica').fontSize(9).fillColor(MUTED);
  const sender = [
    business.address_line,
    [business.postal_code, business.city].filter(Boolean).join(' '),
    business.email,
    business.kvk_number && `KvK ${business.kvk_number}`,
    business.vat_id && `Btw-id ${business.vat_id}`,
    business.iban && `IBAN ${business.iban}`,
  ].filter(Boolean) as string[];
  doc.text(sender.join('\n'), LEFT, 80, { lineGap: 2 });

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(22);
  doc.text(isCredit ? 'Creditfactuur' : 'Factuur', 300, 56, { width: RIGHT - 300, align: 'right' });
  if (invoice.status === 'draft') {
    doc.fontSize(10).fillColor('#b45309').text('CONCEPT, nog niet definitief', 300, 84, { width: RIGHT - 300, align: 'right' });
  }

  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('FACTUUR AAN', LEFT, 190, { characterSpacing: 0.6 });
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(contact.name, LEFT, 204);
  doc.font('Helvetica').fontSize(10);
  const recipient = [
    contact.address_line,
    [contact.postal_code, contact.city].filter(Boolean).join(' '),
    contact.country !== 'NL' ? contact.country : null,
    contact.vat_id && `Btw-id ${contact.vat_id}`,
  ].filter(Boolean) as string[];
  doc.text(recipient.join('\n'), LEFT, 220, { lineGap: 2 });

  const meta: [string, string][] = [
    ['Factuurnummer', invoice.number ?? 'concept'],
    ['Factuurdatum', formatDutchDate(invoice.issue_date)],
    ['Leverdatum', formatDutchDate(invoice.supply_date ?? invoice.issue_date)],
    ['Vervaldatum', formatDutchDate(invoice.due_date)],
  ];
  let y = 204;
  for (const [label, value] of meta) {
    doc.fillColor(MUTED).fontSize(9).text(label, 360, y, { width: 90 });
    doc.fillColor(INK).fontSize(10).text(value, 450, y, { width: RIGHT - 450, align: 'right' });
    y += 16;
  }

  y = 310;
  const columns = { description: LEFT, quantity: 318, price: 368, vat: 438, amount: 478 };
  doc.fillColor(MUTED).fontSize(8);
  doc.text('OMSCHRIJVING', columns.description, y, { characterSpacing: 0.6 });
  doc.text('AANTAL', columns.quantity, y, { width: 44, align: 'right', characterSpacing: 0.6 });
  doc.text('PRIJS', columns.price, y, { width: 64, align: 'right', characterSpacing: 0.6 });
  doc.text('BTW', columns.vat, y, { width: 36, align: 'right', characterSpacing: 0.6 });
  doc.text('BEDRAG', columns.amount, y, { width: RIGHT - columns.amount, align: 'right', characterSpacing: 0.6 });
  y += 14;
  doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(RULE).lineWidth(1).stroke();
  y += 8;

  doc.fillColor(INK).fontSize(10);
  for (const line of invoice.lines) {
    const height = doc.heightOfString(line.description, { width: 250 });
    if (y + height > 700) {
      doc.addPage();
      y = 56;
    }
    const rate = saleRate(line.vat_code, rules);
    doc.text(line.description, columns.description, y, { width: 250 });
    doc.text(String(line.quantity).replace('.', ','), columns.quantity, y, { width: 44, align: 'right' });
    doc.text(formatEur(line.unit_price_cents), columns.price, y, { width: 64, align: 'right' });
    doc.text(rate > 0 || line.vat_code === 'zero' ? `${rate}%` : '-', columns.vat, y, { width: 36, align: 'right' });
    doc.text(formatEur(lineNet(line)), columns.amount, y, { width: RIGHT - columns.amount, align: 'right' });
    y += height + 8;
  }

  doc.moveTo(LEFT, y).lineTo(RIGHT, y).strokeColor(RULE).stroke();
  y += 12;
  const totalRow = (label: string, value: string, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10);
    doc.fillColor(bold ? INK : MUTED).text(label, 300, y, { width: 150 });
    doc.fillColor(INK).text(value, 450, y, { width: RIGHT - 450, align: 'right' });
    y += bold ? 22 : 16;
  };
  totalRow('Subtotaal', formatEur(totals.net_cents));
  for (const group of totals.groups) {
    if (group.rate > 0) totalRow(`Btw ${group.rate}% over ${formatEur(group.net_cents)}`, formatEur(group.vat_cents));
    else totalRow(`${SALE_VAT_LABELS[group.vat_code]} over ${formatEur(group.net_cents)}`, formatEur(0));
  }
  y += 4;
  totalRow(isCredit ? 'Te ontvangen' : 'Totaal te betalen', formatEur(totals.total_cents), true);

  y += 18;
  doc.font('Helvetica').fontSize(10).fillColor(INK);
  const closing = [...invoiceRemarks(invoice)];
  if (invoice.note) closing.push(invoice.note);
  if (!isCredit && business.iban) {
    closing.push(
      `Maak ${formatEur(totals.total_cents)} uiterlijk ${formatDutchDate(invoice.due_date)} over op ${business.iban} ` +
        `ten name van ${business.name}, onder vermelding van factuurnummer ${invoice.number ?? '(volgt)'}.`,
    );
  }
  doc.text(closing.join('\n\n'), LEFT, y, { width: RIGHT - LEFT, lineGap: 2 });

  doc.end();
  return done;
}
