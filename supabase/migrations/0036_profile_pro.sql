-- Trove Pro entitlement, mirrored from the billing provider (RevenueCat).
-- Only the person who owns/organises circles needs this; invited members never
-- do. A webhook will keep this in sync; the column is the source of truth the
-- app and RLS read.

alter table public.profiles
  add column if not exists is_pro boolean not null default false;
