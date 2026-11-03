-- Suggestions follow Mine, not a score.
--
-- list_today_suggestions still freezes the first non-empty set for the
-- person's local today. The pick is the top of their Mine list: actions
-- assigned to them that are not done, in the same order the Mine tab uses
-- (rank, higher first, then due date, then position, then creation time).
-- Due dates and In progress do not jump the queue. The first three that are
-- not already on today are stored. Dismissing one, or adding it, does not
-- pull in a replacement.
--
-- The result column is slot, not position. position is reserved in a
-- RETURNS TABLE list on Postgres.

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
  if p_day <> v_as_of then
    return;
  end if;

  perform public.ensure_today(p_day);
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
  order by offer."position";
end;
$$;

revoke all on function public.list_today_suggestions(date, date) from public, anon;
grant execute on function public.list_today_suggestions(date, date) to authenticated;
grant execute on function public.list_today_suggestions(date, date) to service_role;

comment on function public.list_today_suggestions(date, date) is
  'The frozen Suggestions set for the caller''s local today. The first non-empty pick is the top of Mine, in Mine''s order, skipping actions already on today. Later calls do not add replacements. Any other day returns nothing.';
