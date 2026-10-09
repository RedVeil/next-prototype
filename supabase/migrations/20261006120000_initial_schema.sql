-- Initial schema and RLS sketch.
-- Writes on ledger tables are service-role only. Authenticated policies below are selects.
-- The service role bypasses RLS. Auth is not wired in this slice.
-- No seeds and no ciphertext values are inserted here.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('company', 'investor', 'admin')),
  created_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles (id),
  legal_name text not null,
  tax_id text not null,
  country text not null default 'BR',
  industries text[] not null default '{}',
  business_description text not null default '',
  goods_and_services text[] not null default '{}',
  application_status text not null default 'pending' check (application_status in ('pending', 'accepted')),
  access_status text not null default 'allowed' check (access_status in ('allowed', 'stopped')),
  source text not null check (source in ('application', 'admin')),
  risk_low integer not null check (risk_low between 0 and 10000),
  risk_high integer not null check (risk_high between 0 and 10000),
  pix_destination text not null default '',
  kyb_provider text,
  kyb_reference text,
  open_finance_reference text,
  nfe_reference text,
  created_at timestamptz not null default now(),
  constraint companies_risk_order check (risk_low <= risk_high)
);

create table public.investors (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles (id),
  legal_name text not null,
  application_status text not null default 'pending' check (application_status in ('pending', 'accepted')),
  access_status text not null default 'allowed' check (access_status in ('allowed', 'stopped')),
  bot_paused boolean not null default false,
  source text not null check (source in ('application', 'admin')),
  kyb_provider text,
  kyb_reference text,
  created_at timestamptz not null default now()
);

create table public.platform_settings (
  id boolean primary key default true check (id),
  company_applications_allowed boolean not null default true,
  investor_applications_allowed boolean not null default true
);

insert into public.platform_settings (id) values (true);

create table public.multisig_accounts (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid references public.investors (id),
  role text not null check (role in (
    'investor_wallet',
    'investor_reservation',
    'central_governance',
    'central_issuer',
    'central_repayment'
  )),
  classic_address text not null,
  quorum integer not null check (quorum >= 1),
  deposit_auth_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index multisig_accounts_one_central
  on public.multisig_accounts (role)
  where role in ('central_governance', 'central_issuer', 'central_repayment');

create unique index multisig_accounts_one_investor_role
  on public.multisig_accounts (investor_id, role)
  where investor_id is not null;

create table public.multisig_signers (
  id uuid primary key default gen_random_uuid(),
  multisig_account_id uuid not null references public.multisig_accounts (id) on delete cascade,
  address text not null,
  weight integer not null check (weight >= 1),
  kind text not null check (kind in ('bot', 'investor', 'team_member', 'central_governance'))
);

create table public.multisig_authorized_senders (
  id uuid primary key default gen_random_uuid(),
  multisig_account_id uuid not null references public.multisig_accounts (id) on delete cascade,
  xrpl_address text not null,
  label text not null default '',
  unique (multisig_account_id, xrpl_address)
);

create table public.bot_wallets (
  id uuid primary key default gen_random_uuid(),
  public_address text,
  multisig_account_id uuid references public.multisig_accounts (id),
  purpose text not null check (purpose in (
    'investor_wallet',
    'investor_reservation',
    'central_issuer',
    'central_repayment'
  )),
  xrp_balance numeric not null default 0,
  xrp_fees_spent numeric not null default 0,
  xrp_low_watermark numeric not null default 20,
  seed_ciphertext text
);

create table public.service_heartbeats (
  service_name text primary key check (service_name in (
    'risk', 'matcher', 'ledger_bot', 'payouts', 'rail', 'funder'
  )),
  started_at timestamptz not null,
  last_seen_at timestamptz not null
);

create table public.deposits (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.investors (id),
  destination_multisig_id uuid not null references public.multisig_accounts (id),
  amount numeric not null check (amount > 0),
  xrpl_tx_hash text,
  status text not null default 'pending'
);

create table public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.investors (id),
  source_multisig_id uuid not null references public.multisig_accounts (id),
  destination_address text not null,
  amount numeric not null check (amount > 0),
  xrpl_tx_hash text,
  status text not null default 'pending'
);

create table public.buyers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tax_id text not null unique
);

