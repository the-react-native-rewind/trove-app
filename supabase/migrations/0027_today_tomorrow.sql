-- Plan tomorrow without closing today.
--
-- A day after the person's local today can hold lines, but it is not prepared:
-- no today_days row, and unticked one-offs stay where they are so ticking them
-- off today still counts. Routine rows are not copied onto that future date.
-- The app draws those routines as a preview.
--
-- When the date is today, ensure_today runs as before. Routines are inserted
-- at their saved ranks (a row already stored for that routine is kept).
-- Unticked one-offs from the previous day then move onto the date, under
-- every line already there, keeping their own order. Pre-planned lines stay
-- put, interleaved with routines by rank.
--
-- p_as_of is the person's local today. The database does not guess a timezone.
-- Callers that omit it are compared with the UTC date.

create or replace function public.today_rank_at_bottom(p_day date)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.rank_before((
    select min(rank)
    from (
      select item.rank
      from public.today_items item
      where item.user_id = (select auth.uid())
        and item.day = p_day
      union all
      select routine.rank
      from public.today_routines routine
      where routine.user_id = (select auth.uid())
        and routine.active
        and (routine.days::integer & (1 << extract(dow from p_day)::integer)) <> 0
        and not exists (
          select 1
          from public.today_items item
          where item.user_id = routine.user_id
            and item.day = p_day
            and item.routine_id = routine.id
        )
    ) ranks
  ));
$$;

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

  -- Routines and anything already planned keep the ranks they were given.
  -- A routine row stored ahead of time is not inserted again.
  insert into public.today_items (user_id, day, text, task_id, routine_id, rank)
  select v_uid, p_day, routine.text, routine.task_id, routine.id, routine.rank
  from public.today_routines routine
  where routine.user_id = v_uid
    and routine.active
    and (routine.days::integer & (1 << extract(dow from p_day)::integer)) <> 0
  on conflict (user_id, day, routine_id) where routine_id is not null do nothing;

  if not v_later then
    -- Leftovers come from the last prepared day before this one and from any
    -- planned days after it that were never opened. Without the planned days,
    -- skipping a planned day would strand the earlier day's unticked lines.
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

    -- Newest day first and highest rank first, so the previous top of the
    -- rolled group sits just under the lines already here and the rest follow.
    for v_row in
      select item.id
      from public.today_items item
      where item.user_id = v_uid
        and item.day < p_day
        and (v_since is null or item.day >= v_since)
        and item.routine_id is null
        and item.checked_at is null
      order by item.day desc, item.rank collate "C" desc, item.created_at asc, item.id asc
    loop
      if v_floor is null then
        -- Nothing here yet: keep this line's rank and build under it.
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
  'Prepare the caller''s Today list for one date. Safe to call more than once. Inserts scheduled routines, then moves unticked one-offs under lines already on that date.';

drop function public.add_today_item(date, text, uuid);

create function public.add_today_item(
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

  -- A later day is a plan. Store the line and leave the day unprepared.
  if p_day <= v_as_of then
    perform public.ensure_today(p_day);
  end if;

  if p_task_id is not null and exists (
    select 1
    from public.today_items
    where user_id = v_uid
      and day = p_day
      and task_id = p_task_id
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
  ) then
    raise exception 'That task is already on this day';
  end if;

  insert into public.today_items (user_id, day, text, task_id, rank)
  values (v_uid, p_day, v_text, p_task_id, public.today_rank_at_bottom(p_day))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.add_today_item(date, text, uuid, date) from public, anon;
grant execute on function public.add_today_item(date, text, uuid, date) to authenticated;
grant execute on function public.add_today_item(date, text, uuid, date) to service_role;

comment on function public.add_today_item(date, text, uuid, date) is
  'Append a private Today line for the caller. Prepares the day only when p_day is on or before p_as_of (the person''s local today). text or task_id, not both.';

-- Move one stored line between today and tomorrow. Tomorrow is not prepared.
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
  if v_item.day = p_day then
    return;
  end if;
  if p_day > p_as_of and v_item.checked_at is not null then
    raise exception 'Ticked lines stay on their day';
  end if;

  if p_day <= p_as_of then
    perform public.ensure_today(p_day);
  end if;

  if v_item.task_id is not null and exists (
    select 1
    from public.today_items item
    where item.user_id = v_uid
      and item.day = p_day
      and item.task_id = v_item.task_id
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
      and item.id <> v_item.id
  ) then
    raise exception 'That line is already on that day';
  end if;

  -- An unprepared day shows routines as previews. Do not plan a task that a
  -- routine will add there anyway.
  if p_day > p_as_of and v_item.task_id is not null and exists (
    select 1
    from public.today_routines routine
    where routine.user_id = v_uid
      and routine.active
      and routine.task_id = v_item.task_id
      and routine.id is distinct from v_item.routine_id
      and (routine.days::integer & (1 << extract(dow from p_day)::integer)) <> 0
  ) then
    raise exception 'That task is already on that day';
  end if;

  v_rank := public.today_rank_at_bottom(p_day);

  update public.today_items
  set day = p_day, rank = v_rank
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

revoke all on function public.move_today_item_to_day(uuid, date, date) from public, anon;
grant execute on function public.move_today_item_to_day(uuid, date, date) to authenticated;
grant execute on function public.move_today_item_to_day(uuid, date, date) to service_role;

comment on function public.move_today_item_to_day(uuid, date, date) is
  'Move one Today line to the person''s local today or the next day. The next day is not prepared. The line is placed at the bottom of that day.';

-- A routine preview has no row yet. Placing it on today writes one, after
-- preparing today. The schedule is unchanged, so tomorrow's preview remains.
create or replace function public.place_today_routine(p_routine_id uuid, p_as_of date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_routine public.today_routines;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_as_of is null then
    raise exception 'Day is required';
  end if;

  select * into v_routine
  from public.today_routines
  where id = p_routine_id
    and user_id = v_uid
    and active;
  if not found then
    raise exception 'Line not found';
  end if;

  perform public.ensure_today(p_as_of);

  if exists (
    select 1
    from public.today_items
    where user_id = v_uid
      and day = p_as_of
      and routine_id = v_routine.id
  ) then
    raise exception 'That line is already on today';
  end if;

  if v_routine.task_id is not null and exists (
    select 1
    from public.today_items
    where user_id = v_uid
      and day = p_as_of
      and task_id = v_routine.task_id
  ) then
    raise exception 'That task is already on today';
  end if;

  insert into public.today_items (user_id, day, text, task_id, routine_id, rank)
  values (
    v_uid,
    p_as_of,
    v_routine.text,
    v_routine.task_id,
    v_routine.id,
    public.today_rank_at_bottom(p_as_of)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.place_today_routine(uuid, date) from public, anon;
grant execute on function public.place_today_routine(uuid, date) to authenticated;
grant execute on function public.place_today_routine(uuid, date) to service_role;

comment on function public.place_today_routine(uuid, date) is
  'Put one active routine onto the person''s local today. Prepares that day. Does not remove the routine from later days.';
