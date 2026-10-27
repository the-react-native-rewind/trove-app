-- In progress is a task status again: todo, in_progress, done.
-- Migration 0022 folded existing in_progress rows into todo and tightened
-- the check. This puts the value back. Narrow layouts still keep those
-- tasks in the single open list; wide layouts give them a column.
-- Only a transition to done spawns the next occurrence of a repeating task.

alter table public.tasks drop constraint if exists tasks_status_check;

alter table public.tasks
  add constraint tasks_status_check
  check (status in ('todo', 'in_progress', 'done'));

create or replace function public.bulk_update_tasks(
  p_task_ids uuid[],
  p_status text default null,
  p_assignee_ids uuid[] default null,
  p_set_assignee boolean default false
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_requested integer;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_status is not null and p_status not in ('todo', 'in_progress', 'done') then
    raise exception 'Status must be todo, in_progress, or done';
  end if;

  if p_status is null and not p_set_assignee then
    raise exception 'Nothing to update';
  end if;

  select count(distinct id)
  into v_requested
  from unnest(coalesce(p_task_ids, array[]::uuid[])) as ids(id)
  where id is not null;

  if v_requested = 0 then
    raise exception 'Choose at least one task';
  end if;

  if v_requested > 200 then
    raise exception 'Choose 200 tasks or fewer';
  end if;

  if p_set_assignee and exists (
    select 1
    from unnest(coalesce(p_assignee_ids, array[]::uuid[])) as ids(user_id)
    cross join public.tasks t
    where ids.user_id is not null
      and t.id = any(p_task_ids)
      and not exists (
        select 1
        from public.space_members m
        where m.space_id = t.space_id
          and m.user_id = ids.user_id
      )
  ) then
    raise exception 'Those people are not in every circle these tasks belong to';
  end if;

  -- Confirm every requested row is visible and writable before changing
  -- assignees. Viewers update zero rows. Status is applied afterwards so a
  -- repeating task's successor copies the new assignee set.
  update public.tasks
  set updated_at = updated_at
  where id = any(p_task_ids);

  get diagnostics v_count = row_count;

  if v_count <> v_requested then
    raise exception 'Some tasks could not be updated';
  end if;

  if p_set_assignee then
    delete from public.task_assignees
    where task_id = any(p_task_ids);

    insert into public.task_assignees (task_id, user_id, position)
    select t.id, picked.user_id, picked.position
    from public.tasks t
    cross join (
      select id as user_id, (min(ord) - 1)::integer as position
      from unnest(coalesce(p_assignee_ids, array[]::uuid[])) with ordinality as u(id, ord)
      where id is not null
      group by id
    ) picked
    where t.id = any(p_task_ids);
  end if;

  if p_status is not null then
    update public.tasks
    set status = p_status
    where id = any(p_task_ids);
  end if;

  return v_count;
end;
$$;

comment on function public.bulk_update_tasks(uuid[], text, uuid[], boolean) is
  'Replace assignees and/or set status (todo, in_progress, or done) for many tasks. Runs as the caller so RLS applies. Completing a repeating task still spawns the next occurrence with the new assignees.';
