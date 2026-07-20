-- Trove core schema. Applied to the hosted project on 2026-06-30; committed
-- here so the backend is reproducible and auditable.
create extension if not exists pgcrypto;

-- profiles mirrors auth.users
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default 'sage',
  owner_id uuid not null references public.profiles(id) on delete cascade,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.space_members (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner','admin','member','viewer')),
  created_at timestamptz not null default now(),
  unique (space_id, user_id)
);
create index space_members_user_idx on public.space_members(user_id);
create index space_members_space_idx on public.space_members(space_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('backlog','todo','in_progress','done')),
  position double precision not null default 0,
  assignee_id uuid references public.profiles(id) on delete set null,
  priority text check (priority in ('low','medium','high')),
  due_date date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_space_status_idx on public.tasks(space_id, status, position);
create index tasks_assignee_idx on public.tasks(assignee_id);

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  name text not null,
  color text not null default 'sage'
);

create table public.task_labels (
  task_id uuid not null references public.tasks(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  primary key (task_id, label_id)
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin','member','viewer')),
  invited_by uuid references public.profiles(id) on delete set null,
  token text unique not null default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days'
);
create index invites_email_idx on public.invites(lower(email));
create index invites_space_idx on public.invites(space_id);
