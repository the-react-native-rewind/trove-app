-- Recurrence date math and the completion trigger.
-- Runs after seed and before rls.sql, inside a transaction that rolls back
-- so the demo counts the RLS checks expect stay intact.
-- Alex owns Garden crew in the seed.

\set ON_ERROR_STOP on

begin;

do $$
declare
  d date;
begin
  d := public.next_recurrence_date('2026-10-03', 'day', 1, null);
  if d <> '2026-10-04' then raise exception 'daily: %', d; end if;

  d := public.next_recurrence_date('2026-10-03', 'day', 10, null);
  if d <> '2026-10-13' then raise exception 'every 10 days: %', d; end if;

  d := public.next_recurrence_date('2026-01-01', 'day', 100, null);
  if d <> '2026-04-10' then raise exception 'interval clamps to 99 days: %', d; end if;

  d := public.next_recurrence_date('2026-10-07', 'week', 1, 3);
  if d <> '2026-10-14' then raise exception 'weekly same weekday: %', d; end if;

  d := public.next_recurrence_date('2026-10-05', 'week', 1, 3);
  if d <> '2026-10-07' then raise exception 'weekly later weekday: %', d; end if;

  d := public.next_recurrence_date('2026-10-05', 'week', 2, 3);
  if d <> '2026-10-14' then raise exception 'every 2 weeks, different weekday: %', d; end if;

  d := public.next_recurrence_date('2026-10-07', 'week', 2, 3);
  if d <> '2026-10-21' then raise exception 'every 2 weeks, same weekday: %', d; end if;

  d := public.next_recurrence_date('2026-10-05', 'week', 1, 0);
  if d <> '2026-10-11' then raise exception 'weekly on Sunday: %', d; end if;

  d := public.next_recurrence_date('2026-10-03', 'week', 1, null);
  if d <> '2026-10-10' then raise exception 'weekly without weekday: %', d; end if;

  d := public.next_recurrence_date('2026-01-31', 'month', 1, null);
  if d <> '2026-02-28' then raise exception 'month end: %', d; end if;

  d := public.next_recurrence_date('2024-01-31', 'month', 1, null);
  if d <> '2024-02-29' then raise exception 'leap month end: %', d; end if;

  d := public.next_recurrence_date('2026-01-31', 'month', 2, null);
  if d <> '2026-03-31' then raise exception 'every 2 months: %', d; end if;

  d := public.next_recurrence_date('2026-03-31', 'month', 1, null);
  if d <> '2026-04-30' then raise exception '31 March: %', d; end if;

  d := public.next_recurrence_date('2026-12-15', 'month', 2, null);
  if d <> '2027-02-15' then raise exception 'across the year: %', d; end if;

  d := public.next_recurrence_date('2024-02-29', 'month', 12, null);
  if d <> '2025-02-28' then raise exception 'leap day plus a year: %', d; end if;

  if public.next_recurrence_date('2026-10-03', null, 1, null) is not null then
    raise exception 'null unit should not produce a date';
  end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);

do $$
declare
  garden uuid := 'a4444444-4444-4444-8444-444444444444';
  alex uuid := 'a1111111-1111-4111-8111-111111111111';
  sam uuid := 'a2222222-2222-4222-8222-222222222222';
  parent uuid := 'c1111111-1111-4111-8111-111111111111';
  label uuid := 'c2222222-2222-4222-8222-222222222222';
  attachment uuid := 'c3333333-3333-4333-8333-333333333333';
  plain uuid := 'c4444444-4444-4444-8444-444444444444';
  undated uuid := 'c5555555-5555-4555-8555-555555555555';
  child public.tasks%rowtype;
  grandchild public.tasks%rowtype;
  n int;
  shared boolean;
