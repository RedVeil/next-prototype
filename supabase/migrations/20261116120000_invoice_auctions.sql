-- Seller-started invoice auctions.
-- A round is created when the seller requests quotes. The MPT issuance id is
-- written only after the create validates. An offer is written only after the
-- investor signature verifies. The sale order blob is written only after the
-- seller signature verifies. The invoice is sold only after both inner
-- payments validate. The ticket hold is the only bid row written before a signature.

alter table public.organisations
  add column auction_duration_hours integer not null default 24
    check (auction_duration_hours between 24 and 48);

comment on column public.organisations.auction_duration_hours is
  'Seller auction length in hours. Default 24. Allowed 24 through 48.';

alter table public.sale_orders
  drop constraint if exists sale_orders_status_check;

alter table public.sale_orders
  add constraint sale_orders_status_check
    check (status in (
      'queued',
      'preparing',
      'submitted',
      'succeeded',
      'failed',
      'expired',
      'accepting',
      'unknown'
    ));

alter table public.sale_orders
  add column offer_id uuid;

comment on column public.sale_orders.offer_id is
  'The signed investor offer this seller acceptance submits. Null for older orders.';

drop index if exists public.sale_orders_one_open_seller;
drop index if exists public.sale_orders_one_open_buyer;

create unique index sale_orders_one_open_seller
  on public.sale_orders (seller_organisation_id)
  where status in ('preparing', 'submitted', 'accepting', 'unknown');

create unique index sale_orders_one_open_buyer
  on public.sale_orders (buyer_organisation_id)
  where status in ('preparing', 'submitted', 'accepting', 'unknown');

