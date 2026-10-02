-- Minimal auth + storage stand-ins so the migrations can run on plain Postgres.
-- A real Supabase project already has these schemas; do not run this file there.

create extension if not exists pgcrypto;

create schema if not exists auth;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

-- pg_net and Vault stand-ins for migration 0013 (transactional emails).
create schema if not exists net;
create or replace function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb,
  timeout_milliseconds integer default 5000
)
returns bigint
language sql
as $$ select 0::bigint; $$;

create schema if not exists vault;
create table if not exists vault.decrypted_secrets (
  name text primary key,
  decrypted_secret text
);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

grant anon to current_user;
grant authenticated to current_user;
grant service_role to current_user;

create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  created_at timestamptz not null default now()
);

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select case
    when name is null or position('/' in name) = 0 then array[]::text[]
    else (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  end;
$$;

alter table storage.objects enable row level security;

-- Hosted Supabase rejects every SQL delete on storage.objects, including a
-- delete that matches zero rows, because this trigger is FOR EACH STATEMENT.
-- Account deletion must use the Storage API. See delete-account.
create or replace function storage.protect_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
    using errcode = '42501';
end;
$$;

drop trigger if exists protect_delete on storage.objects;
create trigger protect_delete
  before delete on storage.objects
  for each statement
  execute function storage.protect_delete();

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

grant usage on schema storage to anon, authenticated, service_role;
grant all on all tables in schema storage to authenticated, service_role;
grant select on storage.objects to anon;
grant select on storage.buckets to anon, authenticated, service_role;
