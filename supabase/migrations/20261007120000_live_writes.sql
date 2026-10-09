-- Live writes for companies, investors, buckets, and multisig provisioning.
-- Ledger, bot-wallet, deposit, and withdrawal writes stay on the service role.

alter table public.investors
  add column if not exists own_xrpl_address text;

alter table public.withdrawals
  add column if not exists xumm_uuid text;

create table if not exists public.team_signer_keys (
  id uuid primary key default gen_random_uuid(),
  address text not null unique,
  label text not null default '',
  seed_ciphertext text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.provision_secrets (
  id text primary key,
  address text not null,
  seed_ciphertext text not null,
  created_at timestamptz not null default now()
);

alter table public.team_signer_keys enable row level security;
alter table public.provision_secrets enable row level security;
revoke all on table public.team_signer_keys from anon, authenticated;
revoke all on table public.provision_secrets from anon, authenticated;

create unique index if not exists deposits_tx_hash
  on public.deposits (xrpl_tx_hash)
  where xrpl_tx_hash is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_role text;
begin
  if new.raw_app_meta_data->>'role' = 'admin' then
    next_role := 'admin';
  elsif new.raw_user_meta_data->>'role' = 'investor' then
    next_role := 'investor';
  else
    next_role := 'company';
  end if;

  insert into public.profiles (id, role)
  values (new.id, next_role)
  on conflict (id) do update set role = excluded.role;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_own_bot_paused(next_paused boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.investors
  set bot_paused = next_paused
  where profile_id = auth.uid()
    and application_status = 'accepted'
    and access_status = 'allowed';

  if not found then
    raise exception 'Bot pause is available only for an accepted, allowed investor';
  end if;
end;
$$;

grant execute on function public.set_own_bot_paused(boolean) to authenticated;

create policy platform_settings_select on public.platform_settings
  for select to authenticated
  using (true);

create policy platform_settings_admin_update on public.platform_settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy companies_insert_own on public.companies
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and source = 'application'
    and application_status = 'pending'
    and access_status = 'allowed'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'company'
    )
    and exists (
      select 1 from public.platform_settings s
      where s.company_applications_allowed
    )
  );

create policy companies_update_own_pending on public.companies
  for update to authenticated
  using (
    profile_id = auth.uid()
    and application_status = 'pending'
    and access_status = 'allowed'
  )
  with check (
    profile_id = auth.uid()
    and application_status = 'pending'
    and source = 'application'
    and access_status = 'allowed'
  );

create policy companies_admin_insert on public.companies
  for insert to authenticated
  with check (public.is_admin());

create policy companies_admin_update on public.companies
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy investors_insert_own on public.investors
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and source = 'application'
    and application_status = 'pending'
    and access_status = 'allowed'
    and bot_paused = false
    and own_xrpl_address is not null
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'investor'
    )
    and exists (
      select 1 from public.platform_settings s
      where s.investor_applications_allowed
    )
  );

create policy investors_update_own_pending on public.investors
  for update to authenticated
  using (
    profile_id = auth.uid()
    and application_status = 'pending'
    and access_status = 'allowed'
  )
  with check (
    profile_id = auth.uid()
    and application_status = 'pending'
    and source = 'application'
    and access_status = 'allowed'
    and bot_paused = false
    and own_xrpl_address is not null
  );

create policy investors_admin_insert on public.investors
  for insert to authenticated
  with check (public.is_admin());

create policy investors_admin_update on public.investors
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy buckets_insert_own on public.buckets
  for insert to authenticated
  with check (
    exists (
      select 1 from public.investors i
      where i.id = investor_id
        and i.profile_id = auth.uid()
        and i.application_status = 'accepted'
        and i.access_status = 'allowed'
    )
  );

create policy buckets_update_own on public.buckets
  for update to authenticated
  using (
    exists (
      select 1 from public.investors i
      where i.id = buckets.investor_id
        and i.profile_id = auth.uid()
        and i.access_status = 'allowed'
    )
  )
  with check (
    exists (
      select 1 from public.investors i
      where i.id = investor_id
        and i.profile_id = auth.uid()
        and i.access_status = 'allowed'
    )
  );

create policy buckets_delete_own on public.buckets
  for delete to authenticated
  using (
    exists (
      select 1 from public.investors i
      where i.id = buckets.investor_id
        and i.profile_id = auth.uid()
        and i.access_status = 'allowed'
    )
  );