begin
  insert into public.labels (id, space_id, name)
  values (label, garden, 'Watering');

  insert into public.tasks (
    id, space_id, title, description, status, position,
    assignee_id, priority, due_date, created_by, external_id,
    repeat_unit, repeat_interval, repeat_weekday
  )
  values (
    parent, garden, 'Water the greenhouse', 'Seedlings dry out by mid-morning.',
    'todo', 10, sam, 'high', '2026-10-07', alex, 'import-greenhouse',
    'week', 1, 3
  );

  insert into public.task_labels (task_id, label_id) values (parent, label);

  -- The insert policy requires created_by = auth.uid(). The copy below keeps Sam
  -- as the uploader, which only works because the spawn function is security definer.
  insert into public.task_attachments (id, task_id, space_id, path, media_type, created_by)
  values (
    attachment, parent, garden, garden || '/' || parent || '/photo.jpg', 'image', alex
  );
  execute 'reset role';
  update public.task_attachments set created_by = sam where id = attachment;
  execute 'set role authenticated';
  perform set_config('request.jwt.claim.sub', alex::text, false);

  insert into public.user_task_week_plans (user_id, task_id, week_start)
  values (alex, parent, '2026-09-28');

  -- Moving to Doing does not spawn.
  update public.tasks set status = 'in_progress' where id = parent;
  select count(*) into n from public.tasks where recurrence_source_id = parent;
  if n <> 0 then
    raise exception 'in-progress task spawned a successor';
  end if;

  update public.tasks set status = 'done' where id = parent;

  select * into child from public.tasks where recurrence_source_id = parent;
  if child.id is null then
    raise exception 'completing a weekly task did not spawn';
  end if;
  if child.status <> 'todo' then
    raise exception 'successor status is %', child.status;
  end if;
  if child.title <> 'Water the greenhouse' or child.description <> 'Seedlings dry out by mid-morning.' then
    raise exception 'successor did not keep title and notes';
  end if;
  if child.priority <> 'high' or child.assignee_id <> sam or child.space_id <> garden then
    raise exception 'successor did not keep priority, assignee, or circle';
  end if;
  if child.due_date <> '2026-10-14' then
    raise exception 'successor due date %, expected 2026-10-14', child.due_date;
  end if;
  if child.repeat_unit <> 'week' or child.repeat_interval <> 1 or child.repeat_weekday <> 3 then
    raise exception 'successor did not keep the repeat rule';
  end if;
  if child.recurrence_series_id <> parent then
    raise exception 'series id should be the first occurrence';
  end if;
  if child.external_id is not null then
    raise exception 'external_id must stay on the original import';
  end if;
  if child.created_by <> alex then
    raise exception 'created_by should be copied';
  end if;

  select count(*) into n from public.task_labels where task_id = child.id and label_id = label;
  if n <> 1 then
    raise exception 'tag was not copied';
  end if;

  select count(*) into n
  from public.task_attachments
  where task_id = child.id
    and path = garden || '/' || parent || '/photo.jpg'
    and created_by = sam;
  if n <> 1 then
    raise exception 'shared photo row was not copied';
  end if;

  select count(*) into n from public.user_task_week_plans where task_id = child.id;
  if n <> 0 then
    raise exception 'My Week plan should not carry over';
  end if;

  select public.attachment_path_in_use(
    garden || '/' || parent || '/photo.jpg',
    attachment
  ) into shared;
  if shared is not true then
    raise exception 'shared photo path should still be in use';
  end if;

  -- The finished row stays done and still carries the rule.
  if (select status from public.tasks where id = parent) <> 'done' then
    raise exception 'completed occurrence did not stay done';
  end if;

  -- A second write while it is already done does not spawn again.
  update public.tasks set title = 'Water the greenhouse beds' where id = parent;
  update public.tasks set status = 'done' where id = parent;
  select count(*) into n from public.tasks where recurrence_source_id = parent;
  if n <> 1 then
    raise exception 'double-complete spawned % successors', n;
  end if;

  -- Un-complete, then complete again: still one successor.
  update public.tasks set status = 'todo' where id = parent;
  update public.tasks set status = 'done' where id = parent;
  select count(*) into n from public.tasks where recurrence_source_id = parent;
  if n <> 1 then
    raise exception 're-complete spawned % successors', n;
  end if;

  -- The successor can itself spawn, forming a chain rather than a duplicate.
  update public.tasks set status = 'done' where id = child.id;
  select * into grandchild from public.tasks where recurrence_source_id = child.id;
  if grandchild.due_date <> '2026-10-21' or grandchild.recurrence_series_id <> parent then
    raise exception 'chain successor is wrong: % %', grandchild.due_date, grandchild.recurrence_series_id;
  end if;

  -- A task that does not repeat does not spawn. Neither does one whose rule
  -- was cleared before it was completed.
  insert into public.tasks (id, space_id, title, status, position, created_by)
  values (plain, garden, 'One-off', 'todo', 11, alex);
  update public.tasks set status = 'done' where id = plain;
  select count(*) into n from public.tasks where recurrence_source_id = plain;
  if n <> 0 then
    raise exception 'one-off task spawned';
  end if;

  insert into public.tasks (
    id, space_id, title, status, position, created_by, due_date, repeat_unit, repeat_interval
  )
  values (undated, garden, 'Whenever', 'todo', 12, alex, null, 'day', 1);
  update public.tasks set repeat_unit = null where id = undated;
  update public.tasks set status = 'done' where id = undated;
  select count(*) into n from public.tasks where recurrence_source_id = undated;
  if n <> 0 then
    raise exception 'stopping the repeat still spawned';
  end if;

  -- No due date: count from the UTC completion date.
  update public.tasks
  set status = 'todo', repeat_unit = 'day', repeat_interval = 1, due_date = null
  where id = undated;
  update public.tasks set status = 'done' where id = undated;
  select * into child from public.tasks where recurrence_source_id = undated;
  if child.due_date <> (timezone('utc', now()))::date + 1 then
    raise exception 'undated successor due %', child.due_date;
  end if;
