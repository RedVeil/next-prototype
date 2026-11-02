alter table public.organisation_bucket_features
  add column mode text not null default 'yes' check (mode in ('yes', 'no'));
