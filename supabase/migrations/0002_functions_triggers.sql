-- Helper functions and triggers. SECURITY DEFINER is used so the membership
-- check can be reused inside space_members policies without recursion.

-- Membership check (SECURITY DEFINER => no recursion when used in space_members policies)
create or replace function public.is_space_member(p_space_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from space_members
    where space_id = p_space_id and user_id = auth.uid()
  );
$$;

-- Current user's role within a space (null if not a member)
create or replace function public.current_space_role(p_space_id uuid)
returns text language sql security definer set search_path = public stable as $$
  select role from space_members
  where space_id = p_space_id and user_id = auth.uid()
  limit 1;
$$;

-- Add the creator as the owner member when a space is created
create or replace function public.add_creator_as_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into space_members (space_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (space_id, user_id) do nothing;
  return new;
end;
$$;

create trigger on_space_created
  after insert on public.spaces
  for each row execute function public.add_creator_as_owner();

-- Keep tasks.updated_at fresh
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- On signup: create the profile and the default Personal space
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(new.raw_user_meta_data->>'display_name', ''),
    nullif(new.raw_user_meta_data->>'full_name', ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, display_name)
  values (new.id, v_name)
  on conflict (id) do nothing;

  -- Creating the space fires on_space_created, which adds the owner membership.
  insert into public.spaces (name, color, owner_id, is_default)
  values ('Personal', 'sage', new.id, true);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Accept an invite by token: join the space, mark the invite accepted.
-- Enforces: invite exists, is pending, is not expired, and the caller's email
-- matches the invited email.
create or replace function public.accept_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_invite invites%rowtype;
  v_email text;
begin
  select * into v_invite from invites where token = p_token;
  if not found then
    raise exception 'Invite not found';
  end if;
  if v_invite.status <> 'pending' then
    raise exception 'This invite is no longer valid';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'This invite has expired';
  end if;

  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    raise exception 'Not authenticated';
  end if;
  if lower(v_email) <> lower(v_invite.email) then
    raise exception 'This invite was sent to a different email';
  end if;

  insert into space_members (space_id, user_id, role)
  values (v_invite.space_id, auth.uid(), v_invite.role)
  on conflict (space_id, user_id) do nothing;

  update invites set status = 'accepted' where id = v_invite.id;
  return v_invite.space_id;
end;
$$;
