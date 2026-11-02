-- Target organisation model for sandbox demo data.
-- Live companies, investors, buyers, invoices, buckets, and portfolio_snapshots stay.
-- Those three names are already taken, so the replacement copies use an organisation_ prefix.

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  company_id text not null,
  country text not null default 'BR',
  description text not null default '',
  risk_score integer not null default 10000 check (risk_score between 0 and 10000),
  created_at timestamptz not null default now(),
  unique (country, company_id)
);

create table public.industries (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create unique index industries_name_lower on public.industries (lower(name));

create table public.organisation_industries (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  industry_id uuid not null references public.industries (id),
  primary key (organisation_id, industry_id)
);

create or replace function public.limit_organisation_industries()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    select count(*)
    from public.organisation_industries
    where organisation_id = new.organisation_id
  ) >= 3 then
    raise exception 'An organisation can have at most three industries';
  end if;
  return new;
end;
$$;

create trigger organisation_industries_limit
  before insert on public.organisation_industries
  for each row
  execute function public.limit_organisation_industries();

create table public.organisation_currencies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  currency text not null,
  use text not null check (use in ('invoices', 'funding')),
  unique (organisation_id, currency, use)
);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  method text not null check (method in ('pix', 'iban', 'xrpl', 'paypal')),
  identifier text not null
);

create table public.identities (
  id uuid primary key default gen_random_uuid(),
  login text not null,
  username text not null,
  auth_user_id uuid unique references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.organisation_members (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null unique references public.identities (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id),
  created_at timestamptz not null default now()
);

create table public.membership_roles (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.organisation_members (id) on delete cascade,
  role text not null check (role in ('seller', 'investor')),
  unique (member_id, role)
);

create table public.multisigs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations (id),
  type text not null check (type in ('investor', 'governance', 'issuer', 'repayment')),
  address text,
  status text not null default 'not_created' check (status in ('not_created', 'live', 'paused')),
  created_at timestamptz not null default now()
);

create unique index multisigs_one_investor
  on public.multisigs (organisation_id)
  where type = 'investor' and organisation_id is not null;

create unique index multisigs_one_central
  on public.multisigs (type)
  where type in ('governance', 'issuer', 'repayment');

create table public.bots (
  id uuid primary key default gen_random_uuid(),
  address text,
  seed_ciphertext text,
  multisig_id uuid references public.multisigs (id)
);

create table public.organisation_portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  captured_at timestamptz not null default now(),
  available_rlusd numeric not null,
  reserved_rlusd numeric not null,
  outstanding_rlusd numeric not null,
  portfolio_rlusd numeric not null
);

create index organisation_portfolio_snapshots_org_captured
  on public.organisation_portfolio_snapshots (organisation_id, captured_at desc);

create table public.organisation_invoices (
  id uuid primary key default gen_random_uuid(),
  document_id text not null unique,
  seller_organisation_id uuid not null references public.organisations (id),
  obligor_organisation_id uuid not null references public.organisations (id),
  buyer_organisation_id uuid references public.organisations (id),
  face_value numeric not null check (face_value >= 0),
  currency text not null,
  sold_price numeric,
  origination_date date not null,
  sold_date date,
  due_date date not null,
  repayment_amount numeric not null default 0 check (repayment_amount >= 0),
  repaid boolean not null default false,
  repaid_date date,
  risk_score integer not null check (risk_score between 0 and 10000),
  created_at timestamptz not null default now()
);

create table public.organisation_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.organisation_invoices (id) on delete cascade,
  product text not null,
  amount numeric not null check (amount >= 0),
  unit text not null
);

create table public.bucket_features (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

insert into public.bucket_features (name) values ('Insured'), ('Seller Buy-Back');

create table public.organisation_buckets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  name text not null,
  status text not null check (status in ('active', 'paused')),
  risk_low integer not null check (risk_low between 0 and 10000),
  risk_high integer not null check (risk_high between 0 and 10000),
  face_min numeric not null,
  face_max numeric not null,
  tenor_min integer,
  tenor_max integer,
  industries text[] not null default '{}',
  countries text[] not null default '{}',
  currencies text[] not null default '{}',
  apr numeric not null,
  exposure_kind text not null check (exposure_kind in ('flat_usd', 'portfolio_percent')),
  exposure_limit_usd numeric,
  exposure_limit_percent numeric,
  exposure_used_usd numeric not null default 0,
  created_at timestamptz not null default now(),
  constraint organisation_buckets_risk_order check (risk_low <= risk_high),
  constraint organisation_buckets_face_order check (face_min <= face_max)
);

create table public.organisation_bucket_features (
  bucket_id uuid not null references public.organisation_buckets (id) on delete cascade,
  feature_id uuid not null references public.bucket_features (id),
  primary key (bucket_id, feature_id)
);

alter table public.organisations enable row level security;
alter table public.industries enable row level security;
alter table public.organisation_industries enable row level security;
alter table public.organisation_currencies enable row level security;
alter table public.payment_methods enable row level security;
alter table public.identities enable row level security;
alter table public.organisation_members enable row level security;
alter table public.membership_roles enable row level security;
alter table public.multisigs enable row level security;
alter table public.bots enable row level security;
alter table public.organisation_portfolio_snapshots enable row level security;
alter table public.organisation_invoices enable row level security;
alter table public.organisation_invoice_lines enable row level security;
alter table public.bucket_features enable row level security;
alter table public.organisation_buckets enable row level security;
alter table public.organisation_bucket_features enable row level security;
