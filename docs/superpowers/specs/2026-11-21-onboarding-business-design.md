# Onboarding: business details in the Cloud dashboard

Agreed with the owner on 21 November 2026. A small change; short design.

## Why

A Cloud customer should sign in once, set up the business in one go, connect
the assistant, and from then on never need the site: everything runs through
Claude. Today the business can only be set up through the assistant, field
by field in the chat, and the first booking fails until it is done (the
owner's own test hit exactly that). The filing frequency is also chosen
there, while it cannot change after the first booking; the owner's account
is now stuck on "per kwartaal".

The dashboard also shows agent-facing field names to the owner ("address_line,
postal_code, city, kvk_number, iban").

## Goals

- After signing in, a customer without a business sees a form for it at the
  top of /app, before "Koppel je AI-assistent".
- Saving uses the same rules as `setup_business`, so the dashboard and the
  assistant can never disagree about what is valid.
- Afterwards the dashboard shows the details in a short card with "Iets
  wijzigen? Zeg het tegen je assistent" and a link to the same form.
- Every to-do the dashboard shows is Dutch for people.

## Non-goals

- KvK search. It comes later as a search field above the form that fills
  name, address and KvK number (KvK API, € 6,40 a month per key). The form
  leaves room for it; nothing is built for it now.
- Year facts (urencriterium, startersaftrek, wage income): stay with the
  assistant (`set_year_facts`).
- An archive e-mail field: Cloud always sends receipts to the sign-in
  address.

## Anti-goals

- The dashboard becoming a second bookkeeping app. No invoices, expenses or
  returns in the browser.
- A form that accepts something the engine would refuse later.

## Approaches

1. **Form in the dashboard, shown while there is no business (chosen).** The
   first thing a new customer sees; someone who already set up through the
   assistant never sees it.
2. Only through the assistant, as today. Rejected: this is what the owner
   finds cumbersome.
3. A separate set-up page before the dashboard can be reached. Rejected: an
   extra screen for people who already set up through the assistant, and a
   wall in front of the connection instructions.

## Design

Fields, in Dutch, with what is required:

| Field | Business field | Required |
| --- | --- | --- |
| Bedrijfsnaam | `name` | yes |
| Je naam (onder je e-mails) | `owner_name` | no; falls back to the business name |
| Adres, Postcode, Plaats | `address_line`, `postal_code`, `city` | yes |
| KvK-nummer | `kvk_number` | yes, 8 digits |
| Btw-id | `vat_id` | yes, unless the KOR applies |
| IBAN | `iban` | yes; spaces removed, upper case |
| E-mail op je facturen | `email` | yes; prefilled with the sign-in address |
| Btw-aangifte per kwartaal, maand of jaar | `vat_period` | yes; default per kwartaal. Text: "Kies dit goed: na je eerste boeking kan het niet meer wijzigen." Shown fixed once there are bookings |
| Ik gebruik de KOR, sinds | `kor_since` | the date is required when the box is ticked |
| Betaaltermijn in dagen | `payment_term_days` | default 30 |

Behaviour:

- `POST /app/bedrijf` saves through `setupBusiness`, behind the same-origin
  check every POST in /app has. Success redirects to /app (post, redirect,
  get). An error re-renders the form with the entered values and a Dutch
  message next to the field. A locked account (trial or subscription ended)
  is refused with the existing message.
- `GET /app/bedrijf` shows the same form prefilled, for changes later.
- The save writes an audit line `setup_business` with approval `owner`: the
  owner entered it personally.
- The overview's to-do about missing details names them in Dutch ("adres,
  postcode, plaats, KvK-nummer, IBAN"); the assistant still knows which
  `setup_business` fields they are from that tool's description.

Sketch:

```
Mijn Bookiz
1  Je bedrijf
   Bedrijfsnaam [          ]   Je naam [          ]
   Adres [        ]  Postcode [      ]  Plaats [        ]
   KvK-nummer [        ]  Btw-id [            ]  IBAN [              ]
   E-mail op je facturen [                 ]
   Btw-aangifte  (•) per kwartaal  ( ) per maand  ( ) per jaar
                 Kies dit goed: na je eerste boeking kan het niet meer wijzigen.
   KOR           [ ] ik gebruik de KOR, sinds [datum]
   Betaaltermijn [30] dagen                       [ Opslaan ]
2  Koppel je AI-assistent   (as now)
```

## Left to the builder

- Where the shared validation lives (one set of patterns for the tool schema
  and the form) and how a postcode is normalised.
- The exact Dutch error texts, following the existing tone.
- How the form route is tested, given that /app needs a Supabase session.
