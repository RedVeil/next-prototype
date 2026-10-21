-- User wallets live on identities. Organisation multisigs replace the investor type.

alter table public.identities
  add column if not exists xrpl_address text;

update public.identities as identity
set xrpl_address = payment.identifier
from public.organisation_members as member
join public.payment_methods as payment
  on payment.organisation_id = member.organisation_id
 and payment.method = 'xrpl'
where identity.id = member.identity_id
  and identity.xrpl_address is null
  and (
    select count(*)
    from public.organisation_members as sibling
    where sibling.organisation_id = member.organisation_id
  ) = 1;

do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint as con
  join pg_class as rel on rel.oid = con.conrelid
  join pg_namespace as nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'multisigs'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%investor%';

  if constraint_name is not null then
    execute format('alter table public.multisigs drop constraint %I', constraint_name);
  end if;
end $$;

update public.multisigs
set type = 'org'
where type = 'investor';

alter table public.multisigs
  drop constraint if exists multisigs_type_check;

alter table public.multisigs
  add constraint multisigs_type_check
  check (type in ('org', 'governance', 'issuer', 'repayment'));

drop index if exists public.multisigs_one_investor;

create unique index if not exists multisigs_one_org
  on public.multisigs (organisation_id)
  where type = 'org' and organisation_id is not null;

alter table public.multisigs
  add column if not exists quorum integer not null default 1 check (quorum >= 1);

create table if not exists public.org_multisig_signers (
  id uuid primary key default gen_random_uuid(),
  multisig_id uuid not null references public.multisigs (id) on delete cascade,
  address text not null,
  weight integer not null check (weight >= 1),
  kind text not null check (kind in ('user', 'bot')),
  identity_id uuid references public.identities (id),
  unique (multisig_id, address)
);

create table if not exists public.org_multisig_destinations (
  id uuid primary key default gen_random_uuid(),
  multisig_id uuid not null references public.multisigs (id) on delete cascade,
  address text,
  kind text not null check (kind in ('wallet', 'bot', 'repayment'))
);

create unique index if not exists org_multisig_destinations_address
  on public.org_multisig_destinations (multisig_id, kind, address)
  where address is not null;

create unique index if not exists org_multisig_destinations_one_repayment
  on public.org_multisig_destinations (multisig_id)
  where kind = 'repayment';

alter table public.org_multisig_signers enable row level security;
alter table public.org_multisig_destinations enable row level security;
revoke all on table public.org_multisig_signers from anon, authenticated;
revoke all on table public.org_multisig_destinations from anon, authenticated;
