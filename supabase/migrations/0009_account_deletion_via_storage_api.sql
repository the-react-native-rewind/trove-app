-- Account deletion no longer touches storage.objects. Hosted Supabase
-- installs storage.protect_delete, a BEFORE DELETE statement trigger that
-- rejects every SQL delete on storage.objects (even when zero rows match)
-- with 42501. The delete-account edge function removes files through the
-- Storage API, calls this function with the service role, then
-- auth.admin.deleteUser.

drop function if exists public.delete_own_account();

-- Ownership transfer and space deletion only. Does not delete storage
-- objects and does not delete the auth user.
create or replace function public.delete_account_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sp record;
  successor uuid;
begin
  if p_user_id is null then
    raise exception 'user id is required';
  end if;

  -- Media this person uploaded, including in groups that will be handed on.
  -- Rows in a space deleted below would cascade; removing them here keeps a
  -- surviving group from pointing at files the Storage API already removed.
  delete from public.task_attachments
  where created_by = p_user_id;

  for sp in
    select id from public.spaces
    where owner_id = p_user_id and is_default = false
  loop
    select sm.user_id into successor
    from public.space_members sm
    where sm.space_id = sp.id
      and sm.user_id <> p_user_id
    order by
      case sm.role when 'admin' then 0 when 'member' then 1 else 2 end,
      sm.created_at,
      sm.user_id
    limit 1;

    if successor is null then
      delete from public.spaces where id = sp.id;
    else
      update public.space_members
      set role = 'owner'
      where space_id = sp.id and user_id = successor;
      update public.spaces
      set owner_id = successor
      where id = sp.id;
      delete from public.space_members
      where space_id = sp.id and user_id = p_user_id;
    end if;
  end loop;
end;
$$;

revoke all on function public.delete_account_data(uuid) from public;
revoke all on function public.delete_account_data(uuid) from anon;
revoke all on function public.delete_account_data(uuid) from authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;
