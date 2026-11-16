import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { BlockList, isIP } from 'node:net';
import { basename, join } from 'node:path';
import type { Config } from './config.ts';
import { BookizError } from './errors.ts';
import type { Mailer } from './mail.ts';
import { formatEur } from './core/money.ts';
import type { Business, Expense, Receipt } from './core/types.ts';


const TYPES: { ext: string; mime: string; test: (b: Buffer) => boolean }[] = [
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 },
  { ext: 'png', mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) },
  { ext: 'pdf', mime: 'application/pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.subarray(8, 12).toString('latin1') === 'WEBP' },
  {
    ext: 'heic',
    mime: 'image/heic',
    test: (b) => b.subarray(4, 8).toString('latin1') === 'ftyp' && /hei|mif1|msf1/.test(b.subarray(8, 12).toString('latin1')),
  },
];

/** Decide the file type from the bytes themselves; a claimed name or MIME type proves nothing. */
export function sniff(bytes: Buffer): { ext: string; mime: string } {
  const type = TYPES.find((candidate) => candidate.test(bytes));
  if (!type) {
    throw new BookizError('Dit bestand is geen foto of pdf.', 'Een bon moet een JPG, PNG, WEBP, HEIC of PDF zijn.');
  }
  return type;
}

export type ReceiptSource = { file_path?: string; content_base64?: string; url?: string };

export async function loadReceiptBytes(source: ReceiptSource, config: Config): Promise<Buffer> {
  const given = [source.file_path, source.content_base64, source.url].filter(Boolean).length;
  if (given !== 1) throw new BookizError('Geef precies één van file_path, content_base64 of url.');
  let bytes: Buffer;
  if (source.file_path) {
    // A path only means something when the server runs on the user's own machine.
    if (config.mode !== 'stdio') {
      throw new BookizError(
        'file_path werkt alleen als Bookiz lokaal draait.',
        'Gebruik de uploadlink van deze uitgave, of geef content_base64 of een https-url.',
      );
    }
    bytes = await readFile(source.file_path);
  } else if (source.content_base64) {
    bytes = Buffer.from(source.content_base64.replace(/^data:[^,]*,/, ''), 'base64');
  } else {
    bytes = await download(source.url as string, config);
  }
  if (bytes.length === 0) throw new BookizError('Het bestand is leeg.');
  if (bytes.length > config.maxReceiptBytes) throw new BookizError(tooLarge(config));
  return bytes;
}

/** Everything that is not a public unicast address: loopback, private, link-local, CGNAT, mapped and translated ranges. */
const NOT_PUBLIC = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 3],
] as const) {
  NOT_PUBLIC.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 127],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  NOT_PUBLIC.addSubnet(network, prefix, 'ipv6');
}

export function tooLarge(config: Config): string {
  return `Het bestand is groter dan ${Math.floor(config.maxReceiptBytes / (1024 * 1024))} MB.`;
}

function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  return family === 0 || NOT_PUBLIC.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

/**
 * An agent supplies this URL, so treat it as hostile: https only, no internal
 * hosts, no redirects, and a hard size cap while reading. The name is resolved
 * again by fetch, so a host that changes its DNS answer in between can still
 * aim one blind request at an internal address; the certificate check and the
 * file-type sniffing limit what that can achieve.
 */
