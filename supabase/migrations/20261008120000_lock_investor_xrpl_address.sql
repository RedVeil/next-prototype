-- Once an investor account is stored, only an admin or the service role can replace it.
create or replace function public.prevent_investor_xrpl_address_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.own_xrpl_address is not distinct from old.own_xrpl_address then
    return new;
  end if;
  if old.own_xrpl_address is null then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  raise exception 'The XRPL account cannot be changed';
end;
$$;

drop trigger if exists investors_lock_xrpl_address on public.investors;
create trigger investors_lock_xrpl_address
  before update of own_xrpl_address on public.investors
  for each row
  execute function public.prevent_investor_xrpl_address_change();
