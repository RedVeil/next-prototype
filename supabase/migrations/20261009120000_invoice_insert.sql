-- Companies can store their own invoices once accepted and allowed.
-- Status values come from the insert. The table checks keep them in range.

create policy invoices_insert_own on public.invoices
  for insert to authenticated
  with check (
    exists (
      select 1 from public.companies c
      where c.id = company_id
        and c.profile_id = auth.uid()
        and c.application_status = 'accepted'
        and c.access_status = 'allowed'
    )
  );
