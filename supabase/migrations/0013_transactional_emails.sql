-- Transactional emails: welcome after a person confirms their email, and a
-- circle invite email when someone creates an invite.
--
-- Postgres posts { type, id } to the send-email edge function through pg_net.
-- The function reads everything else with the service role and sends through
-- Resend. Nothing here blocks sign-up or invite creation: pg_net is async and
-- failures only raise a warning.
--
-- Needs two Vault secrets (set once, out of band, never committed):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-email', 'trove_email_hook_url');
--   select vault.create_secret('<same value as the TROVE_EMAIL_HOOK_SECRET function secret>', 'trove_email_hook_secret');
-- Without them the triggers do nothing.

-- pg_net ships with Supabase. The plain-Postgres test bootstrap stubs net.http_post instead.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
end $$;

create or replace function public.notify_email_hook(payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'trove_email_hook_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'trove_email_hook_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    body := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-trove-hook-secret', v_secret
    ),
    timeout_milliseconds := 10000
  );
exception when others then
  raise warning 'notify_email_hook failed: %', sqlerrm;
end;
$$;

revoke all on function public.notify_email_hook(jsonb) from public, anon, authenticated;

-- Welcome email: fires once, when email_confirmed_at is first set (the person
-- opened the confirmation link), or at insert when the account is created
-- already confirmed (Confirm email off, or created from the dashboard).
create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notify_email_hook(jsonb_build_object('type', 'welcome', 'user_id', new.id));
  return new;
end;
$$;

revoke all on function public.handle_user_confirmed() from public, anon, authenticated;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_user_confirmed();

drop trigger if exists on_auth_user_created_confirmed on auth.users;
create trigger on_auth_user_created_confirmed
  after insert on auth.users
  for each row
  when (new.email_confirmed_at is not null)
  execute function public.handle_user_confirmed();

-- Circle invite email: every new pending invite.
create or replace function public.handle_invite_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notify_email_hook(jsonb_build_object('type', 'invite', 'invite_id', new.id));
  return new;
end;
$$;

revoke all on function public.handle_invite_created() from public, anon, authenticated;

drop trigger if exists invites_send_email on public.invites;
create trigger invites_send_email
  after insert on public.invites
  for each row
  when (new.status = 'pending')
  execute function public.handle_invite_created();
