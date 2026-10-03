-- Bulk assign and complete. One statement, so a circle list can update many
-- tasks without a round trip per row.
--
-- SECURITY INVOKER: the caller's row level security policies decide which
-- rows change. A viewer, or a task in a circle they cannot edit, is left
-- untouched. If any requested id is missing or not writable, the function
-- raises and the whole update rolls back.
--
-- Status changes are ordinary updates of tasks.status, so
-- tasks_spawn_next_occurrence still runs once per row that moves into done.
-- Completing a repeating task inserts the next occurrence. Assigning alone
-- does not mention status, so that trigger does not fire.

create or replace function public.bulk_update_tasks(
  p_task_ids uuid[],
  p_status text default null,
  p_assignee_id uuid default null,
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

  if p_set_assignee and p_assignee_id is not null then
    if exists (
      select 1
      from public.tasks t
      where t.id = any(p_task_ids)
        and not exists (
          select 1
          from public.space_members m
          where m.space_id = t.space_id
            and m.user_id = p_assignee_id
        )
    ) then
      raise exception 'That person is not in every circle these tasks belong to';
    end if;
  end if;

  if p_status is not null and p_set_assignee then
    update public.tasks
    set status = p_status, assignee_id = p_assignee_id
    where id = any(p_task_ids);
  elsif p_status is not null then
    update public.tasks
    set status = p_status
    where id = any(p_task_ids);
  else
    update public.tasks
    set assignee_id = p_assignee_id
    where id = any(p_task_ids);
  end if;

  get diagnostics v_count = row_count;

  if v_count <> v_requested then
    raise exception 'Some tasks could not be updated';
  end if;

  return v_count;
end;
$$;

revoke all on function public.bulk_update_tasks(uuid[], text, uuid, boolean) from public, anon;
grant execute on function public.bulk_update_tasks(uuid[], text, uuid, boolean) to authenticated;

comment on function public.bulk_update_tasks(uuid[], text, uuid, boolean) is
  'Assign and/or set status for many tasks in one update. Runs as the caller so RLS applies. Completing a repeating task still spawns the next occurrence.';
