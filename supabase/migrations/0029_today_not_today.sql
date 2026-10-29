-- Take a line off today without touching the task.
--
-- dismissed_at hides the row from Today and from the next day's rollover.
-- The task stays in its circle: this does not delete it, complete it, or
-- change its due date. A routine stays active, so a later scheduled day
-- still gets a fresh row. The dismissed row stays on this day so the
-- routine is not inserted again (the unique routine index) and so undo
-- can put the same line back.
--
-- ensure_today still moves unticked one-offs, and now skips dismissed ones.

alter table public.today_items
  add column dismissed_at timestamptz;

comment on column public.today_items.dismissed_at is
  'Set when this person takes the line off the day. The linked task is left as it is. A routine stays active. The row stays so the line does not roll forward and the routine is not inserted again for this day.';

create or replace function public.ensure_today(p_day date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_since date;
  v_later boolean;
  v_floor text;
  v_row record;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_day is null then
    raise exception 'Day is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_day::text, 0));

  if exists (
    select 1
    from public.today_days
    where user_id = v_uid
      and day = p_day
  ) then
    return;
  end if;

  v_later := exists (
    select 1
    from public.today_days
    where user_id = v_uid
      and day > p_day
  );

  insert into public.today_items (user_id, day, text, task_id, routine_id, rank)
  select v_uid, p_day, routine.text, routine.task_id, routine.id, routine.rank
  from public.today_routines routine
  where routine.user_id = v_uid
    and routine.active
    and (routine.days::integer & (1 << extract(dow from p_day)::integer)) <> 0
  on conflict (user_id, day, routine_id) where routine_id is not null do nothing;

  if not v_later then
    select max(marker.day)
    into v_since
    from public.today_days marker
    where marker.user_id = v_uid
      and marker.day < p_day;

    select min(item.rank)
    into v_floor
    from public.today_items item
    where item.user_id = v_uid
      and item.day = p_day;

    for v_row in
      select item.id
      from public.today_items item
      where item.user_id = v_uid
        and item.day < p_day
        and (v_since is null or item.day >= v_since)
        and item.routine_id is null
        and item.checked_at is null
        and item.dismissed_at is null
      order by item.day desc, item.rank collate "C" desc, item.created_at asc, item.id asc
    loop
      if v_floor is null then
        update public.today_items
        set day = p_day
        where id = v_row.id
        returning rank into v_floor;
      else
        v_floor := public.rank_before(v_floor);
        update public.today_items
        set day = p_day, rank = v_floor
        where id = v_row.id;
      end if;
    end loop;
  end if;

  insert into public.today_days (user_id, day)
  values (v_uid, p_day)
  on conflict (user_id, day) do nothing;
end;
$$;

comment on function public.ensure_today(date) is
  'Prepare the caller''s Today list for one date. Safe to call more than once. Inserts scheduled routines, then moves unticked one-offs that were not taken off their day, under lines already on that date.';

-- Putting a task back on a day that was skipped restores the hidden row
-- instead of inserting a second line.
create or replace function public.add_today_item(
  p_day date,
  p_text text default null,
  p_task_id uuid default null,
  p_as_of date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_text text := nullif(btrim(p_text), '');
  v_id uuid;
  v_as_of date := coalesce(p_as_of, (timezone('utc', now()))::date);
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_day is null then
    raise exception 'Day is required';
  end if;
  if v_text is not null and p_task_id is not null then
    raise exception 'Pass text or a task, not both';
  end if;
  if v_text is null and p_task_id is null then
    raise exception 'Pass text or a task';
  end if;
  if v_text is not null and char_length(v_text) > 4000 then
    raise exception 'A line can be 4000 characters or fewer';
  end if;
  if p_task_id is not null and not exists (
    select 1
    from public.tasks t
    where t.id = p_task_id
      and public.is_space_member(t.space_id)
  ) then
    raise exception 'Task not found';
  end if;

  if p_day <= v_as_of then
    perform public.ensure_today(p_day);
  end if;

  if p_task_id is not null then
    select item.id
    into v_id
    from public.today_items item
    where item.user_id = v_uid
      and item.day = p_day
      and item.task_id = p_task_id
      and item.dismissed_at is not null
    order by item.created_at desc
    limit 1;
    if v_id is not null then
      update public.today_items
      set dismissed_at = null
      where id = v_id;
      return v_id;
    end if;
  end if;

  if p_task_id is not null and exists (
    select 1
    from public.today_items
    where user_id = v_uid
      and day = p_day
      and task_id = p_task_id
      and dismissed_at is null
  ) then
    raise exception 'That task is already on this day';
  end if;

  if p_task_id is not null and exists (
    select 1
    from public.today_routines routine
    where routine.user_id = v_uid
      and routine.active
      and routine.task_id = p_task_id
      and (routine.days::integer & (1 << extract(dow from p_day)::integer)) <> 0
      and not exists (
        select 1
        from public.today_items skipped
        where skipped.user_id = v_uid
          and skipped.day = p_day
          and skipped.routine_id = routine.id
          and skipped.dismissed_at is not null
      )
  ) then
    raise exception 'That task is already on this day';
  end if;

  insert into public.today_items (user_id, day, text, task_id, rank)
  values (v_uid, p_day, v_text, p_task_id, public.today_rank_at_bottom(p_day))
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.add_today_item(date, text, uuid, date) is
  'Append a private Today line for the caller. Prepares the day only when p_day is on or before p_as_of. A task that was taken off this day is put back instead of inserted twice. text or task_id, not both.';

create or replace function public.move_today_item_to_day(
  p_item_id uuid,
  p_day date,
  p_as_of date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item public.today_items;
  v_rank text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_day is null or p_as_of is null then
    raise exception 'Day is required';
  end if;
  if p_day <> p_as_of and p_day <> (p_as_of + 1) then
    raise exception 'You can move a line to today or tomorrow';
  end if;

  select * into v_item
  from public.today_items
  where id = p_item_id
    and user_id = v_uid;
  if not found then
    raise exception 'Line not found';
  end if;
  if v_item.day = p_day and v_item.dismissed_at is null then
    return;
  end if;
  if p_day > p_as_of and v_item.checked_at is not null then
    raise exception 'Ticked lines stay on their day';
  end if;

  if p_day <= p_as_of then
    perform public.ensure_today(p_day);
  end if;

  -- A hidden skip on the destination must not block the move or the
  -- routine unique index. The line is being placed on that day now.
  delete from public.today_items item
  where item.user_id = v_uid
    and item.day = p_day
    and item.dismissed_at is not null
    and item.id <> v_item.id
    and (
      (v_item.task_id is not null and item.task_id = v_item.task_id)
      or (v_item.routine_id is not null and item.routine_id = v_item.routine_id)
    );

  if v_item.task_id is not null and exists (
    select 1
    from public.today_items item
    where item.user_id = v_uid
      and item.day = p_day
      and item.task_id = v_item.task_id
      and item.dismissed_at is null
      and item.id <> v_item.id
  ) then
    raise exception 'That task is already on that day';
  end if;

  if v_item.routine_id is not null and exists (
    select 1
    from public.today_items item
    where item.user_id = v_uid
      and item.day = p_day
      and item.routine_id = v_item.routine_id
      and item.dismissed_at is null
      and item.id <> v_item.id
  ) then
    raise exception 'That line is already on that day';
  end if;

  if p_day > p_as_of and v_item.task_id is not null and exists (
    select 1
    from public.today_routines routine
    where routine.user_id = v_uid
      and routine.active
      and routine.task_id = v_item.task_id
      and routine.id is distinct from v_item.routine_id
      and (routine.days::integer & (1 << extract(dow from p_day)::integer)) <> 0
      and not exists (
        select 1
        from public.today_items skipped
        where skipped.user_id = v_uid
          and skipped.day = p_day
          and skipped.routine_id = routine.id
          and skipped.dismissed_at is not null
      )
  ) then
    raise exception 'That task is already on that day';
  end if;

  v_rank := public.today_rank_at_bottom(p_day);

  update public.today_items
  set day = p_day, rank = v_rank, dismissed_at = null
  where id = v_item.id;

  if v_item.routine_id is not null then
    update public.today_routines
    set rank = v_rank
    where id = v_item.routine_id
      and user_id = v_uid
      and active;
  end if;
end;
$$;

comment on function public.move_today_item_to_day(uuid, date, date) is
  'Move one Today line to the person''s local today or the next day. The next day is not prepared. The line is placed at the bottom of that day and is visible again if it had been taken off.';

-- Hide one line for its day. Does not write to tasks or today_routines.
create or replace function public.dismiss_today_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item public.today_items;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_item
  from public.today_items
  where id = p_item_id
    and user_id = v_uid;
  if not found then
    raise exception 'Line not found';
  end if;
  if v_item.checked_at is not null then
    raise exception 'Ticked lines stay on their day';
  end if;
  if v_item.dismissed_at is not null then
    return;
  end if;

  update public.today_items
  set dismissed_at = now()
  where id = v_item.id;
end;
$$;

revoke all on function public.dismiss_today_item(uuid) from public, anon;
grant execute on function public.dismiss_today_item(uuid) to authenticated;
grant execute on function public.dismiss_today_item(uuid) to service_role;

comment on function public.dismiss_today_item(uuid) is
  'Take one Today line off its day. The linked task is not deleted, completed, or rescheduled. A routine keeps repeating on later days. Ticked lines stay.';

create or replace function public.restore_today_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item public.today_items;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_item
  from public.today_items
  where id = p_item_id
    and user_id = v_uid;
  if not found then
    raise exception 'Line not found';
  end if;
  if v_item.dismissed_at is null then
    return;
  end if;

  update public.today_items
  set dismissed_at = null
  where id = v_item.id;
end;
$$;

revoke all on function public.restore_today_item(uuid) from public, anon;
grant execute on function public.restore_today_item(uuid) to authenticated;
grant execute on function public.restore_today_item(uuid) to service_role;

comment on function public.restore_today_item(uuid) is
  'Put a line that was taken off its day back on that day. Does not change the linked task.';
