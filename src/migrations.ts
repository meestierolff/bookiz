/**
 * Append-only list of schema migrations. Never edit an entry that has shipped;
 * add a new one. Amounts are integer euro cents, dates are Postgres `date`.
 */
export const MIGRATIONS: string[] = [
  `
  create table business (
    id integer primary key default 1 check (id = 1),
    name text not null,
    owner_name text,
    address_line text,
    postal_code text,
    city text,
    kvk_number text,
    vat_id text,
    iban text,
    email text,
    archive_email text,
    kor_since date,
    kor_until date,
    vat_period text not null default 'quarter' check (vat_period in ('month', 'quarter')),
    payment_term_days integer not null default 30 check (payment_term_days between 0 and 365),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table tax_year (
    year integer primary key check (year between 2000 and 2100),
    hours_criterion boolean not null default false,
    starter boolean not null default false,
    wage_income_cents integer check (wage_income_cents >= 0)
  );

  create table contact (
    id integer generated always as identity primary key,
    name text not null,
    email text,
    address_line text,
    postal_code text,
    city text,
    country text not null default 'NL' check (country ~ '^[A-Z]{2}$'),
    vat_id text,
    kvk_number text,
    created_at timestamptz not null default now()
  );

  create table invoice (
    id integer generated always as identity primary key,
    status text not null default 'draft' check (status in ('draft', 'final')),
    number text unique,
    year integer,
    seq integer,
    contact_id integer not null references contact (id),
    contact_snapshot jsonb,
    business_snapshot jsonb,
    issue_date date not null,
    supply_date date,
    due_date date not null,
    lines jsonb not null,
    net_cents integer not null,
    vat_cents integer not null,
    total_cents integer not null,
    credit_of integer references invoice (id),
    note text,
    paid_on date,
    sent_at timestamptz,
    created_at timestamptz not null default now(),
    unique (year, seq),
    check ((status = 'final') = (number is not null))
  );

  create table expense (
    id integer generated always as identity primary key,
    ref text not null unique,
    year integer not null,
    seq integer not null,
    date date not null,
    vat_period text not null,
    vendor text not null,
    description text,
    kind text not null check (kind in ('cost', 'investment', 'mileage')),
    category text not null,
    total_cents integer not null,
    vat_cents integer not null default 0,
    vat_treatment text not null check (vat_treatment in ('nl', 'eu_reverse_charge', 'non_eu_reverse_charge', 'none')),
    paid_from text not null check (paid_from in ('business', 'private')),
    km integer check (km > 0),
    useful_life_years integer check (useful_life_years between 1 and 50),
    residual_cents integer not null default 0 check (residual_cents >= 0),
    receipt jsonb,
    voided_at timestamptz,
    void_reason text,
    created_at timestamptz not null default now(),
    unique (year, seq)
  );

  create table vat_filing (
    period text primary key,
    filed_on date not null,
    figures jsonb not null,
    payable_euros integer not null,
    created_at timestamptz not null default now()
  );

  create table audit_log (
    id integer generated always as identity primary key,
    at timestamptz not null default now(),
    tool text not null,
    input jsonb not null,
    outcome text not null
  );
  `,
  // Hosted Postgres services such as Supabase expose the public schema through
  // an auto-generated web API. With row level security on and no policies, that
  // API sees nothing; Bookiz itself connects as the table owner and is unaffected.
  `
  alter table business enable row level security;
  alter table tax_year enable row level security;
  alter table contact enable row level security;
  alter table invoice enable row level security;
  alter table expense enable row level security;
  alter table vat_filing enable row level security;
  alter table audit_log enable row level security;
  alter table schema_migrations enable row level security;
  `,
];
