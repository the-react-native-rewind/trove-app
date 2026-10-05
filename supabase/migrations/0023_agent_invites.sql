-- An invite can be tagged as an agent (a bot helper). Humans stay the default.
-- Accepting the invite copies the flag onto the new membership. An existing
-- member is left as they are, the same way a second invite does not change role.

alter table public.invites
  add column is_agent boolean not null default false;

alter table public.space_members
  add column is_agent boolean not null default false;

comment on column public.invites.is_agent is
  'When true, accepting this invite marks the new member as an agent. Human invites are false.';

comment on column public.space_members.is_agent is
  'True when this member joined through an agent invite. Humans are false.';

create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites%rowtype;
  v_email text;
begin
  select * into v_invite from public.invites where token = p_token;
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

  insert into public.space_members (space_id, user_id, role, is_agent)
  values (v_invite.space_id, auth.uid(), v_invite.role, v_invite.is_agent)
  on conflict (space_id, user_id) do nothing;

  update public.invites set status = 'accepted' where id = v_invite.id;
  return v_invite.space_id;
end;
$$;

revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;

create or replace function public.accept_pending_invites_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_invite record;
begin
  select email into v_email from auth.users where id = p_user_id;
  if v_email is null then
    return;
  end if;

  for v_invite in
    select *
    from public.invites
    where status = 'pending'
      and expires_at >= now()
      and lower(email) = lower(v_email)
    order by created_at
    for update skip locked
  loop
    insert into public.space_members (space_id, user_id, role, is_agent)
    values (v_invite.space_id, p_user_id, v_invite.role, v_invite.is_agent)
    on conflict (space_id, user_id) do nothing;

    update public.invites
    set status = 'accepted'
    where id = v_invite.id
      and status = 'pending';
  end loop;
end;
$$;

revoke all on function public.accept_pending_invites_for_user(uuid)
  from public, anon, authenticated;
