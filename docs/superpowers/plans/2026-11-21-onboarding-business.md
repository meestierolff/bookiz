# Business details in the Cloud dashboard: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Cloud customer without a business fills in a form at the top of /app; it saves through `setupBusiness`, and the dashboard's to-dos speak Dutch to people.

**Architecture:** A pure form module in `src/app/business-form.ts` parses and normalises the posted fields and saves through the existing `setupBusiness` use case, writing an audit line with approval `owner`. `src/cloud/pages.ts` renders the form (inline on the dashboard, and as its own page for errors and later changes); `src/cloud/handler.ts` adds `GET`/`POST /app/bedrijf`.

**Tech Stack:** TypeScript on Node ≥ 22.18 run directly (`node file.ts`), `node:test`, embedded Postgres in tests, server-rendered HTML with a CSP nonce. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-21-onboarding-business-design.md`

## Global Constraints

- User-facing text is Dutch; code identifiers and comments English (`AGENTS.md`).
- No new tool, table or dependency; no schema change.
- Money and dates: dates `YYYY-MM-DD`; `payment_term_days` integer 0–365; default 30.
- Patterns shared with the `setup_business` tool: KvK `^\d{8}$`, btw-id `^NL\d{9}B\d{2}$`, IBAN `^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$`.
- Every POST under /app passes the existing same-origin check; a locked account (`ctx.locked`) changes nothing.
- The save writes one audit line: tool `setup_business`, the patch as input, the outcome, approval `owner`.
- Exact copy from the spec: "Kies dit goed: na je eerste boeking kan het niet meer wijzigen." and "Iets wijzigen? Zeg het tegen je assistent".
- `npm run verify` passes before the branch is reported done.

## Review Focus

1. A disabled field is not posted: once bookings exist, the period and KOR fields are shown fixed and are absent from the POST; a missing `vat_period`/`kor` must mean "unchanged", never a default that changes it.
2. Typed the way people type: `nl91 abna 0417 1643 00` and `1234 5678` must be accepted and stored as `NL91ABNA0417164300` and `12345678`; a postcode `1234ab` as `1234 AB`.
3. KOR without a date is refused on the date field; with the KOR ticked the btw-id is optional, without it required.
4. A value with HTML (`<b>Studio</b>`) re-renders escaped after an error, and every entered value survives the error.
5. A rule the engine enforces but the form does not know (for example a period change after bookings through a crafted POST) shows the engine's Dutch message and saves nothing.

---

### Task 1: Dutch to-do for missing details

**Files:**
- Modify: `src/app/reports.ts:203-204`
- Test: `test/books.test.ts` (append one test)

**Interfaces:**
- Produces: the overview action reads `Bedrijfsgegevens aanvullen voordat je kunt factureren: adres, postcode, plaats, KvK-nummer, IBAN.` (labels in that order, only the missing ones).

- [ ] **Step 1: Write the failing test** `the overview names missing details in Dutch`: `setupBusiness(ctx, { name: 'Studio Voorbeeld' })`, then `reports.overview(ctx)`; assert `next_actions` contains exactly `'Bedrijfsgegevens aanvullen voordat je kunt factureren: adres, postcode, plaats, KvK-nummer, IBAN.'` and that no action contains `address_line`.
- [ ] **Step 2: Run** `node --test test/books.test.ts`; expected: the new test fails on the English field names.
- [ ] **Step 3: Implement** a label map next to the existing `missing` list (`address_line → adres`, `postal_code → postcode`, `city → plaats`, `kvk_number → KvK-nummer`, `iban → IBAN`) and join the labels.
- [ ] **Step 4: Run** `node --test test/books.test.ts`; expected: all pass.
- [ ] **Step 5: Commit** `git commit -m "Name missing business details in Dutch on the dashboard"` (with the Co-Authored-By line).

### Task 2: Parse and normalise the form

**Files:**
- Modify: `src/app/business.ts` (export the three patterns), `src/server.ts:143-145` (use them)
- Create: `src/app/business-form.ts`
- Test: `test/business-form.test.ts`

**Interfaces:**
- Produces, in `src/app/business.ts`: `export const KVK_NUMBER: RegExp`, `export const VAT_ID: RegExp`, `export const IBAN: RegExp` (values from Global Constraints).
- Produces, in `src/app/business-form.ts`:
  - `export type BusinessFormField = 'name' | 'owner_name' | 'address_line' | 'postal_code' | 'city' | 'kvk_number' | 'vat_id' | 'iban' | 'email' | 'vat_period' | 'kor' | 'kor_since' | 'payment_term_days'`
  - `export type BusinessFormValues = Record<BusinessFormField, string>`
  - `export type BusinessFormErrors = Partial<Record<BusinessFormField, string>>`
  - `export function formValuesOf(business: Business | null, signInEmail: string): BusinessFormValues` (empty strings for nulls; `email` falls back to `signInEmail`; `vat_period` falls back to `'quarter'`; `kor` is `'ja'` when `kor_since` is set; `payment_term_days` falls back to `'30'`)
  - `export function parseBusinessForm(fields: URLSearchParams): { patch: Partial<Business> } | { values: BusinessFormValues; errors: BusinessFormErrors }`

Rules for `parseBusinessForm`: trim every value. Required: `name`, `address_line`, `postal_code`, `city`, `kvk_number`, `iban`, `email`; `vat_id` unless `kor === 'ja'`. Normalise before checking: KvK and IBAN drop spaces and dots, IBAN and btw-id upper case, a postcode matching `^\d{4}\s?[a-zA-Z]{2}$` becomes `1234 AB`. `owner_name` empty → `null`. `vat_period` absent → not in the patch; present must be `month|quarter|year`. `kor` absent → KOR fields not in the patch; `kor === 'ja'` requires a `YYYY-MM-DD` `kor_since`; `kor === 'nee'` → `kor_since: null`. `payment_term_days` empty → not in the patch, otherwise an integer 0–365. Messages are short Dutch sentences, one per field.

- [ ] **Step 1: Write the failing tests** in `test/business-form.test.ts`:
  - `a complete form becomes a patch, normalised`: fields `name=Studio Voorbeeld`, `address_line=Dorpsstraat 1`, `postal_code=1234ab`, `city=Utrecht`, `kvk_number=1234 5678`, `vat_id=nl123456789b01`, `iban=nl91 abna 0417 1643 00`, `email=sam@voorbeeld.test`, `vat_period=year`, `kor=nee`, `payment_term_days=14`; assert the patch has `postal_code: '1234 AB'`, `kvk_number: '12345678'`, `vat_id: 'NL123456789B01'`, `iban: 'NL91ABNA0417164300'`, `vat_period: 'year'`, `kor_since: null`, `payment_term_days: 14`, `owner_name: null`.
  - `required fields and patterns are checked per field`: empty `name`, `kvk_number=1234567`, `iban=NL91`, no `vat_id`, `kor=nee`; assert `errors` has keys `name`, `kvk_number`, `iban`, `vat_id` and `values.kvk_number === '1234567'`.
  - `with the KOR the btw-id is optional but the start date is not`: `kor=ja` without `kor_since` → error on `kor_since` only; with `kor_since=2026-01-01` and no `vat_id` → a patch with `kor_since: '2026-01-01'`.
  - `fields a fixed form leaves out stay unchanged`: no `vat_period`, no `kor`, no `payment_term_days` → the patch has none of `vat_period`, `kor_since`, `payment_term_days`.
  - `formValuesOf prefills from the business or the sign-in address`: `formValuesOf(null, 'sam@voorbeeld.test')` gives `email: 'sam@voorbeeld.test'`, `vat_period: 'quarter'`, `payment_term_days: '30'`, `kor: ''`.
- [ ] **Step 2: Run** `node --test test/business-form.test.ts`; expected: fails, module not found.
- [ ] **Step 3: Implement** the patterns in `business.ts`, switch the three `z.string().regex(...)` calls in `server.ts` to them, and write `business-form.ts`.
- [ ] **Step 4: Run** `node --test test/business-form.test.ts test/mcp.test.ts`; expected: all pass.
- [ ] **Step 5: Commit** `git commit -m "Parse the business form with the same patterns as setup_business"`.

### Task 3: Save the form

**Files:**
- Modify: `src/app/business-form.ts`
- Test: `test/business-form.test.ts`

**Interfaces:**
- Consumes: `parseBusinessForm`, `formValuesOf` (Task 2); `setupBusiness(ctx, patch)` from `src/app/business.ts`; `store.logAudit(q, tool, input, outcome, approval)`.
- Produces:
  - `export async function businessFormState(ctx: Ctx, signInEmail: string): Promise<{ values: BusinessFormValues; fixed: boolean }>` where `fixed` is true when there is a final invoice, a non-voided expense or a filing.
  - `export async function saveBusinessForm(ctx: Ctx, fields: URLSearchParams): Promise<{ ok: true } | { ok: false; values: BusinessFormValues; errors: BusinessFormErrors; message?: string }>`

`saveBusinessForm`: when `ctx.locked`, return `{ ok: false, message: ctx.locked }` with the posted values, without saving or auditing. Field errors return without saving or auditing. Otherwise call `setupBusiness`; a `BookizError` becomes `message` (its message, plus its hint after a space) and is audited as `error: <message>`; success is audited as `ok`. Audit tool `setup_business`, approval `owner`.

- [ ] **Step 1: Write the failing tests:**
  - `the form saves the business and the audit log says the owner did it`: `makeCtx()`, complete fields → `{ ok: true }`; `store.getBusiness` has `kvk_number: '12345678'`; the last audit row is `{ tool: 'setup_business', outcome: 'ok', approval: 'owner' }`.
  - `a locked administration saves nothing`: `ctx.locked = 'Je proefperiode is afgelopen.'` → `{ ok: false, message: 'Je proefperiode is afgelopen.' }`, no business, no audit row.
  - `the engine's own refusal reaches the form`: seed a business, book one expense, post complete fields with `vat_period=month` → `ok: false`, `message` matches `/Het aangiftetijdvak kan niet meer wijzigen/`, business still `quarter`, last audit outcome starts with `error:`.
  - `the form is fixed once there are bookings`: `businessFormState` is `fixed: false` on an empty administration and `fixed: true` after one expense.
