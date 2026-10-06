-- Cap circle invites at 25 per person per rolling 24 hours.
--
-- Every pending invite emails the address (trigger invites_send_email from
-- migration 0013). The MCP tool checks public.recent_invite_count before it
-- inserts. This trigger is the backstop for the app and for two inserts at
-- once. INVITE_LIMIT_PER_DAY in supabase/functions/_shared/inviteLimit.ts is
-- the same number. Revoked rows still count: the email was already queued.

create or replace function public.invites_limit_daily()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
begin
  if new.invited_by is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('invites:' || new.invited_by::text));

  select count(*) into recent_count
  from public.invites
  where invited_by = new.invited_by
    and created_at >= now() - interval '24 hours';

  if recent_count >= 25 then
    raise exception 'You can send 25 invites in 24 hours. Try again later.';
  end if;

  return new;
end;
$$;

revoke all on function public.invites_limit_daily() from public, anon, authenticated;

drop trigger if exists invites_limit_daily on public.invites;
create trigger invites_limit_daily
  before insert on public.invites
  for each row execute function public.invites_limit_daily();

-- Count for the signed-in person. security definer so the cap includes
-- invites in circles they no longer administer. RLS would hide those.
create or replace function public.recent_invite_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.invites
  where invited_by = auth.uid()
    and created_at >= now() - interval '24 hours';
$$;

revoke all on function public.recent_invite_count() from public, anon;
grant execute on function public.recent_invite_count() to authenticated;