create table public.auction_rounds (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.organisation_invoices (id),
  seller_organisation_id uuid not null references public.organisations (id),
  status text not null default 'setup_pending'
    check (status in (
      'setup_pending',
      'open',
      'accepting',
      'submitted',
      'settled',
      'expired',
      'failed'
    )),
  duration_hours integer not null check (duration_hours between 24 and 48),
  deadline timestamptz,
  shared_inner_ticket bigint,
  issuance_id text,
  seller_account text,
  setup_unsigned jsonb,
  setup_signed jsonb,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.auction_rounds is
  'One auction for an invoice. One open round per invoice. Issuance id is set after the create validates.';

create unique index auction_rounds_one_open
  on public.auction_rounds (invoice_id)
  where status in ('setup_pending', 'open', 'accepting', 'submitted');

create index auction_rounds_seller
  on public.auction_rounds (seller_organisation_id, status);

create table public.auction_tickets (
  id uuid primary key default gen_random_uuid(),
  seller_account text not null,
  ticket_sequence bigint not null,
  kind text not null check (kind in ('inner', 'outer')),
  round_id uuid not null references public.auction_rounds (id),
  offer_id uuid,
  state text not null default 'available'
    check (state in ('available', 'held', 'attached', 'spent', 'released')),
  held_at timestamptz,
  prepared jsonb,
  created_at timestamptz not null default now(),
  unique (seller_account, ticket_sequence)
);

comment on table public.auction_tickets is
  'The inner ticket is one row for the round. Outer tickets are the bid pool. A hold is the only bid row written before a signature.';

create unique index auction_tickets_one_inner
  on public.auction_tickets (round_id)
  where kind = 'inner';

create index auction_tickets_pool
  on public.auction_tickets (round_id, kind, state, ticket_sequence);

create table public.auction_invitations (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.auction_rounds (id),
  invoice_id uuid not null references public.organisation_invoices (id),
  investor_organisation_id uuid not null references public.organisations (id),
  bucket_id uuid not null references public.organisation_buckets (id),
  state text not null default 'invited'
    check (state in ('invited', 'declined', 'ignored')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, bucket_id)
);

create index auction_invitations_investor
  on public.auction_invitations (investor_organisation_id, state);

create table public.auction_ignores (
  investor_organisation_id uuid not null references public.organisations (id),
  invoice_id uuid not null references public.organisation_invoices (id),
  created_at timestamptz not null default now(),
  primary key (investor_organisation_id, invoice_id)
);

comment on table public.auction_ignores is
  'Ignore is per investor and invoice and survives a later round.';

create table public.invoice_offers (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.auction_rounds (id),
  invitation_id uuid not null references public.auction_invitations (id),
  invoice_id uuid not null references public.organisation_invoices (id),
  investor_organisation_id uuid not null references public.organisations (id),
  bucket_id uuid not null references public.organisation_buckets (id),
  apr numeric not null check (apr >= 0),
  brl_discount numeric not null check (brl_discount >= 0),
  brl_proceeds numeric not null check (brl_proceeds >= 0),
  rlusd_amount numeric not null check (rlusd_amount >= 0),
  fx_rate numeric not null check (fx_rate > 0),
  fx_source text not null check (char_length(btrim(fx_source)) > 0),
  fx_quoted_at timestamptz not null,
  outer_ticket_id uuid not null references public.auction_tickets (id),
  payload_hash text not null check (char_length(payload_hash) > 0),
  signed_authorization jsonb not null,
  unsigned_tx jsonb not null,
  investor_sequence bigint not null,
  status text not null default 'signed'
    check (status in ('signed', 'pulled', 'expired', 'lost', 'won', 'failed')),
  signed_at timestamptz not null default now(),
  cancel_blob text,
  created_at timestamptz not null default now()
);

comment on table public.invoice_offers is
  'Written only after the investor signature verifies. APR, BRL figures, RLUSD, and the FX rate are immutable.';

create unique index invoice_offers_one_signed_invitation
  on public.invoice_offers (invitation_id)
  where status = 'signed';

create index invoice_offers_round_status
  on public.invoice_offers (round_id, status, signed_at, id);

create index invoice_offers_investor_open
  on public.invoice_offers (investor_organisation_id)
  where status = 'signed';

alter table public.auction_tickets
  add constraint auction_tickets_offer_id_fkey
  foreign key (offer_id) references public.invoice_offers (id);

alter table public.sale_orders
  add constraint sale_orders_offer_id_fkey
  foreign key (offer_id) references public.invoice_offers (id);

create table public.auction_notices (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  invoice_id uuid not null references public.organisation_invoices (id),
  round_id uuid not null references public.auction_rounds (id),
  invitation_id uuid references public.auction_invitations (id),
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

comment on table public.auction_notices is
  'In-app invitation record. Webhook, email, and Telegram are not sent.';

create index auction_notices_organisation
  on public.auction_notices (organisation_id, created_at desc);

alter table public.auction_rounds enable row level security;
alter table public.auction_tickets enable row level security;
alter table public.auction_invitations enable row level security;
alter table public.auction_ignores enable row level security;
alter table public.invoice_offers enable row level security;
alter table public.auction_notices enable row level security;

revoke all on table public.auction_rounds from anon, authenticated;
revoke all on table public.auction_tickets from anon, authenticated;
revoke all on table public.auction_invitations from anon, authenticated;
revoke all on table public.auction_ignores from anon, authenticated;
revoke all on table public.invoice_offers from anon, authenticated;
revoke all on table public.auction_notices from anon, authenticated;

-- Hold one available outer ticket. A second caller cannot take the same row.
-- A hold older than 10 minutes with no offer returns to the pool.
create or replace function public.hold_outer_auction_ticket(p_round_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  ticket_id uuid;
begin
  update public.auction_tickets
  set state = 'available',
      held_at = null,
      prepared = null
  where round_id = p_round_id
    and kind = 'outer'
    and state = 'held'
    and offer_id is null
    and held_at < now() - interval '10 minutes';

  select id
  into ticket_id
  from public.auction_tickets
  where round_id = p_round_id
    and kind = 'outer'
    and state = 'available'
  order by ticket_sequence
  for update skip locked
  limit 1;

  if ticket_id is null then
    raise exception 'No outer ticket is available.';
  end if;

  update public.auction_tickets
  set state = 'held',
      held_at = now(),
      prepared = null
  where id = ticket_id;

  return ticket_id;
end;
$$;

create or replace function public.release_held_auction_ticket(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.auction_tickets
  set state = 'available',
      held_at = null,
      prepared = null
  where id = p_ticket_id
    and kind = 'outer'
    and state = 'held'
    and offer_id is null;
end;
$$;

-- Accepting a match no longer binds the buyer, the price, or the sold date.
create or replace function public.accept_invoice_sale(
  p_invoice_id uuid,
  p_buyer_organisation_id uuid,
  p_buyer_bucket_id uuid,
  p_sold_price numeric,
  p_sold_date date,
  p_offer_rlusd numeric,
  p_face_rlusd numeric
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'The seller accepts a signed auction bid. This does not bind a buyer.';
end;
$$;

create or replace function public.void_sale_order(
  p_order_id uuid,
  p_status text,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.sale_orders;
  invoice public.organisation_invoices;
begin
  if p_status not in ('failed', 'expired') then
    raise exception 'A sale order can only be voided as failed or expired.';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'A voided sale needs a reason.';
  end if;

  select *
  into order_row
  from public.sale_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'That sale order does not exist.';
  end if;
  if order_row.status in ('succeeded', 'failed', 'expired') then
    return;
  end if;

  select *
  into invoice
  from public.organisation_invoices
  where id = order_row.invoice_id
  for update;

  -- Exposure and the buyer are applied only when both payments validate.
  -- A pre-settlement void must not unwind a sale that was never bound, and
  -- must not clear the per-invoice issuance id.
  if invoice.buyer_organisation_id = order_row.buyer_organisation_id then
    update public.organisation_buckets
    set exposure_used_usd = greatest(0, round(exposure_used_usd - order_row.face_rlusd, 2))
    where id = order_row.buyer_bucket_id;

    update public.organisation_invoices
    set buyer_organisation_id = null,
        buyer_bucket_id = null,
        sold_price = null,
        sold_date = null
    where id = order_row.invoice_id
      and buyer_organisation_id = order_row.buyer_organisation_id;
  end if;

  update public.sale_orders
  set status = p_status,
      failure_reason = btrim(p_reason),
      updated_at = now()
  where id = order_row.id;
end;
$$;

revoke all on function public.hold_outer_auction_ticket(uuid) from public, anon, authenticated;
revoke all on function public.release_held_auction_ticket(uuid) from public, anon, authenticated;

grant execute on function public.hold_outer_auction_ticket(uuid) to service_role;
grant execute on function public.release_held_auction_ticket(uuid) to service_role;
