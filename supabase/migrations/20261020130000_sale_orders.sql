-- A sale order is the reservation created when an invoice is accepted.
-- The sale process turns one queued order into one all-or-nothing XRPL Batch.
-- Several orders may wait. Only one may be preparing or submitted per seller
-- and per investor, so the next batch uses sequences from a validated ledger.

alter table public.organisation_invoices
  add column mpt_issuance_id text;

comment on column public.organisation_invoices.mpt_issuance_id is
  '192-bit MPT issuance id (create sequence plus issuer account). Not a classic address. Cleared when the sale is voided.';

create table public.sale_orders (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.organisation_invoices (id),
  seller_organisation_id uuid not null references public.organisations (id),
  buyer_organisation_id uuid not null references public.organisations (id),
  buyer_bucket_id uuid not null references public.organisation_buckets (id),
  offer_rlusd numeric not null check (offer_rlusd >= 0),
  face_rlusd numeric not null check (face_rlusd >= 0),
  sold_price numeric not null check (sold_price >= 0),
  sold_date date not null,
  status text not null default 'queued'
    check (status in ('queued', 'preparing', 'submitted', 'succeeded', 'failed', 'expired')),
  failure_reason text,
  expires_at timestamptz not null,
  sequences jsonb,
  unsigned_tx jsonb,
  investor_signature jsonb,
  signed_blob text,
  tx_hash text,
  last_ledger_sequence integer,
  inner_hashes jsonb,
  mpt_issuance_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    status not in ('failed', 'expired')
    or (failure_reason is not null and length(btrim(failure_reason)) > 0)
  ),
  check (seller_organisation_id <> buyer_organisation_id)
);

create index sale_orders_queued
  on public.sale_orders (created_at, id)
  where status = 'queued';

create index sale_orders_invoice_status
  on public.sale_orders (invoice_id, status);

create unique index sale_orders_one_open_seller
  on public.sale_orders (seller_organisation_id)
  where status in ('preparing', 'submitted');

create unique index sale_orders_one_open_buyer
  on public.sale_orders (buyer_organisation_id)
  where status in ('preparing', 'submitted');

alter table public.sale_orders enable row level security;

revoke all on table public.sale_orders from anon, authenticated;

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
declare
  invoice public.organisation_invoices;
  bucket public.organisation_buckets;
  investor_available numeric;
  investor_reserved numeric;
  investor_outstanding numeric;
  investor_portfolio numeric;
  seller_available numeric := 0;
  seller_reserved numeric := 0;
  seller_outstanding numeric := 0;
  seller_portfolio numeric := 0;
  offer numeric;
  face numeric;
  price numeric;
  order_id uuid;
