-- Weights for the risk page. The organisation baseline is what a manual score sets.
-- The stored risk_score is the baseline after repaid-invoice points.

alter table public.organisations
  add column risk_score_base integer not null default 10000
  check (risk_score_base between 0 and 10000);

update public.organisations
set risk_score_base = risk_score;

create table public.risk_parameters (
  key text primary key,
  label text not null,
  weight numeric not null,
  sort integer not null
);

insert into public.risk_parameters (key, label, weight, sort) values
  ('obligor_score', 'Obligor score', 80, 1),
  ('seller_score', 'Seller score', 20, 2),
  ('repaid_seller_points', 'Points taken off a seller for each repaid invoice', 100, 3),
  ('repaid_obligor_points', 'Points taken off an obligor for each repaid invoice', 0, 4);

alter table public.risk_parameters enable row level security;
