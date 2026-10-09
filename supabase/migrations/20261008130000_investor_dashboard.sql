-- Portfolio history for the investor dashboard, plus the reads that positions,
-- history, and stats need. Invoice face amounts stay in the invoice currency.
-- Only expected_repayment_rlusd is added into the RLUSD portfolio.

alter table public.deposits
  add column if not exists created_at timestamptz not null default now();

alter table public.withdrawals
  add column if not exists created_at timestamptz not null default now();

alter table public.bucket_purchases
  add column if not exists expected_repayment_rlusd numeric;

alter table public.bucket_purchases
  drop constraint if exists bucket_purchases_expected_repayment_nonnegative;

alter table public.bucket_purchases
  add constraint bucket_purchases_expected_repayment_nonnegative
  check (expected_repayment_rlusd is null or expected_repayment_rlusd >= 0);

create table if not exists public.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.investors (id),
  captured_at timestamptz not null default now(),
  cash_rlusd numeric not null,
  invoices_rlusd numeric not null,
  portfolio_rlusd numeric not null
);

create index if not exists portfolio_snapshots_investor_captured
  on public.portfolio_snapshots (investor_id, captured_at desc);

alter table public.portfolio_snapshots enable row level security;

create policy portfolio_snapshots_select on public.portfolio_snapshots
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.investors i
      where i.id = portfolio_snapshots.investor_id and i.profile_id = auth.uid()
    )
  );

create policy purchases_investor_select on public.bucket_purchases
  for select to authenticated
  using (
    exists (
      select 1
      from public.buckets b
      join public.investors i on i.id = b.investor_id
      where b.id = bucket_purchases.bucket_id and i.profile_id = auth.uid()
    )
  );

create policy invoices_investor_select on public.invoices
  for select to authenticated
  using (
    exists (
      select 1
      from public.bucket_purchases bp
      join public.buckets b on b.id = bp.bucket_id
      join public.investors i on i.id = b.investor_id
      where bp.invoice_id = invoices.id and i.profile_id = auth.uid()
    )
  );

create policy reservations_investor_select on public.reservations
  for select to authenticated
  using (
    exists (
      select 1 from public.investors i
      where i.id = reservations.investor_id and i.profile_id = auth.uid()
    )
  );

create policy payouts_investor_repayment_select on public.payouts
  for select to authenticated
  using (
    direction = 'repayment'
    and exists (
      select 1
      from public.multisig_accounts m
      join public.investors i on i.id = m.investor_id
      where m.id = payouts.destination_multisig_id and i.profile_id = auth.uid()
    )
  );
