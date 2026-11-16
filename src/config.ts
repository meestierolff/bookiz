import { homedir } from 'node:os';
import { join } from 'node:path';
import { BookizError } from './errors.ts';

export type Mode = 'stdio' | 'http';

export type Config = {
  mode: Mode;
  dataDir: string;
  databaseUrl: string | undefined;
  port: number;
  publicUrl: string | undefined;
  token: string | undefined;
  /** Separate, optional secret for clients that can only be given a URL. */
  urlToken: string | undefined;
  smtpUrl: string | undefined;
  mailFrom: string | undefined;
  receiptArchive: 'email' | 'folder';
};

export function loadConfig(mode: Mode, env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = env.BOOKIZ_DATA_DIR ?? join(homedir(), '.bookiz');
  const smtpUrl = env.SMTP_URL || undefined;
  const requested = env.RECEIPT_ARCHIVE;
  if (requested && requested !== 'email' && requested !== 'folder') {
    throw new BookizError('RECEIPT_ARCHIVE moet "email" of "folder" zijn.');
  }
  if (requested === 'email' && !smtpUrl) {
    throw new BookizError('RECEIPT_ARCHIVE=email vraagt om SMTP_URL.');
  }
  const token = env.BOOKIZ_TOKEN || undefined;
  if (mode === 'http' && (!token || token.length < 24)) {
    throw new BookizError(
      'BOOKIZ_TOKEN ontbreekt of is korter dan 24 tekens.',
      'Maak er een met: openssl rand -hex 24',
    );
  }
  const urlToken = env.BOOKIZ_URL_TOKEN || undefined;
  if (urlToken && (urlToken.length < 24 || urlToken === token)) {
    throw new BookizError(
      'BOOKIZ_URL_TOKEN moet minstens 24 tekens zijn en mag niet gelijk zijn aan BOOKIZ_TOKEN.',
      'Een adres met een geheim erin lekt makkelijker; daarom krijgt het een eigen geheim dat je los kunt vervangen.',
    );
  }
  return {
    mode,
    dataDir,
    databaseUrl: env.DATABASE_URL || undefined,
    port: Number(env.PORT ?? 8787),
    publicUrl: env.PUBLIC_URL?.replace(/\/+$/, '') || undefined,
    token,
    urlToken,
    smtpUrl,
    mailFrom: env.MAIL_FROM || undefined,
    receiptArchive: (requested as 'email' | 'folder' | undefined) ?? (smtpUrl ? 'email' : 'folder'),
  };
}
