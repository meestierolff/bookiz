#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Ctx } from './app/context.ts';
import { loadConfig } from './config.ts';
import { openDb } from './db.ts';
import { BookizError } from './errors.ts';
import { createHttp } from './http.ts';
import { createMailer } from './mail.ts';
import { createServer, VERSION } from './server.ts';

const HELP = `bookiz ${VERSION}: bookkeeping for Dutch sole proprietors, driven by your AI agent over MCP.

  node src/cli.ts           MCP server over stdio, for Claude Desktop, Claude Code, Codex and other local agents
  node src/cli.ts --http    MCP server over HTTP on PORT (default 8787), for remote agents

Environment:
  BOOKIZ_DATA_DIR   where the embedded database, receipts and PDFs live (default ~/.bookiz)
  DATABASE_URL      use this Postgres instead of the embedded one (Neon, Supabase, Docker)
  BOOKIZ_TOKEN      required with --http: the secret agents must present (at least 24 characters)
  PUBLIC_URL        public https address of this server, enables receipt-upload and invoice links
  SMTP_URL          smtp://user:pass@host:587, for sending invoices and archiving receipts by e-mail
  MAIL_FROM         sender address, e.g. "Jouw Bedrijf <facturen@jouwdomein.nl>"
  RECEIPT_ARCHIVE   "email" or "folder" (default: email when SMTP_URL is set)
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }
  const config = loadConfig(args.includes('--http') ? 'http' : 'stdio');
  const db = await openDb(config);
  const ctx: Ctx = { db, config, mail: createMailer(config), now: () => new Date() };

  const shutdown = async () => {
    await db.close().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (config.mode === 'http') {
    createHttp(ctx).listen(config.port, () => {
      console.error(`[bookiz] MCP over HTTP on port ${config.port}, path /mcp (Authorization: Bearer <BOOKIZ_TOKEN>)`);
    });
    return;
  }
  // stdout carries the protocol in stdio mode; anything human-readable goes to stderr.
  // The assistant ends the session by closing stdin; leave cleanly so the data folder is released.
  process.stdin.on('close', shutdown);
  await createServer(ctx).connect(new StdioServerTransport());
  console.error(`[bookiz] MCP over stdio, data in ${config.databaseUrl ? 'Postgres' : config.dataDir}`);
}

main().catch((error) => {
  console.error(error instanceof BookizError ? `[bookiz] ${error.message}${error.hint ? `\n         ${error.hint}` : ''}` : error);
  process.exit(1);
});
