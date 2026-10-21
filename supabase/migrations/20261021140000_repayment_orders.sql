-- One open repayment per invoice. The Repay button claims a row, stores the
-- signed batch, then submits it. A second click resubmits that same blob.

create table public.repayment_orders (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.organisation_invoices (id),
  buyer_organisation_id uuid not null references public.organisations (id),
  amount_rlusd numeric not null check (amount_rlusd > 0),
  status text not null default 'building'
    check (status in ('building', 'submitted', 'succeeded', 'failed')),
  failure_reason text,
  signed_blob text,
  tx_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index repayment_orders_one_open
  on public.repayment_orders (invoice_id)
  where status in ('building', 'submitted');

alter table public.repayment_orders enable row level security;

revoke all on table public.repayment_orders from anon, authenticated;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint as con
    join pg_class as rel on rel.oid = con.conrelid
    join pg_namespace as nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'organisation_cash_movements'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%kind%'
  loop
    execute format('alter table public.organisation_cash_movements drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.organisation_cash_movements
  add constraint organisation_cash_movements_kind_check
  check (kind in ('deposit', 'withdrawal', 'repayment'));

alter table public.organisation_cash_movements
  add column if not exists invoice_id uuid references public.organisation_invoices (id);

create unique index if not exists organisation_cash_movements_repayment_invoice
  on public.organisation_cash_movements (invoice_id)
  where kind = 'repayment' and invoice_id is not null;

create or replace function public.finish_invoice_repayment(p_order_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.repayment_orders;
  invoice public.organisation_invoices;
begin
  select *
  into order_row
  from public.repayment_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'That repayment does not exist.';
  end if;
  if order_row.status = 'succeeded' then
    return;
  end if;
  if order_row.status <> 'submitted' or order_row.tx_hash is null then
    raise exception 'That repayment is not ready to record.';
  end if;

  select *
  into invoice
  from public.organisation_invoices
  where id = order_row.invoice_id
  for update;

  if not found then
    raise exception 'That invoice is not in the catalogue.';
  end if;
  if invoice.buyer_organisation_id is distinct from order_row.buyer_organisation_id then
    raise exception 'The repayment buyer does not match the invoice.';
  end if;

  if not invoice.repaid then
    update public.organisation_invoices
    set repayment_amount = face_value,
        repaid = true,
        repaid_date = current_date
    where id = invoice.id;

    if invoice.buyer_bucket_id is not null then
      update public.organisation_buckets
      set exposure_used_usd = greatest(0, round(exposure_used_usd - order_row.amount_rlusd, 2))
      where id = invoice.buyer_bucket_id;
    end if;
  end if;

  begin
    insert into public.organisation_cash_movements (
      organisation_id,
      kind,
      amount,
      xrpl_tx_hash,
      invoice_id
    ) values (
      order_row.buyer_organisation_id,
      'repayment',
      order_row.amount_rlusd,
      order_row.tx_hash,
      order_row.invoice_id
    );
  exception
    when unique_violation then
      null;
  end;

  update public.repayment_orders
  set status = 'succeeded',
      failure_reason = null,
      updated_at = now()
  where id = order_row.id;
end;
$$;

revoke all on function public.finish_invoice_repayment(uuid) from public, anon, authenticated;
grant execute on function public.finish_invoice_repayment(uuid) to service_role;