- [ ] **Step 2: Run** `node --test test/business-form.test.ts`; expected: the four new tests fail.
- [ ] **Step 3: Implement** `businessFormState` and `saveBusinessForm`.
- [ ] **Step 4: Run** `node --test test/business-form.test.ts`; expected: all pass.
- [ ] **Step 5: Commit** `git commit -m "Save the business form through setupBusiness, audited as the owner"`.

### Task 4: Render the form and the summary

**Files:**
- Modify: `src/cloud/pages.ts` (dashboard options and markup; new `businessPage`), `web/assets/site.css` (only what radio and checkbox rows and field errors need)
- Test: `test/cloud.test.ts` (append)

**Interfaces:**
- Consumes: `BusinessFormValues`, `BusinessFormErrors` (Task 2); `Business` from `src/core/types.ts`.
- Produces:
  - `dashboardPage` takes one more option, `business: { details: Business | null; form: { values: BusinessFormValues; fixed: boolean } }`.
  - `export function businessPage(nonce: string, options: { values: BusinessFormValues; errors: BusinessFormErrors; fixed: boolean; message?: string }): string` (title "Je bedrijf", form posting to `/app/bedrijf`).

Markup: one internal `businessForm(values, errors, fixed, message?)` used by both. Without a business the dashboard shows "1  Je bedrijf" with the form before "2  Koppel je AI-assistent"; the "Je administratie is nog leeg" card is gone. With a business it shows a card with name, address, KvK-nummer, btw-id or "KOR sinds <datum>", IBAN and "btw-aangifte per kwartaal|maand|jaar", the line "Iets wijzigen? Zeg het tegen je assistent" and a link "of pas het hier aan" to `/app/bedrijf`. When `fixed`, period and KOR are shown as text with "wijzigen via je assistent", not as inputs. Every value goes through `esc`.