begin
  if p_offer_rlusd is null or p_face_rlusd is null or p_sold_price is null then
    raise exception 'The sale amount is missing.';
  end if;

  offer := round(p_offer_rlusd, 2);
  face := round(p_face_rlusd, 2);
  price := round(p_sold_price, 2);
  if offer < 0 or face < 0 or price < 0 then
    raise exception 'The sale amount must be zero or greater.';
  end if;

  select *
  into invoice
  from public.organisation_invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'That invoice is not in the catalogue.';
  end if;
  if invoice.buyer_organisation_id is not null then
    raise exception 'This invoice is already sold.';
  end if;
  if invoice.repaid then
    raise exception 'This invoice is already repaid.';
  end if;
  if invoice.seller_organisation_id = p_buyer_organisation_id then
    raise exception 'The seller and the investor are the same organisation.';
  end if;

  perform 1
  from public.organisations
  where id in (invoice.seller_organisation_id, p_buyer_organisation_id)
  order by id
  for update;

  select *
  into bucket
  from public.organisation_buckets
  where id = p_buyer_bucket_id
  for update;

  if not found then
    raise exception 'That bucket is not in the catalogue.';
  end if;
  if bucket.organisation_id <> p_buyer_organisation_id then
    raise exception 'That bucket does not belong to the investor.';
  end if;

  select available_rlusd, reserved_rlusd, outstanding_rlusd, portfolio_rlusd
  into investor_available, investor_reserved, investor_outstanding, investor_portfolio
  from public.organisation_portfolio_snapshots
  where organisation_id = p_buyer_organisation_id
  order by captured_at desc
  limit 1;

  if investor_available is null or round(investor_available - offer, 2) < 0 then
    raise exception 'The investor does not have enough available RLUSD.';
  end if;

  select available_rlusd, reserved_rlusd, outstanding_rlusd, portfolio_rlusd
  into seller_available, seller_reserved, seller_outstanding, seller_portfolio
  from public.organisation_portfolio_snapshots
  where organisation_id = invoice.seller_organisation_id
  order by captured_at desc
  limit 1;

  insert into public.organisation_portfolio_snapshots (
    organisation_id,
    available_rlusd,
    reserved_rlusd,
    outstanding_rlusd,
    portfolio_rlusd
  ) values (
    p_buyer_organisation_id,
    round(investor_available - offer, 2),
    round(investor_reserved, 2),
    round(investor_outstanding, 2),
    round(greatest(0, investor_portfolio), 2)
  );

  insert into public.organisation_portfolio_snapshots (
    organisation_id,
    available_rlusd,
    reserved_rlusd,
    outstanding_rlusd,
    portfolio_rlusd
  ) values (
    invoice.seller_organisation_id,
    round(coalesce(seller_available, 0) + offer, 2),
    round(coalesce(seller_reserved, 0), 2),
    round(coalesce(seller_outstanding, 0), 2),
    round(greatest(0, coalesce(seller_portfolio, 0) + offer), 2)
  );

  update public.organisation_invoices
  set buyer_organisation_id = p_buyer_organisation_id,
      buyer_bucket_id = p_buyer_bucket_id,
      sold_price = price,
      sold_date = p_sold_date
  where id = invoice.id;

  update public.organisation_buckets
  set exposure_used_usd = round(exposure_used_usd + face, 2)
  where id = bucket.id;

  insert into public.sale_orders (
    invoice_id,
    seller_organisation_id,
    buyer_organisation_id,
    buyer_bucket_id,
    offer_rlusd,
    face_rlusd,
    sold_price,
    sold_date,
    status,
    expires_at
  ) values (
    invoice.id,
    invoice.seller_organisation_id,
    p_buyer_organisation_id,
    bucket.id,
    offer,
    face,
    price,
    p_sold_date,
    'queued',
    now() + interval '10 minutes'
  )
  returning id into order_id;

  perform pg_notify('sale_orders', order_id::text);
  return order_id;
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
  investor_available numeric := 0;
  investor_reserved numeric := 0;
  investor_outstanding numeric := 0;
  investor_portfolio numeric := 0;
  seller_available numeric := 0;
  seller_reserved numeric := 0;
  seller_outstanding numeric := 0;
  seller_portfolio numeric := 0;
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

  perform 1
  from public.organisation_invoices
  where id = order_row.invoice_id
  for update;

  perform 1
  from public.organisations
  where id in (order_row.seller_organisation_id, order_row.buyer_organisation_id)
  order by id
  for update;

  select available_rlusd, reserved_rlusd, outstanding_rlusd, portfolio_rlusd
  into investor_available, investor_reserved, investor_outstanding, investor_portfolio
  from public.organisation_portfolio_snapshots
  where organisation_id = order_row.buyer_organisation_id
  order by captured_at desc
  limit 1;

  select available_rlusd, reserved_rlusd, outstanding_rlusd, portfolio_rlusd
  into seller_available, seller_reserved, seller_outstanding, seller_portfolio
  from public.organisation_portfolio_snapshots
  where organisation_id = order_row.seller_organisation_id
  order by captured_at desc
  limit 1;

  insert into public.organisation_portfolio_snapshots (
    organisation_id,
    available_rlusd,
    reserved_rlusd,
    outstanding_rlusd,
    portfolio_rlusd
  ) values (
    order_row.buyer_organisation_id,
    round(coalesce(investor_available, 0) + order_row.offer_rlusd, 2),
    round(coalesce(investor_reserved, 0), 2),
    round(coalesce(investor_outstanding, 0), 2),
    round(greatest(0, coalesce(investor_portfolio, 0)), 2)
  );

  insert into public.organisation_portfolio_snapshots (
    organisation_id,
    available_rlusd,
    reserved_rlusd,
    outstanding_rlusd,
    portfolio_rlusd
  ) values (
    order_row.seller_organisation_id,
    round(greatest(0, coalesce(seller_available, 0) - order_row.offer_rlusd), 2),
    round(coalesce(seller_reserved, 0), 2),
    round(coalesce(seller_outstanding, 0), 2),
    round(greatest(0, coalesce(seller_portfolio, 0) - order_row.offer_rlusd), 2)
  );

  update public.organisation_buckets
  set exposure_used_usd = greatest(0, round(exposure_used_usd - order_row.face_rlusd, 2))
  where id = order_row.buyer_bucket_id;

  update public.organisation_invoices
  set buyer_organisation_id = null,
      buyer_bucket_id = null,
      sold_price = null,
      sold_date = null,
      mpt_issuance_id = null
  where id = order_row.invoice_id
    and buyer_organisation_id = order_row.buyer_organisation_id;

  update public.sale_orders
  set status = p_status,
      failure_reason = btrim(p_reason),
      updated_at = now()
  where id = order_row.id;
end;
$$;

create or replace function public.expire_open_sale_orders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_id uuid;
  expired_count integer := 0;
begin
  for expired_id in
    select id
    from public.sale_orders
    where status in ('queued', 'preparing')
      and signed_blob is null
      and expires_at <= now()
    for update skip locked
  loop
    perform public.void_sale_order(
      expired_id,
      'expired',
      'The sale order expired before it was submitted.'
    );
    expired_count := expired_count + 1;
  end loop;
  return expired_count;
end;
$$;

create or replace function public.claim_next_sale_order()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.sale_orders;
begin
  for attempt in 1..5 loop
    begin
      select candidate.*
      into claimed
      from public.sale_orders as candidate
      where candidate.status = 'queued'
        and candidate.expires_at > now()
        and not exists (
          select 1
          from public.sale_orders as open_order
          where open_order.status in ('preparing', 'submitted')
            and (
              open_order.seller_organisation_id = candidate.seller_organisation_id
              or open_order.buyer_organisation_id = candidate.buyer_organisation_id
            )
        )
      order by candidate.created_at, candidate.id
      for update skip locked
      limit 1;

      if not found then
        return null;
      end if;

      update public.sale_orders
      set status = 'preparing',
          updated_at = now()
      where id = claimed.id
      returning * into claimed;

      return to_jsonb(claimed);
    exception
      when unique_violation then
        null;
    end;
  end loop;
  return null;
end;
$$;

revoke all on function public.accept_invoice_sale(uuid, uuid, uuid, numeric, date, numeric, numeric) from public, anon, authenticated;
revoke all on function public.void_sale_order(uuid, text, text) from public, anon, authenticated;
revoke all on function public.expire_open_sale_orders() from public, anon, authenticated;
revoke all on function public.claim_next_sale_order() from public, anon, authenticated;

grant execute on function public.accept_invoice_sale(uuid, uuid, uuid, numeric, date, numeric, numeric) to service_role;
grant execute on function public.void_sale_order(uuid, text, text) to service_role;
grant execute on function public.expire_open_sale_orders() to service_role;
grant execute on function public.claim_next_sale_order() to service_role;