async function download(rawUrl: string, config: Config): Promise<Buffer> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BookizError('De url van de bon is ongeldig.');
  }
  if (url.protocol !== 'https:') throw new BookizError('Een bon ophalen kan alleen via https.');
  const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new BookizError('Deze url verwijst niet naar een openbaar adres.');
  }
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new BookizError(`De bon kon niet worden opgehaald (HTTP ${response.status}).`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.length;
    if (size > config.maxReceiptBytes) throw new BookizError(tooLarge(config));
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Store the original outside the database. With e-mail the owner's own mailbox
 * is the archive; the ledger keeps only a hash and the Message-ID, so the
 * document can be found again and shown to be unchanged.
 */
export async function archiveReceipt(
  bytes: Buffer,
  expense: Expense,
  business: Business,
  deps: { config: Config; mail: Mailer },
): Promise<Receipt> {
  const type = sniff(bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const filename = `${expense.ref}-${expense.date}-${slug(expense.vendor)}.${type.ext}`;
  const base = { sha256, filename, bytes: bytes.length, archived_at: new Date().toISOString() };

  if (deps.config.receiptArchive === 'email') {
    const to = deps.config.receiptsOnlyTo ?? business.archive_email ?? business.email ?? deps.config.fallbackArchiveEmail;
    if (!to) {
      throw new BookizError(
        'Er is geen e-mailadres om bonnen naar te sturen.',
        'Stel archive_email in met setup_business.',
      );
    }
    const { messageId } = await deps.mail({
      to,
      subject: `[Bookiz bon] ${expense.ref} · ${expense.date} · ${expense.vendor} · ${formatEur(expense.total_cents)}`,
      text: [
        'Dit is het bewijsstuk bij een uitgave in je Bookiz-administratie.',
        'Bewaar deze e-mail zeven jaar: je mailbox is het archief, Bookiz bewaart het bestand zelf niet.',
        '',
        `Uitgave: ${expense.ref}`,
        `Datum: ${expense.date}`,
        `Leverancier: ${expense.vendor}`,
        `Bedrag: ${formatEur(expense.total_cents)} (waarvan btw ${formatEur(expense.vat_cents)})`,
        `Controlegetal (SHA-256): ${sha256}`,
      ].join('\n'),
      attachments: [{ filename, content: bytes, contentType: type.mime }],
    });
    return { ...base, archive: 'email', location: messageId };
  }

  const relative = join('receipts', expense.date.slice(0, 4), filename);
  const target = join(deps.config.dataDir, relative);
  await mkdir(join(deps.config.dataDir, 'receipts', expense.date.slice(0, 4)), { recursive: true });
  await writeFile(target, bytes, { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error;
    throw new BookizError(`Er staat al een bon voor ${expense.ref} in het archief.`);
  });
  return { ...base, archive: 'folder', location: relative };
}

function slug(value: string): string {
  const cleaned = basename(value)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return cleaned.slice(0, 40) || 'bon';
}

/**
 * Unguessable but stateless links: the signature ties a public URL to one
 * document. The signing key is derived from the server token and is never sent
 * anywhere, so neither a leaked link nor a leaked URL secret can forge another.
 */
type LinkConfig = Pick<Config, 'token' | 'linkScope'>;

export function sign(config: Pick<Config, 'token'>, subject: string): string {
  const key = createHmac('sha256', config.token ?? '').update('link-signing-v1').digest();
  return createHmac('sha256', key).update(subject).digest('hex').slice(0, 32);
}

export function verifySignature(config: Pick<Config, 'token'>, subject: string, signature: string): boolean {
  const expected = Buffer.from(sign(config, subject));
  const given = Buffer.from(signature);
  return Boolean(config.token) && expected.length === given.length && timingSafeEqual(expected, given);
}

type LinkKind = 'bon' | 'factuur';

/** The signed subject carries the scope, so a link for one administration is worthless in another. */
function linkSubject(config: LinkConfig, kind: LinkKind, id: string): string {
  return `${config.linkScope}:${kind}:${id}`;
}

export function verifyLink(config: LinkConfig, kind: LinkKind, id: string, signature: string): boolean {
  return verifySignature(config, linkSubject(config, kind, id), signature);
}

export function uploadLink(config: Config, expenseRef: string): string | null {
  if (config.mode !== 'http' || !config.publicUrl) return null;
  return `${config.publicUrl}${config.linkScope}/bon/${expenseRef}/${sign(config, linkSubject(config, 'bon', expenseRef))}`;
}

export function invoiceLink(config: Config, number: string): string | null {
  if (config.mode !== 'http' || !config.publicUrl) return null;
  return `${config.publicUrl}${config.linkScope}/factuur/${number}/${sign(config, linkSubject(config, 'factuur', number))}.pdf`;
}
