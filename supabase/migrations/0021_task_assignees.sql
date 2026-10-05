-- Several people can be assigned to one task. task_assignees is the source of
-- truth. tasks.assignee_id is backfilled into this table and then dropped so
-- the app and MCP cannot drift from a leftover primary column.
--
-- Order is position (0 is first), then created_at. The first row is what MCP
-- responses still call assignee_id / assignee_name.
--
-- Each assignee must be a member of the task's circle. That is checked on
-- insert. Leaving a circle removes that person's assignments there. Existing
-- rows are backfilled even if the person has since left; later writes enforce
-- membership.

create table public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index task_assignees_user_idx on public.task_assignees(user_id);
create index task_assignees_task_position_idx on public.task_assignees(task_id, position);

comment on table public.task_assignees is
  'People assigned to a task. A task may have several. Replaces tasks.assignee_id.';

insert into public.task_assignees (task_id, user_id, position)
select id, assignee_id, 0
from public.tasks
where assignee_id is not null
on conflict (task_id, user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Membership. Direct inserts and security-definer copies both hit this.
-- ---------------------------------------------------------------------------

create or replace function public.task_assignees_require_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.tasks t
    join public.space_members m
      on m.space_id = t.space_id
     and m.user_id = new.user_id
    where t.id = new.task_id
  ) then
    raise exception 'That person is not a member of this circle';
  end if;
  return new;
end;
$$;

revoke all on function public.task_assignees_require_member() from public, anon, authenticated;

create trigger task_assignees_require_member
  before insert on public.task_assignees
  for each row execute function public.task_assignees_require_member();

create or replace function public.task_assignees_clear_departed_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.task_assignees ta
  using public.tasks t
  where ta.task_id = t.id
    and t.space_id = old.space_id
    and ta.user_id = old.user_id;
  return old;
end;
$$;

revoke all on function public.task_assignees_clear_departed_member() from public, anon, authenticated;

create trigger task_assignees_clear_departed_member
  after delete on public.space_members
  for each row execute function public.task_assignees_clear_departed_member();

alter table public.task_assignees enable row level security;

create policy "members read task_assignees" on public.task_assignees
  for select to authenticated
  using (
    exists (
      select 1
      from public.tasks t
      where t.id = task_id
        and public.is_space_member(t.space_id)
    )
  );

create policy "writers insert task_assignees" on public.task_assignees
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.tasks t
      where t.id = task_id
        and public.current_space_role(t.space_id) in ('owner', 'admin', 'member')
    )
    and exists (
      select 1
      from public.tasks t
      join public.space_members m
        on m.space_id = t.space_id
       and m.user_id = task_assignees.user_id
      where t.id = task_id
    )
  );

create policy "writers delete task_assignees" on public.task_assignees
  for delete to authenticated
  using (
    exists (
      select 1
      from public.tasks t
      where t.id = task_id
        and public.current_space_role(t.space_id) in ('owner', 'admin', 'member')
    )
  );

revoke all on table public.task_assignees from public, anon;
grant select, insert, delete on table public.task_assignees to authenticated;
grant all on table public.task_assignees to service_role;

-- ---------------------------------------------------------------------------
-- Replace the assignee set on one task. Runs as the caller so RLS applies.
-- A no-op task update confirms the caller can edit before the set changes.
-- ---------------------------------------------------------------------------

create or replace function public.set_task_assignees(p_task_id uuid, p_user_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_space uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.tasks
  set updated_at = updated_at
  where id = p_task_id
  returning space_id into v_space;

  if v_space is null then
    raise exception 'Task not found';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_user_ids, array[]::uuid[])) as ids(user_id)
    where ids.user_id is not null
      and not exists (
        select 1
        from public.space_members m
        where m.space_id = v_space
          and m.user_id = ids.user_id
      )
  ) then
    raise exception 'That person is not a member of this circle';
  end if;

  delete from public.task_assignees where task_id = p_task_id;

  insert into public.task_assignees (task_id, user_id, position)
  select p_task_id, picked.user_id, picked.position
  from (
    select id as user_id, (min(ord) - 1)::integer as position
    from unnest(coalesce(p_user_ids, array[]::uuid[])) with ordinality as u(id, ord)
    where id is not null
    group by id
  ) picked;
end;
$$;

revoke all on function public.set_task_assignees(uuid, uuid[]) from public, anon;
grant execute on function public.set_task_assignees(uuid, uuid[]) to authenticated;

