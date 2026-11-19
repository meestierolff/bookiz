# Parallel run: proving Bookiz on a real administration

Written 18 November 2026. Bookiz has not kept a real administration yet, and
switching has never been tried on a real export (README, Status). Before
anyone relies on its figures, the owner included, one real administration
runs in Bookiz next to the package that keeps it today, and the two are
compared every period.

The order matters: first watch (Bookiz shadows the real books), then propose
(Bookiz's figures are checked before they are used), and only then act
(Bookiz's figures are filed). An assistant can only run a process that already
runs reliably by hand.

## Set up once

1. The current package stays the source of truth. Invoices are made and sent
   from there; the btw-aangifte is filed from there.
2. Keep the shadow apart from any real Bookiz account: a local install with its
   own data folder and no SMTP, so nothing can leave it.

   ```bash
   claude mcp add bookiz-shadow -e BOOKIZ_DATA_DIR=$HOME/.bookiz-shadow -- node /absolute/path/to/bookiz/src/cli.ts
   ```

3. Start on a period boundary, the first day of a quarter or of the year.
   Bring in what was open on that day with `import_opening_state`.

## Every document, both places

- Each sales invoice: `create_invoice` and `finalize_invoice` with the same
  date, customer and lines as in the real package. Never `send_invoice`.
- Each receipt and purchase invoice: `record_expense`, with the original.
- Each business trip by own car: `record_mileage`.

## After every btw period

1. Take the btw-aangifte from the current package, per rubriek, in whole euros.
2. Ask for `vat_return` over the same period in the shadow.
3. Compare every rubriek (1a to 1e, 2a, 3a, 3b, 4a, 4b, 5b) and the total.
   Write each difference in the log below, with the documents behind it.
4. Name the cause of each difference and fix it where it lives:

   | Cause | Fix |
   | --- | --- |
   | A booking mistake, in either package | Correct the booking |
   | A rule that is wrong or missing | An issue or pull request against `rules/nl-<year>.json` |
   | An engine bug | A test that fails, then the fix |
   | A tool description that led the assistant astray | Rewrite the description or the error hint |

5. Read the audit log of the period in `export_books`. Every line whose
   outcome starts with `error:` is a refusal the assistant ran into; the same
   tool failing the same way twice means its description or hint is unclear.
6. Once the real return is filed, `mark_vat_return_filed` in the shadow too, so
   late receipts move to the open period exactly as they would for real.

## After the year

- Compare `year_report` with the profit from the current package or the
  bookkeeper.
- `npm run rules:review -- <year> review.xlsx` gives a bookkeeper every rule
  with its source, and a tab of situations to work out by hand. Each case the
  bookkeeper fills in becomes a test.

## When the shadow is good enough

HYPOTHESIS, for the owner to confirm or change: two periods in a row in which
every rubriek matches to the euro, or every difference traces back to a
mistake in the other package. After that, switch on the next period boundary
as described on boekiehouder.nl/overstappen.

## Log

| Period | Rubriek | Other package | Bookiz | Cause | Fixed in |
| --- | --- | --- | --- | --- | --- |
| | | | | | |