- [ ] **Step 1: Write the failing tests:**
  - `a new customer sees the business form before the assistant`: render `dashboardPage` with `overview: { setup: 'nog niet ingericht', next_actions: [] }`, `business.details: null`, form values from `formValuesOf(null, 'alice@example.test')`; assert the HTML contains `action="/app/bedrijf"`, `Kies dit goed: na je eerste boeking kan het niet meer wijzigen.`, `value="alice@example.test"`, does not contain `nog leeg`, and `indexOf('Je bedrijf') < indexOf('Koppel je AI-assistent')`.
  - `a set-up customer sees the details and where to change them`: `business.details` with `kvk_number: '12345678'`, `vat_period: 'year'` → contains `12345678`, `per jaar`, `Iets wijzigen? Zeg het tegen je assistent`, `href="/app/bedrijf"`, and no `<form method="post" action="/app/bedrijf"`.
  - `errors re-render escaped with the entered values`: `businessPage` with `values.name = '<b>Studio</b>'` and `errors.kvk_number = 'Een KvK-nummer heeft 8 cijfers.'` → contains `&lt;b&gt;Studio&lt;/b&gt;` and the message, not `<b>Studio</b>`.
  - `a fixed form has no period or KOR inputs`: `businessPage` with `fixed: true` → no `name="vat_period"`, no `name="kor"`.
