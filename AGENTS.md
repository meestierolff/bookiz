# AGENTS.md

Bookiz is an MCP server that keeps the books of one Dutch eenmanszaak. Read
`README.md` first; it is short.

## Commands

- `npm run verify`: typecheck, rule-file check, tests, site build. Run before reporting done.
- `npm test`: tests only, against an in-memory Postgres.
- `npm start`: stdio server. `npm run start:http`: HTTP server.

## Layout

- `rules/`: tax figures per year, each with source and quote. Data, MIT.
- `src/core/`: pure calculations. No database, no clock, no network.
- `src/app/`: use cases. Business rules that need the database.
- `src/server.ts`: the MCP tools. `src/http.ts`: HTTP transport, upload page, PDF links.
- `web/`: static site, built by `web/build.ts` from `web/site.json` and `/rules`.

## Rules for changes

- A tax figure never appears in code. It goes in `rules/nl-<year>.json` with the
  literal quote from the official source. Do not write a figure from memory.
- Money is integer cents inside, euros at the tool boundary. Dates are
  `YYYY-MM-DD` strings.
- Final invoices and filed btw periods are immutable. Corrections are new
  documents, never edits.
- Every new behaviour gets a test that would fail without it.
- Keep it lean: no new tool, table or dependency without a user who asked.
- User-facing text (errors, invoice, site) is Dutch. Code and README are English.
- Schema changes are a new entry at the end of `src/migrations.ts`, never an
  edit of an existing one once it has shipped.
- Do not publish, deploy, send e-mail or create payment links without the
  owner's approval.