comment on function public.set_task_assignees(uuid, uuid[]) is
  'Replace the people assigned to one task. Every id must be a member of the task''s circle. An empty list clears them.';

-- ---------------------------------------------------------------------------
-- Bulk assign now takes a list. The previous (uuid assignee) signature is
-- dropped so callers cannot keep writing a single column.
-- Status is todo or done. Doing was removed in 0022; this function already
-- refuses it so a half-applied pair of migrations cannot recreate that state.
-- ---------------------------------------------------------------------------

drop function if exists public.bulk_update_tasks(uuid[], text, uuid, boolean);

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

  if p_status is not null and p_status not in ('todo', 'done') then
    raise exception 'Status must be todo or done';
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

revoke all on function public.bulk_update_tasks(uuid[], text, uuid[], boolean) from public, anon;
grant execute on function public.bulk_update_tasks(uuid[], text, uuid[], boolean) to authenticated;

comment on function public.bulk_update_tasks(uuid[], text, uuid[], boolean) is
  'Replace assignees and/or set status for many tasks. Runs as the caller so RLS applies. Completing a repeating task still spawns the next occurrence with the new assignees.';

-- ---------------------------------------------------------------------------
-- Moving a task drops assignees who are not members of the destination and
-- keeps the ones who are. assignee_cleared is true when anyone was removed.
-- ---------------------------------------------------------------------------

create or replace function public.move_task(p_task_id uuid, p_target_space_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_task public.tasks%rowtype;
  v_source_role text;
  v_assignee_cleared boolean := false;
  v_removed integer := 0;
  v_tags_removed integer := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found';
  end if;

  select role into v_source_role
  from public.space_members
  where space_id = v_task.space_id and user_id = v_uid;

  if v_source_role is null then
    raise exception 'Task not found';
  end if;

  if v_source_role not in ('owner', 'admin', 'member') then
    raise exception 'You cannot edit tasks in this circle';
  end if;

  if v_task.space_id = p_target_space_id then
    return jsonb_build_object(
      'task_id', v_task.id,
      'source_space_id', v_task.space_id,
      'target_space_id', p_target_space_id,
      'assignee_cleared', false,
      'already_there', true,
      'tags_removed', 0
    );
  end if;

  if not exists (select 1 from public.spaces where id = p_target_space_id) then
    raise exception 'Circle not found';
  end if;

  if not exists (
    select 1 from public.space_members
    where space_id = p_target_space_id and user_id = v_uid
  ) then
    raise exception 'Circle not found';
  end if;

  perform set_config('trove.move_task', 'on', true);
  begin
    update public.tasks
    set
      space_id = p_target_space_id,
      position = extract(epoch from clock_timestamp()) * 1000
    where id = v_task.id;
    perform set_config('trove.move_task', 'off', true);
  exception
    when others then
      perform set_config('trove.move_task', 'off', true);
      raise;
  end;

  with removed as (
    delete from public.task_assignees ta
    where ta.task_id = v_task.id
      and not exists (
        select 1
        from public.space_members m
        where m.space_id = p_target_space_id
          and m.user_id = ta.user_id
      )
    returning 1
  )
  select count(*)::integer into v_removed from removed;

  v_assignee_cleared := v_removed > 0;

  with removed_tags as (
    delete from public.task_labels tl
    using public.labels l
    where tl.task_id = v_task.id
      and tl.label_id = l.id
      and l.space_id is distinct from p_target_space_id
    returning 1
  )
  select count(*)::integer into v_tags_removed from removed_tags;

  return jsonb_build_object(
    'task_id', v_task.id,
    'source_space_id', v_task.space_id,
    'target_space_id', p_target_space_id,
    'assignee_cleared', v_assignee_cleared,
    'already_there', false,
    'tags_removed', v_tags_removed
  );
end;
$$;

revoke all on function public.move_task(uuid, uuid) from public, anon;
grant execute on function public.move_task(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The next occurrence copies every assignee, not a single column.
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
      insert into public.task_assignees (task_id, user_id, position, created_at)
      select v_new_id, user_id, position, created_at
      from public.task_assignees
      where task_id = new.id;

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

-- The column goes last so the functions above no longer mention it.
drop index if exists public.tasks_assignee_idx;
alter table public.tasks drop column assignee_id;