create table public.company_invoice_filters (
  company_id uuid primary key references public.companies (id) on delete cascade,
  customer_tax_ids text[] not null default '{}',
  products text[] not null default '{}',
  risk_low integer check (risk_low between 0 and 10000),
  risk_high integer check (risk_high between 0 and 10000),
  attributes jsonb not null default '{}'::jsonb,
  constraint company_invoice_filters_risk_order check (
    risk_low is null or risk_high is null or risk_low <= risk_high
  )
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  document_id text not null unique,
  origin_country text not null,
  currency text not null,
  amount numeric not null check (amount >= 0),
  product text not null,
  due_date date,
  installments jsonb,
  buyer_id uuid references public.buyers (id),
  buyer_name text not null default '',
  buyer_tax_id text not null default '',
  issuer_industries text[] not null default '{}',
  issuer_business_description text not null default '',
  eligible_for_matching boolean not null default false,
  sale_status text not null default 'unsold' check (sale_status in ('unsold', 'sold')),
  sold_at timestamptz,
  status text not null default 'submitted' check (status in (
    'submitted', 'nfe_checked', 'scored', 'listed', 'offered', 'accepted',
    'reserved', 'nft_issued', 'paying_out', 'paid_to_company', 'awaiting_repayment',
    'repaid', 'settled', 'declined', 'expired', 'failed'
  )),
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.sale_perfections (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id),
  origin_country text not null,
  created_at timestamptz not null default now(),
  attributes jsonb not null default '{}'::jsonb
);

create table public.risk_assessments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  low integer not null check (low between 0 and 10000),
  high integer not null check (high between 0 and 10000),
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  attributes jsonb not null default '{}'::jsonb,
  constraint risk_assessments_order check (low <= high)
);

create unique index risk_assessments_one_current
  on public.risk_assessments (invoice_id)
  where is_current;

create table public.buckets (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.investors (id),
  name text not null,
  status text not null check (status in ('active', 'paused')),
  risk_low integer not null check (risk_low between 0 and 10000),
  risk_high integer not null check (risk_high between 0 and 10000),
  industries text[] not null default '{}',
  products text[] not null default '{}',
  countries text[] not null default '{}',
  currencies text[] not null default '{}',
  criteria_mode text not null check (criteria_mode in ('and', 'or')),
  apr numeric not null,
  exposure_kind text not null check (exposure_kind in ('flat_usd', 'portfolio_percent')),
  exposure_limit_usd numeric,
  exposure_limit_percent numeric,
  exposure_used_usd numeric not null default 0,
  tenor_min integer,
  tenor_max integer,
  invoice_min numeric,
  invoice_max numeric,
  attributes jsonb not null default '{}'::jsonb,
  constraint buckets_risk_order check (risk_low <= risk_high)
);

create table public.bucket_purchases (
  id uuid primary key default gen_random_uuid(),
  bucket_id uuid not null references public.buckets (id),
  invoice_id uuid not null references public.invoices (id),
  amount_usd numeric not null check (amount_usd >= 0),
  created_at timestamptz not null default now()
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id),
  bucket_id uuid not null references public.buckets (id),
  investor_id uuid not null references public.investors (id),
  apr numeric not null,
  due_date date not null,
  days integer not null,
  price numeric not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create unique index offers_one_open_per_invoice
  on public.offers (invoice_id)
  where status = 'open';

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id),
  investor_id uuid not null references public.investors (id),
  source_multisig_id uuid not null references public.multisig_accounts (id),
  destination_multisig_id uuid not null references public.multisig_accounts (id),
  amount numeric not null,
  xrpl_tx_hash text,
  created_at timestamptz not null default now()
);

create table public.invoice_nfts (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null unique references public.invoices (id),
  token_id text not null,
  issuer_multisig_id uuid not null references public.multisig_accounts (id),
  holder_multisig_id uuid not null references public.multisig_accounts (id),
  mint_tx text,
  burn_tx text
);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.invoices (id),
  direction text not null check (direction in ('disbursement', 'repayment')),
  origin_country text not null,
  method text not null,
  source_multisig_id uuid references public.multisig_accounts (id),
  destination_multisig_id uuid references public.multisig_accounts (id),
  amount numeric,
  external_reference text,
  xrpl_tx_hash text,
  status text not null default 'queued',
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.ledger_jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in (
    'provision_investor_multisigs',
    'reserve_funds',
    'perfect_sale',
    'mint_invoice_nft',
    'disburse_to_company',
    'settle_repayment',
    'burn_invoice_nft',
    'withdraw_rlusd'
  )),
  bot_wallet_id uuid references public.bot_wallets (id),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

