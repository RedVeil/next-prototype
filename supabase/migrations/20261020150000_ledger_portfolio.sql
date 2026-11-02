-- Portfolio snapshots are observations of the wallets.
-- Accepting a sale no longer rewrites them. It checks the latest stored
-- available balance, minus RLUSD already committed to an open sale.

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
  committed numeric := 0;
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
  where id = p_buyer_organisation_id
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

  select available_rlusd
  into investor_available
  from public.organisation_portfolio_snapshots
  where organisation_id = p_buyer_organisation_id
  order by captured_at desc
  limit 1;

  select coalesce(sum(offer_rlusd), 0)
  into committed
  from public.sale_orders
  where buyer_organisation_id = p_buyer_organisation_id
    and status in ('queued', 'preparing', 'submitted');

  if investor_available is null or round(investor_available - committed - offer, 2) < 0 then
    raise exception 'The investor does not have enough available RLUSD.';
  end if;

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
