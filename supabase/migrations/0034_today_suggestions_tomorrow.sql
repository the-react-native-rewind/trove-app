-- Suggestions for tomorrow, as well as today.
--
-- list_today_suggestions still freezes the first non-empty set for one
-- local day. Today and the next day each have their own set. Any other day
-- returns nothing. Tomorrow is not prepared: calling this does not insert
-- routines or mark the day prepared.
--
-- The pick is unchanged: the top of Mine, in Mine's order. Tomorrow skips
-- actions already on today or tomorrow, including a routine that would show
-- on either day. Dismissing one, or adding it, does not pull in a replacement.
--
-- The result column stays slot. position is reserved in a RETURNS TABLE list.

create or replace function public.list_today_suggestions(p_day date, p_as_of date default null)
returns table (
  task_id uuid,
  title text,
  status text,
  due_date date,
  rank text,
  space_id uuid,
  space_name text,
  space_color text,
  -- position is reserved in a RETURNS TABLE list, so the order is slot.
  slot smallint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_as_of date := coalesce(p_as_of, (timezone('utc', now()))::date);
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_day is null then
    raise exception 'Day is required';
  end if;
  if p_day <> v_as_of and p_day <> (v_as_of + 1) then
    return;
  end if;

  if p_day <= v_as_of then
    perform public.ensure_today(p_day);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':suggestions:' || p_day::text, 0));

  if not exists (
    select 1
    from public.today_suggestions offer
    where offer.user_id = v_uid
      and offer.day = p_day
  ) then
    insert into public.today_suggestions (user_id, day, task_id, "position")
    select v_uid, p_day, picked.id, (picked.slot - 1)::smallint
    from (
      select
        candidate.id,
        row_number() over (
          order by
            candidate.rank collate "C" desc,
            candidate.due_date asc nulls last,
            candidate.task_position asc,
            candidate.created_at asc,
            candidate.id asc
        ) as slot
      from (
        select
          t.id,
          t.rank,
          t.due_date,
          t."position" as task_position,
          t.created_at
        from public.tasks t
        where t.status <> 'done'
          and public.can_see_task(t.space_id, t.project_id)
          and exists (
            select 1
            from public.task_assignees assignee
            where assignee.task_id = t.id
              and assignee.user_id = v_uid
          )
          and not exists (
            select 1
            from public.today_items item
            where item.user_id = v_uid
              and item.day = p_day
              and item.task_id = t.id
          )
          and not (
            p_day = v_as_of + 1
            and exists (
              select 1
              from public.today_items item
              where item.user_id = v_uid
                and item.day = v_as_of
                and item.task_id = t.id
                and item.dismissed_at is null
            )
          )
          and not exists (
            select 1
            from public.today_routines routine
            where routine.user_id = v_uid
              and routine.active
              and routine.task_id = t.id
              and (
                (
                  (routine.days::integer & (1 << extract(dow from p_day)::integer)) <> 0
                  and not exists (
                    select 1
                    from public.today_items skipped
                    where skipped.user_id = v_uid
                      and skipped.day = p_day
                      and skipped.routine_id = routine.id
                      and skipped.dismissed_at is not null
                  )
                )
                or (
                  p_day = v_as_of + 1
                  and (routine.days::integer & (1 << extract(dow from v_as_of)::integer)) <> 0
                  and not exists (
                    select 1
                    from public.today_items skipped
                    where skipped.user_id = v_uid
                      and skipped.day = v_as_of
                      and skipped.routine_id = routine.id
                      and skipped.dismissed_at is not null
                  )
                )
              )
          )
      ) candidate
    ) picked
    where picked.slot <= 3;
  end if;

  return query
  select
    t.id,
    t.title,
    t.status,
    t.due_date,
    t.rank,
    space.id,
    space.name,
    space.color,
    offer."position"
  from public.today_suggestions offer
  join public.tasks t on t.id = offer.task_id
  join public.spaces space on space.id = t.space_id
  where offer.user_id = v_uid
    and offer.day = p_day
    and offer.dismissed_at is null
    and t.status <> 'done'
    and public.can_see_task(t.space_id, t.project_id)
    and exists (
      select 1
      from public.task_assignees assignee
      where assignee.task_id = t.id
        and assignee.user_id = v_uid
    )
    and not exists (
      select 1
      from public.today_items item
      where item.user_id = v_uid
        and item.day = p_day
        and item.task_id = t.id
    )
    and not (
      p_day = v_as_of + 1
      and exists (
        select 1
        from public.today_items item
        where item.user_id = v_uid
          and item.day = v_as_of
          and item.task_id = t.id
          and item.dismissed_at is null
      )
    )
    and not exists (
      select 1
      from public.today_routines routine
      where routine.user_id = v_uid
        and routine.active
        and routine.task_id = t.id
        and (
          (
            (routine.days::integer & (1 << extract(dow from p_day)::integer)) <> 0
            and not exists (
              select 1
              from public.today_items skipped
              where skipped.user_id = v_uid
                and skipped.day = p_day
                and skipped.routine_id = routine.id
                and skipped.dismissed_at is not null
            )
          )
          or (
            p_day = v_as_of + 1
            and (routine.days::integer & (1 << extract(dow from v_as_of)::integer)) <> 0
            and not exists (
              select 1
              from public.today_items skipped
              where skipped.user_id = v_uid
                and skipped.day = v_as_of
                and skipped.routine_id = routine.id
                and skipped.dismissed_at is not null
            )
          )
        )
    )
  order by offer."position";
end;
$$;

revoke all on function public.list_today_suggestions(date, date) from public, anon;
grant execute on function public.list_today_suggestions(date, date) to authenticated;
grant execute on function public.list_today_suggestions(date, date) to service_role;

comment on function public.list_today_suggestions(date, date) is
  'The frozen Suggestions set for the caller''s local today or the next day. Each day stores its own first non-empty pick, the top of Mine in Mine''s order. Tomorrow skips actions already on today or tomorrow and is not prepared. Later calls do not add replacements. Any other day returns nothing.';
