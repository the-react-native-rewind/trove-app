-- My Week is a beta. Off until the person turns it on in Account, so people
-- they invite are not dropped into a planning view they have not asked for.
-- The flag lives on the profile so it follows them across devices.
alter table public.profiles
  add column if not exists my_week_enabled boolean not null default false;

comment on column public.profiles.my_week_enabled is
  'When true, this person sees My Week. Defaults to false.';
