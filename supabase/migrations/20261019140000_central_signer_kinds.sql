-- Governance uses the connected wallet. Issuer and repayment also sign with the governance account.

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
      and rel.relname = 'org_multisig_signers'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%kind%'
  loop
    execute format('alter table public.org_multisig_signers drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.org_multisig_signers
  add constraint org_multisig_signers_kind_check
  check (kind in ('user', 'bot', 'wallet', 'governance'));

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
      and rel.relname = 'org_multisig_destinations'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%kind%'
  loop
    execute format('alter table public.org_multisig_destinations drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.org_multisig_destinations
  add constraint org_multisig_destinations_kind_check
  check (kind in ('wallet', 'bot', 'repayment', 'governance'));
