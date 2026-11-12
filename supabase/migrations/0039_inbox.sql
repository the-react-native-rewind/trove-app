-- Private per-user Inbox. A frictionless capture surface: a line of text and
-- an optional source (the app, or a connected tool/agent). It is never shared
-- with a circle.
--
-- The Inbox is a funnel, not a place to work from. A line can only be:
--   * accepted  -> it becomes an action in a circle (accepted_at + task_id set),
--   * dismissed -> the person did not want it (dismissed_at set).
-- A line is never ticked or completed here. Resolved rows stay in the table so
-- a connected tool re-posting the same thought does not silently reappear as new
-- work, and so an accept can be undone. The app reads only unresolved rows
-- (accepted_at is null and dismissed_at is null).
--
-- user_id defaults to auth.uid() so an authenticated insert under RLS does not
-- have to pass it. The add_inbox_item function exists for connected tools going
-- through the MCP server; the app inserts, updates, and reads directly under RLS.

create table public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  text text not null,
  -- Where the line came from: 'app' for a manual capture, or a short tool name
  -- (for example 'grok', 'email') for a connected source. Shown as a small tag.
  source text,
  -- Set when the line is turned into an action. task_id links the action it became.
  accepted_at timestamptz,
  task_id uuid references public.tasks(id) on delete set null,
  -- Set when the line is declined.
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint inbox_items_text_ok check (char_length(btrim(text)) between 1 and 4000),
  constraint inbox_items_source_ok check (source is null or char_length(btrim(source)) between 1 and 60),
  -- A line is accepted, dismissed, or neither, but not both at once.
  constraint inbox_items_one_outcome check (accepted_at is null or dismissed_at is null),
  -- A linked task only belongs on an accepted line.
  constraint inbox_items_task_when_accepted check (task_id is null or accepted_at is not null)
);

-- Unresolved lines for this person, newest first. The inbox reads this.
create index inbox_items_open_idx
  on public.inbox_items (user_id, created_at desc)
  where accepted_at is null and dismissed_at is null;

create index inbox_items_task_idx
  on public.inbox_items (task_id)
  where task_id is not null;

comment on table public.inbox_items is
  'One person''s private Inbox: captured lines awaiting triage. A line is accepted into a circle (becomes an action) or dismissed. It is never completed here. Resolved rows stay as history.';
comment on column public.inbox_items.source is
  'Where the line came from. ''app'' for a manual capture, or a short connected-tool name.';

alter table public.inbox_items enable row level security;

create policy "read own inbox items" on public.inbox_items
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "insert own inbox items" on public.inbox_items
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "update own inbox items" on public.inbox_items
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "delete own inbox items" on public.inbox_items
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.inbox_items from public, anon;
grant select, insert, update, delete on table public.inbox_items to authenticated;
grant all on table public.inbox_items to service_role;

-- Append a line to the caller's Inbox. Used by connected tools through the MCP
-- server, and available to the app. Security definer: it takes the user from
-- auth.uid() and only ever writes that person's own row.
create or replace function public.add_inbox_item(p_text text, p_source text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_text text := nullif(btrim(p_text), '');
  v_source text := nullif(btrim(p_source), '');
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if v_text is null then
    raise exception 'Write the line before adding it';
  end if;
  if char_length(v_text) > 4000 then
    raise exception 'A line can be 4000 characters or fewer';
  end if;
  if v_source is not null and char_length(v_source) > 60 then
    raise exception 'A source name can be 60 characters or fewer';
  end if;

  insert into public.inbox_items (user_id, text, source)
  values (v_uid, v_text, v_source)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.add_inbox_item(text, text) from public, anon;
grant execute on function public.add_inbox_item(text, text) to authenticated, service_role;

comment on function public.add_inbox_item(text, text) is
  'Append a line to the caller''s private Inbox for later triage. text is required; source is an optional short tag for where it came from. Returns the new line id.';