- [ ] **Step 2: Run** `node --test test/cloud.test.ts`; expected: the four new tests fail.
- [ ] **Step 3: Implement** the markup and the small CSS addition.
- [ ] **Step 4: Run** `node --test test/cloud.test.ts`; expected: all pass.
- [ ] **Step 5: Commit** `git commit -m "Show the business form on the dashboard until the business is set up"`.

### Task 5: Routes, docs and verification

**Files:**
- Modify: `src/cloud/handler.ts` (`dashboard()` loads the business and the form state; `app()` routes `GET`/`POST /app/bedrijf`), `README.md` (one sentence under "How Cloud is built")

**Interfaces:**
- Consumes: `businessFormState`, `saveBusinessForm` (Task 3); `businessPage`, the new `dashboardPage` option (Task 4); `withTenant`, `accountFor`, `form(req)`, `redirect`, `sendHtml` already in `handler.ts`.

Routes, inside the signed-in part of `app()`: `GET /app/bedrijf` renders `businessPage` from `businessFormState`; `POST /app/bedrijf` reads `form(req)`, runs `saveBusinessForm` in `withTenant`; `ok` redirects 303 to `/app`, otherwise status 400 with `businessPage` carrying values, errors, `fixed` and message. The existing same-origin check already covers the POST.

The session check needs Supabase, so these few lines are covered by the tests of Tasks 3 and 4 plus a manual check after deploy (below), not by an HTTP test.

- [ ] **Step 1: Implement** the dashboard data and the two routes.
- [ ] **Step 2: Run** `npm run verify`; expected: exit 0, all tests pass, `site:check` silent.
- [ ] **Step 3: Update** `README.md`: under "How Cloud is built" add that a new customer sets up the business in a form on /app and the assistant carries on from there.
- [ ] **Step 4: Commit** `git commit -m "Route the business form in the Cloud dashboard"`.
- [ ] **Step 5: After an approved deploy, check by hand** with a fresh account (`meestierolff+test@gmail.com`): the form shows first; a wrong KvK shows its message with the other values kept; saving lands on /app with the summary card; `get_overview` through the assistant no longer asks for business details.
