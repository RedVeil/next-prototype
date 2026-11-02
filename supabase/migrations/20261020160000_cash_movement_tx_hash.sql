alter table public.organisation_cash_movements
  add column if not exists xrpl_tx_hash text;

create unique index if not exists organisation_cash_movements_tx_hash
  on public.organisation_cash_movements (xrpl_tx_hash)
  where xrpl_tx_hash is not null;
