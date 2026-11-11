-- Track whether a person has been through onboarding.
-- New accounts (anonymous or email) get NULL and are sent through the voice
-- onboarding; existing accounts are backfilled so they skip it.

alter table public.profiles
  add column if not exists onboarded_at timestamptz;

update public.profiles
  set onboarded_at = coalesce(onboarded_at, created_at)
  where onboarded_at is null;
