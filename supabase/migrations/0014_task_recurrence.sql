-- Recurring tasks. The rule lives on each occurrence. Completing one (status
-- changes to done) inserts the next occurrence with the same details and the
-- next due date. Completed rows stay completed.
--
-- The trigger is the only place a successor is created, so it also runs when
-- a task is completed through the MCP server or by another circle member.
-- recurrence_source_id is unique and points at the occurrence that spawned
-- this one. A second completion, including un-complete then complete again,
-- finds that row and does not insert another.
--
-- Carry-over onto the next occurrence:
--   title, notes, priority, tags, circle, assignee, and the repeat rule.
--   Photos and videos are shared: a new task_attachments row points at the
--   same storage path. The file is not copied. Deleting one row removes the
--   file only when no other row still uses that path (attachment_path_in_use).
-- Not copied:
--   status (the new row is To do), external_id (that identity belongs to the
--   imported row, and copying it would collide), private My Week plans, and
--   position (the new row is appended to To do). created_by is copied.
--
-- Due dates stay date-only. The next date is counted from the previous due
-- date, or from the UTC date of completion when there is no due date.
-- Weekly weekdays are 0 = Sunday … 6 = Saturday.
--
-- Not exposed on the MCP tool surface in this migration. A follow-up can add
-- repeat_unit (day | week | month | null), repeat_interval (1–99), and
-- repeat_weekday (0–6, used for week) to create_task, update_task, and task
-- payloads. complete_task needs no new argument. recurrence_source_id stays
-- server-only.

alter table public.tasks
  add column repeat_unit text,
  add column repeat_interval integer not null default 1,
  add column repeat_weekday smallint,
  add column recurrence_series_id uuid,
  add column recurrence_source_id uuid;

alter table public.tasks
  add constraint tasks_repeat_unit_check
  check (repeat_unit is null or repeat_unit in ('day', 'week', 'month'));

alter table public.tasks
  add constraint tasks_repeat_interval_check
  check (repeat_interval between 1 and 99);

alter table public.tasks
  add constraint tasks_repeat_weekday_check
  check (repeat_weekday is null or repeat_weekday between 0 and 6);

alter table public.tasks
  add constraint tasks_repeat_shape_check
  check (
    (repeat_unit is null and repeat_weekday is null)
    or (repeat_unit = 'week' and repeat_weekday is not null)
    or (repeat_unit in ('day', 'month') and repeat_weekday is null)
  );

alter table public.tasks
  add constraint tasks_recurrence_source_id_fkey
  foreign key (recurrence_source_id) references public.tasks (id) on delete set null;

-- Multiple nulls are allowed, so tasks that are not successors do not collide.
create unique index tasks_recurrence_source_id_key
  on public.tasks (recurrence_source_id);

create index tasks_recurrence_series_id_idx
  on public.tasks (recurrence_series_id);

comment on column public.tasks.repeat_unit is
  'day, week, or month. Null means the task does not repeat.';
comment on column public.tasks.repeat_weekday is
  '0 = Sunday … 6 = Saturday. Set only when repeat_unit is week.';
comment on column public.tasks.recurrence_series_id is
  'Shared by occurrences of one repeating task. Set to the first task id.';
comment on column public.tasks.recurrence_source_id is
  'The occurrence that spawned this row. Server-only. Unique, so completion is idempotent.';

-- ---------------------------------------------------------------------------
-- Next due date. Immutable and side-effect free so tests can call it directly.
-- Mirrors src/lib/recurrence.ts.
-- ---------------------------------------------------------------------------

create or replace function public.next_recurrence_date(
  p_anchor date,
  p_unit text,
  p_interval integer,
  p_weekday integer
)
returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  v_interval integer := least(99, greatest(1, coalesce(p_interval, 1)));
  v_dow integer;
  v_delta integer;
begin
  if p_anchor is null or p_unit is null then
    return null;
  end if;

  if p_unit = 'day' then
    return p_anchor + v_interval;
  end if;

  if p_unit = 'month' then
    return (p_anchor + make_interval(months => v_interval))::date;
  end if;

  if p_unit = 'week' then
    v_dow := extract(dow from p_anchor)::integer;
    if p_weekday is null or p_weekday = v_dow then
      return p_anchor + (v_interval * 7);
    end if;
    v_delta := (p_weekday - v_dow + 7) % 7;
    return p_anchor + v_delta + ((v_interval - 1) * 7);
  end if;

  return null;
end;
$$;

revoke all on function public.next_recurrence_date(date, text, integer, integer)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Keep the stored shape valid. Weekday is required for weeks and forbidden
-- otherwise. A missing weekday follows the due date, or today (UTC) when
-- the task has no due date. The first occurrence's series id is its own id.
-- ---------------------------------------------------------------------------