end $$;

-- The successor link is not writable by clients.
do $$
begin
  insert into public.tasks (
    space_id, title, status, position, created_by, recurrence_source_id
  )
  values (
    'a4444444-4444-4444-8444-444444444444',
    'Forged link',
    'todo',
    13,
    'a1111111-1111-4111-8111-111111111111',
    'c1111111-1111-4111-8111-111111111111'
  );
  raise exception 'client was able to set recurrence_source_id';
exception
  when others then
    if sqlerrm not like '%recurrence_source_id is set by the server%' then
      raise;
    end if;
end $$;

-- A weekly rule with no weekday takes the due date's weekday. An out-of-range
-- interval is clamped. Clearing the rule drops the weekday.
do $$
declare
  garden uuid := 'a4444444-4444-4444-8444-444444444444';
  alex uuid := 'a1111111-1111-4111-8111-111111111111';
  row public.tasks%rowtype;
begin
  insert into public.tasks (
    space_id, title, status, position, created_by, due_date, repeat_unit, repeat_interval
  )
  values (garden, 'Market day', 'todo', 14, alex, '2026-10-05', 'week', 500)
  returning * into row;

  if row.repeat_weekday <> 1 then
    raise exception 'Monday due date should default the weekday, got %', row.repeat_weekday;
  end if;
  if row.repeat_interval <> 99 then
    raise exception 'interval should clamp to 99, got %', row.repeat_interval;
  end if;
  if row.recurrence_series_id <> row.id then
    raise exception 'series id should default to the task id';
  end if;

  update public.tasks set repeat_unit = null where id = row.id returning * into row;
  if row.repeat_unit is not null or row.repeat_weekday is not null or row.repeat_interval <> 1 then
    raise exception 'clearing the rule did not reset the shape';
  end if;
end $$;

reset role;

rollback;
