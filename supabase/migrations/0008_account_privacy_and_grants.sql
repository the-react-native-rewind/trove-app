-- Account deletion, tighter profile visibility, owner protection, storage
-- hardening, and explicit API grants so a fresh Supabase project matches
-- what the app expects.

-- Legacy "backlog" rows predate the three-column board. Fold them into To do
-- so they stay visible, then lock the allowed statuses.
update public.tasks set status = 'todo' where status = 'backlog';

do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'tasks'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%status%';
  if cname is not null then
    execute format('alter table public.tasks drop constraint %I', cname);
  end if;
end $$;

alter table public.tasks
  add constraint tasks_status_check
  check (status in ('todo', 'in_progress', 'done'));

-- One pending invite per email per space.
create unique index if not exists invites_one_pending_per_email
  on public.invites (space_id, lower(email))
  where status = 'pending';

-- Profiles are visible to yourself and to people who share a space with you.
drop policy if exists "read profiles" on public.profiles;
create policy "read profiles you share a space with" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.space_members mine
      join public.space_members theirs on theirs.space_id = mine.space_id
      where mine.user_id = auth.uid()
        and theirs.user_id = profiles.id
    )
  );

-- The owner row cannot be demoted, promoted around, or deleted through the
-- API. delete_own_account() is security definer and bypasses these policies
-- when it transfers a group before the account goes away.
drop policy if exists "admins update members" on public.space_members;
create policy "admins update members" on public.space_members
  for update to authenticated
  using (
    current_space_role(space_id) in ('owner', 'admin')
    and role <> 'owner'
  )
  with check (
    current_space_role(space_id) in ('owner', 'admin')
    and role <> 'owner'
  );

drop policy if exists "admins or self remove member" on public.space_members;
create policy "admins or self remove member" on public.space_members
  for delete to authenticated
  using (
    role <> 'owner'
    and (
      current_space_role(space_id) in ('owner', 'admin')
      or user_id = auth.uid()
    )
  );

-- Safe cast for storage paths. A non-uuid folder must deny, not error.
create or replace function public.safe_object_space_id(object_name text)
returns uuid
language plpgsql
stable
set search_path = public, storage
as $$
declare
  seg text;
begin
  seg := (storage.foldername(object_name))[1];
  if seg is null or seg !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return seg::uuid;
exception when others then
  return null;
end;
$$;

drop policy if exists "members read task-media" on storage.objects;
drop policy if exists "writers upload task-media" on storage.objects;
drop policy if exists "writers delete task-media" on storage.objects;

create policy "members read task-media" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'task-media'
    and is_space_member(public.safe_object_space_id(name))
  );

create policy "writers upload task-media" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'task-media'
    and current_space_role(public.safe_object_space_id(name)) in ('owner', 'admin', 'member')
  );

create policy "writers delete task-media" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'task-media'
    and current_space_role(public.safe_object_space_id(name)) in ('owner', 'admin', 'member')
  );

-- A hosted project already has RLS on storage.objects. Enabling it again is
-- a no-op for the owner; if this role cannot alter the table, keep going.
do $$
begin
  alter table storage.objects enable row level security;
exception
  when insufficient_privilege then
    raise notice 'storage.objects RLS is managed by Supabase; left as-is';
end $$;

update storage.buckets
set
  file_size_limit = 52428800,
  allowed_mime_types = array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
where id = 'task-media';

update storage.buckets
set
  file_size_limit = 5242880,
  allowed_mime_types = array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'
  ]
where id = 'avatars';

-- Delete the signed-in account. Groups they own are handed to another member
-- when one exists (admins first), otherwise the group is deleted with them.
-- Their personal space is removed with the profile cascade.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  uid uuid := auth.uid();
  sp record;
  successor uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  delete from storage.objects
  where bucket_id = 'avatars'
    and (storage.foldername(name))[1] = uid::text;

  for sp in
    select id from public.spaces
    where owner_id = uid and is_default = false
  loop
    select sm.user_id into successor
    from public.space_members sm
    where sm.space_id = sp.id
      and sm.user_id <> uid
    order by
      case sm.role when 'admin' then 0 when 'member' then 1 else 2 end,
      sm.created_at,
      sm.user_id
    limit 1;

    if successor is null then
      delete from storage.objects
      where bucket_id = 'task-media'
        and (storage.foldername(name))[1] = sp.id::text;
      delete from public.spaces where id = sp.id;
    else
      update public.space_members
      set role = 'owner'
      where space_id = sp.id and user_id = successor;
      update public.spaces
      set owner_id = successor
      where id = sp.id;
      delete from public.space_members
      where space_id = sp.id and user_id = uid;
    end if;
  end loop;

  delete from storage.objects
  where bucket_id = 'task-media'
    and (storage.foldername(name))[1] in (
      select id::text from public.spaces where owner_id = uid and is_default
    );

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public;
revoke all on function public.safe_object_space_id(text) from public;

-- Explicit grants. Supabase also grants via default privileges; stating them
-- here keeps a from-scratch database working if those defaults differ.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon';
    execute 'grant usage on schema public to anon';
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant usage on schema public to authenticated';
    execute 'grant select, insert, update, delete on all tables in schema public to authenticated';
    execute 'grant usage, select on all sequences in schema public to authenticated';
    execute 'grant execute on function public.is_space_member(uuid) to authenticated';
    execute 'grant execute on function public.current_space_role(uuid) to authenticated';
    execute 'grant execute on function public.accept_invite(text) to authenticated';
    execute 'grant execute on function public.delete_own_account() to authenticated';
    execute 'grant execute on function public.safe_object_space_id(text) to authenticated';
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema public to service_role';
    execute 'grant all on all tables in schema public to service_role';
    execute 'grant usage, select on all sequences in schema public to service_role';
    execute 'grant execute on all functions in schema public to service_role';
  end if;
end $$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.add_creator_as_owner() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.safe_object_space_id(text) from anon;