create or replace function public.tasks_normalize_repeat()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.repeat_interval is null or new.repeat_interval < 1 then
    new.repeat_interval := 1;
  elsif new.repeat_interval > 99 then
    new.repeat_interval := 99;
  end if;

  if new.repeat_unit is null then
    new.repeat_interval := 1;
    new.repeat_weekday := null;
    return new;
  end if;

  if new.repeat_unit = 'week' then
    if new.repeat_weekday is null then
      new.repeat_weekday := extract(
        dow from coalesce(new.due_date, (timezone('utc', now()))::date)
      )::smallint;
    end if;
  else
    new.repeat_weekday := null;
  end if;

  if new.recurrence_series_id is null then
    new.recurrence_series_id := new.id;
  end if;

  return new;
end;
$$;

revoke all on function public.tasks_normalize_repeat() from public, anon, authenticated;

create trigger tasks_normalize_repeat
  before insert or update on public.tasks
  for each row execute function public.tasks_normalize_repeat();

-- Clients cannot set the successor link. The spawn trigger sets a
-- transaction-local flag, the same pattern as move_task.
create or replace function public.tasks_guard_recurrence_source()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('trove.spawn_recurrence', true), '') is distinct from 'on' then
    if tg_op = 'INSERT' and new.recurrence_source_id is not null then
      raise exception 'recurrence_source_id is set by the server';
    end if;
    if tg_op = 'UPDATE' and new.recurrence_source_id is distinct from old.recurrence_source_id then
      raise exception 'recurrence_source_id is set by the server';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.tasks_guard_recurrence_source() from public, anon, authenticated;

create trigger tasks_guard_recurrence_source
  before insert or update on public.tasks
  for each row execute function public.tasks_guard_recurrence_source();

-- ---------------------------------------------------------------------------
-- On the transition into done, insert the next occurrence. SECURITY DEFINER
-- so tags and shared attachment rows can be copied even when the completer
-- is not the person who originally uploaded the photo (the attachment insert
-- policy requires created_by = auth.uid()).
-- ---------------------------------------------------------------------------

create or replace function public.tasks_spawn_next_occurrence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anchor date;
  v_due date;
  v_new_id uuid;
begin
  if tg_op <> 'UPDATE' or new.status is distinct from 'done' or old.status = 'done' then
    return new;
  end if;
  if new.repeat_unit is null then
    return new;
  end if;

  v_anchor := coalesce(new.due_date, (timezone('utc', now()))::date);
  v_due := public.next_recurrence_date(
    v_anchor,
    new.repeat_unit,
    new.repeat_interval,
    new.repeat_weekday
  );

  perform set_config('trove.spawn_recurrence', 'on', true);
  begin
    v_new_id := null;
    insert into public.tasks (
      space_id,
      title,
      description,
      status,
      position,
      assignee_id,
      priority,
      due_date,
      created_by,
      repeat_unit,
      repeat_interval,
      repeat_weekday,
      recurrence_series_id,
      recurrence_source_id
    )
    values (
      new.space_id,
      new.title,
      new.description,
      'todo',
      extract(epoch from clock_timestamp()) * 1000,
      new.assignee_id,
      new.priority,
      v_due,
      new.created_by,
      new.repeat_unit,
      new.repeat_interval,
      new.repeat_weekday,
      coalesce(new.recurrence_series_id, new.id),
      new.id
    )
    on conflict (recurrence_source_id) do nothing
    returning id into v_new_id;

    if found then
      insert into public.task_labels (task_id, label_id)
      select v_new_id, label_id
      from public.task_labels
      where task_id = new.id;

      insert into public.task_attachments (task_id, space_id, path, media_type, created_by)
      select v_new_id, space_id, path, media_type, created_by
      from public.task_attachments
      where task_id = new.id;
    end if;

    perform set_config('trove.spawn_recurrence', 'off', true);
  exception
    when others then
      perform set_config('trove.spawn_recurrence', 'off', true);
      raise;
  end;

  return new;
end;
$$;

revoke all on function public.tasks_spawn_next_occurrence() from public, anon, authenticated;

create trigger tasks_spawn_next_occurrence
  after update of status on public.tasks
  for each row execute function public.tasks_spawn_next_occurrence();

-- True when another attachment row still points at this storage path.
-- The caller must be able to see the row they are about to delete.
create or replace function public.attachment_path_in_use(p_path text, p_except_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.task_attachments mine
    where mine.id = p_except_id
      and mine.path = p_path
      and public.is_space_member(mine.space_id)
  )
  and exists (
    select 1
    from public.task_attachments other
    where other.path = p_path
      and other.id <> p_except_id
  );
$$;

revoke all on function public.attachment_path_in_use(text, uuid) from public, anon;
grant execute on function public.attachment_path_in_use(text, uuid) to authenticated;
