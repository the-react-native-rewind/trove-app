-- Auto-accept pending circle invites when a user becomes usable
-- (email confirmed, or account created already confirmed).
--
-- Sign-up creates the profile via handle_new_user but does not join invited
-- circles. Previously the invitee had to open the invite link and call
-- accept_invite. This wires the same membership + invite-status updates into
-- the existing confirmation triggers so matching pending invites are accepted
-- automatically.
--
-- Race with clicking the invite link: both paths use ON CONFLICT DO NOTHING
-- and only flip pending -> accepted, so whichever wins is fine. Expired
-- invites are left alone. Multiple pending invites across circles are all
-- accepted. Role comes from the invite (no escalation).

create or replace function public.accept_pending_invites_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    insert into public.space_members (space_id, user_id, role)
    values (v_invite.space_id, p_user_id, v_invite.role)
    on conflict (space_id, user_id) do nothing;

    update public.invites
    set status = 'accepted'
    where id = v_invite.id
      and status = 'pending';
  end loop;
end;
$function$;

revoke all on function public.accept_pending_invites_for_user(uuid)
  from public, anon, authenticated;

-- Extend the existing confirmation hook (welcome email) to also accept invites.
-- Triggers that call this (unchanged):
--   on_auth_user_confirmed          — first email_confirmed_at set
--   on_auth_user_created_confirmed  — insert already confirmed
create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform public.notify_email_hook(
    jsonb_build_object('type', 'welcome', 'user_id', new.id)
  );
  perform public.accept_pending_invites_for_user(new.id);
  return new;
end;
$function$;

revoke all on function public.handle_user_confirmed()
  from public, anon, authenticated;
