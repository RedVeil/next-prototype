create table public.organisation_cash_movements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  kind text not null check (kind in ('deposit', 'withdrawal')),
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index organisation_cash_movements_org_created
  on public.organisation_cash_movements (organisation_id, created_at desc);

alter table public.organisation_cash_movements enable row level security;
