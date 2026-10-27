-- Handoffs and the agent log.
--
-- Handing a task off replaces the caller as assignee, keeps their position,
-- and can set the status and a note. The latest note is what the task row
-- shows. Agents write short entries; humans do not. Both tables are written
-- by security-definer RPCs so the checks live in one place.
--
-- Policies go through tasks and the existing definer helpers. They do not
-- query their own table, which is what made 42P17 recurse on Today.

-- ---------------------------------------------------------------------------
-- task_handoffs. One row per handoff. The latest row is the note.
-- ---------------------------------------------------------------------------

create table public.task_handoffs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  from_user_id uuid references public.profiles(id) on delete set null,
  to_user_id uuid references public.profiles(id) on delete set null,
  status text not null check (status in ('todo', 'in_progress')),
  note text null check (note is null or char_length(btrim(note, E' \t\n\r')) between 1 and 2000),
  note_edited_at timestamptz null,
  -- clock_timestamp(), not now(): now() is frozen for the whole transaction,
  -- so two handoffs in one transaction would tie and "latest" would be arbitrary.
  created_at timestamptz not null default clock_timestamp()
);

create index task_handoffs_task_created_idx
  on public.task_handoffs (task_id, created_at desc);

create index task_handoffs_to_user_idx
  on public.task_handoffs (to_user_id, created_at desc);

comment on table public.task_handoffs is
  'One row each time a member hands a task to someone else. The latest row is the note shown on the task.';

-- ---------------------------------------------------------------------------
-- agent_log_entries. Agents only, capped at 500 per task in the RPC.
-- ---------------------------------------------------------------------------

create table public.agent_log_entries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(btrim(body, E' \t\n\r')) between 1 and 4000),
  created_at timestamptz not null default clock_timestamp()
);

create index agent_log_entries_task_created_idx
  on public.agent_log_entries (task_id, created_at desc);

comment on table public.agent_log_entries is
  'Short notes agents leave on a task. Shown on task detail. Humans do not write here.';

-- ---------------------------------------------------------------------------
-- True when the signed-in person is an agent member of the circle.
-- Same shape as is_space_member, so policies and RPCs can call it.
-- ---------------------------------------------------------------------------

create function public.is_space_agent(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from space_members
    where space_id = p_space_id
      and user_id = (select auth.uid())
      and is_agent
  );
$$;

revoke all on function public.is_space_agent(uuid) from public, anon;
grant execute on function public.is_space_agent(uuid) to authenticated;

comment on function public.is_space_agent(uuid) is
  'True when the signed-in person is an agent member of the circle.';

-- ---------------------------------------------------------------------------
-- Latest handoff per task. Security invoker, so the caller's RLS applies.
-- The app prefers an embedded limit of 1. This view is the fallback.
-- ---------------------------------------------------------------------------

create view public.task_latest_handoff
with (security_invoker = true) as
select distinct on (task_id)
  id,
  task_id,
  from_user_id,
  to_user_id,
  status,
  note,
  note_edited_at,
  created_at
from public.task_handoffs
order by task_id, created_at desc, id desc;

comment on view public.task_latest_handoff is
  'The newest handoff for each task. Security invoker, so circle membership still applies.';

revoke all on table public.task_latest_handoff from public, anon;
grant select on table public.task_latest_handoff to authenticated;

-- ---------------------------------------------------------------------------
-- RLS. No policy reads the table it protects.
-- ---------------------------------------------------------------------------

alter table public.task_handoffs enable row level security;
alter table public.agent_log_entries enable row level security;

create policy "members read task_handoffs"
  on public.task_handoffs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tasks t
      where t.id = task_id
        and public.is_space_member(t.space_id)
    )
  );

create policy "members read agent_log_entries"
  on public.agent_log_entries
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tasks t
      where t.id = task_id
        and public.is_space_member(t.space_id)
    )
  );

create policy "author or admins delete agent_log_entries"
  on public.agent_log_entries
  for delete
  to authenticated
  using (
    author_id = (select auth.uid())
    or exists (
      select 1
      from public.tasks t
      where t.id = task_id
        and public.current_space_role(t.space_id) in ('owner', 'admin')
    )
  );

revoke all on table public.task_handoffs from public, anon;
grant select on table public.task_handoffs to authenticated;
grant all on table public.task_handoffs to service_role;

revoke all on table public.agent_log_entries from public, anon;
grant select, delete on table public.agent_log_entries to authenticated;
grant all on table public.agent_log_entries to service_role;

-- ---------------------------------------------------------------------------
-- handoff_task. One transaction: checks, assignee swap, status, note.
-- ---------------------------------------------------------------------------

