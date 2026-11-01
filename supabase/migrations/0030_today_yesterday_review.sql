-- Yesterday is a review, not an automatic rollover.
--
-- Opening today still inserts routines that fall on this weekday. Unticked
-- one-off lines from earlier days stay where they were written. The app lists
-- those open lines so the person can mark them done, move them to today, or
-- drop them. Routines from past days are not part of that review: a routine
-- that was not ticked simply does not carry forward.
--
-- Removing a routine line from one day dismisses that occurrence. The routine
-- stays active, so later scheduled days still get a row. delete_today_item
-- used to deactivate the routine; it now dismisses a repeating line instead.
-- skip_today_routine does the same for a preview that has no row yet.

create or replace function public.ensure_today(p_day date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
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

  insert into public.today_items (user_id, day, text, task_id, routine_id, rank)
  select v_uid, p_day, routine.text, routine.task_id, routine.id, routine.rank
  from public.today_routines routine
  where routine.user_id = v_uid
    and routine.active
    and (routine.days::integer & (1 << extract(dow from p_day)::integer)) <> 0
  on conflict (user_id, day, routine_id) where routine_id is not null do nothing;

  insert into public.today_days (user_id, day)
  values (v_uid, p_day)
  on conflict (user_id, day) do nothing;
end;
$$;

comment on function public.ensure_today(date) is
  'Prepare the caller''s Today list for one date. Safe to call more than once. Inserts scheduled routines. Does not move unticked lines from earlier days.';

-- Hide one occurrence of a routine, including a preview that has no row yet.
-- Does not deactivate the routine and does not prepare the day.
create or replace function public.skip_today_routine(p_routine_id uuid, p_day date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_routine public.today_routines;
  v_item public.today_items;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_day is null then
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

  select * into v_item
  from public.today_items
  where user_id = v_uid
    and day = p_day
    and routine_id = v_routine.id;

  if found then
    if v_item.checked_at is not null then
      raise exception 'Ticked lines stay on their day';
    end if;
    if v_item.dismissed_at is null then
      update public.today_items
      set dismissed_at = now()
      where id = v_item.id;
    end if;
    return v_item.id;
  end if;

  insert into public.today_items (user_id, day, text, task_id, routine_id, rank, dismissed_at)
  values (
    v_uid,
    p_day,
    v_routine.text,
    v_routine.task_id,
    v_routine.id,
    v_routine.rank,
    now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.skip_today_routine(uuid, date) from public, anon;
grant execute on function public.skip_today_routine(uuid, date) to authenticated;
grant execute on function public.skip_today_routine(uuid, date) to service_role;

comment on function public.skip_today_routine(uuid, date) is
  'Take one routine off one day. The routine stays active. A preview with no row is stored as a dismissed line so it is not inserted again for that day.';

-- A repeating line is taken off that day only. The routine stays active.
-- A one-off line is still removed.
create or replace function public.delete_today_item(p_item_id uuid)
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

  if v_item.routine_id is not null then
    if v_item.checked_at is not null then
      raise exception 'Ticked lines stay on their day';
    end if;
    if v_item.dismissed_at is null then
      update public.today_items
      set dismissed_at = now()
      where id = v_item.id;
    end if;
    return;
  end if;

  delete from public.today_items where id = v_item.id;
end;
$$;

comment on function public.delete_today_item(uuid) is
  'Remove one Today line. A repeating line is only taken off that day; the routine keeps repeating later. A one-off line is deleted. Past days are not rewritten.';