-- RLS sketch. Tighten these when Supabase Auth is wired.

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.investors enable row level security;
alter table public.platform_settings enable row level security;
alter table public.multisig_accounts enable row level security;
alter table public.multisig_signers enable row level security;
alter table public.multisig_authorized_senders enable row level security;
alter table public.bot_wallets enable row level security;
alter table public.service_heartbeats enable row level security;
alter table public.deposits enable row level security;
alter table public.withdrawals enable row level security;
alter table public.buyers enable row level security;
alter table public.company_invoice_filters enable row level security;
alter table public.invoices enable row level security;
alter table public.sale_perfections enable row level security;
alter table public.risk_assessments enable row level security;
alter table public.buckets enable row level security;
alter table public.bucket_purchases enable row level security;
alter table public.offers enable row level security;
alter table public.reservations enable row level security;
alter table public.invoice_nfts enable row level security;
alter table public.payouts enable row level security;
alter table public.ledger_jobs enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy companies_select on public.companies
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

create policy investors_select on public.investors
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

create policy platform_settings_admin_select on public.platform_settings
  for select to authenticated
  using (public.is_admin());

create policy invoices_select on public.invoices
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.companies c
      where c.id = invoices.company_id and c.profile_id = auth.uid()
    )
  );

create policy filters_select on public.company_invoice_filters
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.companies c
      where c.id = company_invoice_filters.company_id and c.profile_id = auth.uid()
    )
  );

create policy buckets_select on public.buckets
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.investors i
      where i.id = buckets.investor_id and i.profile_id = auth.uid()
    )
  );

create policy offers_select on public.offers
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.investors i
      where i.id = offers.investor_id and i.profile_id = auth.uid()
    )
    or exists (
      select 1
      from public.invoices inv
      join public.companies c on c.id = inv.company_id
      where inv.id = offers.invoice_id and c.profile_id = auth.uid()
    )
  );

create policy deposits_select on public.deposits
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.investors i
      where i.id = deposits.investor_id and i.profile_id = auth.uid()
    )
  );

create policy withdrawals_select on public.withdrawals
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.investors i
      where i.id = withdrawals.investor_id and i.profile_id = auth.uid()
    )
  );

create policy multisig_admin_select on public.multisig_accounts
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.investors i
      where i.id = multisig_accounts.investor_id and i.profile_id = auth.uid()
    )
  );

create policy multisig_signers_admin_select on public.multisig_signers
  for select to authenticated
  using (public.is_admin());

create policy authorized_senders_admin_select on public.multisig_authorized_senders
  for select to authenticated
  using (public.is_admin());

create policy heartbeats_admin_select on public.service_heartbeats
  for select to authenticated
  using (public.is_admin());

create policy buyers_admin_select on public.buyers
  for select to authenticated
  using (public.is_admin());

create policy risk_admin_select on public.risk_assessments
  for select to authenticated
  using (public.is_admin());

create policy nfts_admin_select on public.invoice_nfts
  for select to authenticated
  using (public.is_admin());

create policy payouts_admin_select on public.payouts
  for select to authenticated
  using (public.is_admin());

create policy reservations_admin_select on public.reservations
  for select to authenticated
  using (public.is_admin());

create policy purchases_admin_select on public.bucket_purchases
  for select to authenticated
  using (public.is_admin());

create policy perfections_admin_select on public.sale_perfections
  for select to authenticated
  using (public.is_admin());

create policy ledger_jobs_admin_select on public.ledger_jobs
  for select to authenticated
  using (public.is_admin());

-- Addresses and XRP figures are admin-readable. The ciphertext column is service-role only.
revoke all on table public.bot_wallets from anon, authenticated;
grant select (
  id,
  public_address,
  multisig_account_id,
  purpose,
  xrp_balance,
  xrp_fees_spent,
  xrp_low_watermark
) on public.bot_wallets to authenticated;

create policy bot_wallets_admin_select on public.bot_wallets
  for select to authenticated
  using (public.is_admin());

-- No insert, update, or delete policies are defined for authenticated users.
-- Ledger, payout, NFT, and bot-wallet writes stay on the service role.