create function public.handoff_task(
  p_task_id uuid,
  p_to_user_id uuid,
  p_status text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_task public.tasks%rowtype;
  v_position integer;
  v_status text;
  v_note text := nullif(btrim(p_note, E' \t\n\r'), '');
  v_handoff public.task_handoffs%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_task
  from public.tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'Task not found';
  end if;

  if not public.is_space_member(v_task.space_id) then
    raise exception 'Task not found';
  end if;

  if coalesce(public.current_space_role(v_task.space_id), '') not in ('owner', 'admin', 'member') then
    raise exception 'You can''t edit this task';
  end if;

  select position
  into v_position
  from public.task_assignees
  where task_id = p_task_id
    and user_id = v_uid;

  if not found then
    raise exception 'This task isn''t yours to hand off. Use assign_task.';
  end if;

  if p_to_user_id = v_uid then
    raise exception 'You already have this task';
  end if;

  if p_to_user_id is null or not exists (
    select 1
    from public.space_members m
    where m.space_id = v_task.space_id
      and m.user_id = p_to_user_id
  ) then
    raise exception 'That person is not in this circle';
  end if;

  if p_status is not null and p_status not in ('todo', 'in_progress') then
    if p_status = 'done' then
      raise exception 'To finish a task, complete it instead';
    end if;
    raise exception 'Status must be todo or in_progress';
  end if;

  if p_status is not null then
    v_status := p_status;
  elsif v_task.status = 'done' then
    v_status := 'todo';
  elsif v_task.status in ('todo', 'in_progress') then
    v_status := v_task.status;
  else
    v_status := 'todo';
  end if;

  if v_note is not null and char_length(v_note) > 2000 then
    raise exception 'A handoff note can be 2000 characters or fewer';
  end if;

  delete from public.task_assignees
  where task_id = p_task_id
    and user_id = v_uid;

  insert into public.task_assignees (task_id, user_id, position)
  values (p_task_id, p_to_user_id, v_position)
  on conflict (task_id, user_id) do nothing;

  update public.tasks
  set status = v_status
  where id = p_task_id
    and status is distinct from v_status;

  insert into public.task_handoffs (task_id, from_user_id, to_user_id, status, note)
  values (p_task_id, v_uid, p_to_user_id, v_status, v_note)
  returning * into v_handoff;

  return jsonb_build_object(
    'handoff', jsonb_build_object(
      'id', v_handoff.id,
      'task_id', v_handoff.task_id,
      'from_user_id', v_handoff.from_user_id,
      'to_user_id', v_handoff.to_user_id,
      'status', v_handoff.status,
      'note', v_handoff.note,
      'note_edited_at', v_handoff.note_edited_at,
      'created_at', v_handoff.created_at
    ),
    'task_id', p_task_id
  );
end;
$$;

revoke all on function public.handoff_task(uuid, uuid, text, text) from public, anon;
grant execute on function public.handoff_task(uuid, uuid, text, text) to authenticated;

comment on function public.handoff_task(uuid, uuid, text, text) is
  'Hand a task you are assigned to someone else in the circle. Replaces you, keeps your position, and records a note.';

-- ---------------------------------------------------------------------------
-- edit_handoff_note. Author of the latest handoff only.
-- ---------------------------------------------------------------------------

create function public.edit_handoff_note(p_handoff_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_handoff public.task_handoffs%rowtype;
  v_task public.tasks%rowtype;
  v_note text := nullif(btrim(p_note, E' \t\n\r'), '');
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_handoff
  from public.task_handoffs
  where id = p_handoff_id;

  if not found then
    raise exception 'Handoff not found';
  end if;

  select *
  into v_task
  from public.tasks
  where id = v_handoff.task_id
  for update;

  if not found then
    raise exception 'Handoff not found';
  end if;

  if not public.is_space_member(v_task.space_id) then
    raise exception 'Handoff not found';
  end if;

  if v_handoff.from_user_id is distinct from v_uid then
    raise exception 'Only the author of this note can edit it';
  end if;

  if exists (
    select 1
    from public.task_handoffs newer
    where newer.task_id = v_handoff.task_id
      and (newer.created_at, newer.id) > (v_handoff.created_at, v_handoff.id)
  ) then
    raise exception 'Only the latest handoff note can be edited';
  end if;

  if v_note is not null and char_length(v_note) > 2000 then
    raise exception 'A handoff note can be 2000 characters or fewer';
  end if;

  update public.task_handoffs
  set note = v_note,
      note_edited_at = now()
  where id = p_handoff_id;
end;
$$;

revoke all on function public.edit_handoff_note(uuid, text) from public, anon;
grant execute on function public.edit_handoff_note(uuid, text) to authenticated;

comment on function public.edit_handoff_note(uuid, text) is
  'Edit the note on the latest handoff you wrote. Empty text clears the note.';

-- ---------------------------------------------------------------------------
-- add_agent_log_entry. Writers who are agents, 500 entries per task.
-- ---------------------------------------------------------------------------

create function public.add_agent_log_entry(p_task_id uuid, p_body text)
returns public.agent_log_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_task public.tasks%rowtype;
  v_body text := btrim(coalesce(p_body, ''), E' \t\n\r');
  v_count integer;
  v_entry public.agent_log_entries%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_task
  from public.tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'Task not found';
  end if;

  if not public.is_space_member(v_task.space_id) then
    raise exception 'Task not found';
  end if;

  if coalesce(public.current_space_role(v_task.space_id), '') not in ('owner', 'admin', 'member') then
    raise exception 'You can''t edit this task';
  end if;

  if not public.is_space_agent(v_task.space_id) then
    raise exception 'Only agents write to the agent log';
  end if;

  if char_length(v_body) < 1 then
    raise exception 'An agent log entry needs text';
  end if;

  if char_length(v_body) > 4000 then
    raise exception 'An agent log entry can be 4000 characters or fewer';
  end if;

  select count(*)
  into v_count
  from public.agent_log_entries
  where task_id = p_task_id;

  if v_count >= 500 then
    raise exception 'This task already has 500 agent log entries';
  end if;

  insert into public.agent_log_entries (task_id, author_id, body)
  values (p_task_id, v_uid, v_body)
  returning * into v_entry;

  return v_entry;
end;
$$;

revoke all on function public.add_agent_log_entry(uuid, text) from public, anon;
grant execute on function public.add_agent_log_entry(uuid, text) to authenticated;

comment on function public.add_agent_log_entry(uuid, text) is
  'Append an agent log entry. The caller must be an agent who can edit the task. Capped at 500 entries.';

-- ---------------------------------------------------------------------------
-- One-off backfill. A "Bot update" heading in a description becomes one
-- agent log entry, then the section is removed. Safe to run again: once the
-- heading is gone the row is left alone, and an identical entry is not
-- inserted twice. The author is the task's first agent assignee, or the
-- RNRW Bot profile whose id starts with 50e1c6d4 when that profile exists.
-- ---------------------------------------------------------------------------

create function public.backfill_bot_update_blocks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task record;
  v_lines text[];
  v_line text;
  v_i integer;
  v_start integer;
  v_end integer;
  v_body text;
  v_rest text;
  v_author uuid;
  v_bot uuid;
  v_count integer := 0;
  v_len integer;
begin
  select id
  into v_bot
  from public.profiles
  where id::text like '50e1c6d4-%'
  order by id
  limit 1;

  for v_task in
    select id, description, space_id
    from public.tasks
    where description ~* '(^|\n)#{1,6}[[:space:]]+bot[[:space:]]+update\M'
  loop
    v_lines := regexp_split_to_array(replace(v_task.description, E'\r\n', E'\n'), E'\n');
    v_start := null;
    v_end := null;
    v_len := coalesce(array_length(v_lines, 1), 0);

    for v_i in 1 .. v_len loop
      v_line := v_lines[v_i];
      if v_start is null and v_line ~* '^#{1,6}[[:space:]]+bot[[:space:]]+update\M' then
        v_start := v_i;
      elsif v_start is not null and v_line ~ '^#{1,6}[[:space:]]' then
        v_end := v_i;
        exit;
      end if;
    end loop;

    if v_start is null then
      continue;
    end if;

    if v_end is null then
      v_body := array_to_string(v_lines[v_start + 1 : v_len], E'\n');
      v_rest := array_to_string(v_lines[1 : v_start - 1], E'\n');
    else
      v_body := array_to_string(v_lines[v_start + 1 : v_end - 1], E'\n');
      v_rest := array_to_string(v_lines[1 : v_start - 1] || v_lines[v_end : v_len], E'\n');
    end if;

    v_body := nullif(btrim(v_body, E' \t\n\r'), '');
    v_rest := nullif(btrim(regexp_replace(coalesce(v_rest, ''), '(\n[[:space:]]*){3,}', E'\n\n', 'g'), E' \t\n\r'), '');

    select ta.user_id
    into v_author
    from public.task_assignees ta
    join public.space_members m
      on m.space_id = v_task.space_id
     and m.user_id = ta.user_id
     and m.is_agent
    where ta.task_id = v_task.id
    order by ta.position, ta.created_at
    limit 1;

    v_author := coalesce(v_author, v_bot);

    if v_body is not null and v_author is not null then
      if char_length(v_body) > 4000 then
        v_body := left(v_body, 4000);
      end if;
      if not exists (
        select 1
        from public.agent_log_entries e
        where e.task_id = v_task.id
          and e.author_id is not distinct from v_author
          and e.body = v_body
      ) then
        insert into public.agent_log_entries (task_id, author_id, body)
        values (v_task.id, v_author, v_body);
      end if;
    end if;

    update public.tasks
    set description = v_rest
    where id = v_task.id
      and description is distinct from v_rest;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.backfill_bot_update_blocks() from public, anon, authenticated;

comment on function public.backfill_bot_update_blocks() is
  'Move a Bot update heading out of a task description into the agent log, then strip it. Idempotent.';

select public.backfill_bot_update_blocks();
