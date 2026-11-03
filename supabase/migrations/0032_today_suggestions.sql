-- Suggestions on Today, and turning a plain line into an action.
--
-- The Suggestions card offers a few open Mine actions (assigned to this
-- person, not done, not already on this day). The first non-empty set is
-- stored in today_suggestions. Adding one to Today, or dismissing it, does
-- not pull in a replacement that day. An empty first look is not stored, so
-- the first actions of the day can still appear.
--
-- Rank matches src/lib/today.ts: overdue or due within 2 days first (earliest
-- date first), then in progress, then rank (higher first). At most 3.
-- Only the person's local today is offered. Tomorrow is a plan and gets none.
--
-- convert_today_item_to_task creates the circle task and links the existing
-- Today line in one statement, so the line keeps its day, rank, and tick.

create table public.today_suggestions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  task_id uuid not null references public.tasks(id) on delete cascade,
  position smallint not null,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, day, task_id),
  constraint today_suggestions_position_ok check (position >= 0 and position < 3)
);

comment on table public.today_suggestions is
  'The Mine actions offered on one person''s Today for one local date. The first non-empty set is the whole set for that day. dismissed_at means they dismissed it or it was added to the day.';

comment on column public.today_suggestions.dismissed_at is
  'Set when this suggestion is dismissed, or when that task is placed on the day. The row stays so the card does not fill the gap.';

alter table public.today_suggestions enable row level security;

create policy "read own today suggestions" on public.today_suggestions
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.today_suggestions from public, anon;
grant select on table public.today_suggestions to authenticated;
grant all on table public.today_suggestions to service_role;

-- Placing a task on a day resolves a suggestion for that task. A hidden
-- skip does not. Deleting the line later does not bring the suggestion back.
create or replace function public.today_suggestions_resolve_on_add()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.task_id is not null and new.dismissed_at is null
     and (
       tg_op = 'INSERT'
       or old.dismissed_at is not null
       or old.task_id is distinct from new.task_id
     )
  then
    update public.today_suggestions
    set dismissed_at = coalesce(dismissed_at, now())
    where user_id = new.user_id
      and day = new.day
      and task_id = new.task_id;
  end if;
  return new;
end;
$$;

revoke all on function public.today_suggestions_resolve_on_add() from public, anon, authenticated;

create trigger today_suggestions_resolve
  after insert or update of task_id, dismissed_at on public.today_items
  for each row execute function public.today_suggestions_resolve_on_add();

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
  position smallint
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
    insert into public.today_suggestions (user_id, day, task_id, position)
    select v_uid, p_day, picked.id, (picked.position - 1)::smallint
    from (
      select
        candidate.id,
        row_number() over (
          order by candidate.tier asc, candidate.soon_due asc nulls last, candidate.rank collate "C" desc, candidate.id asc
        ) as position
      from (
        select
          t.id,
          t.rank,
          case
            when t.due_date is not null and t.due_date <= (p_day + 2) then 0
            when t.status = 'in_progress' then 1
            else 2
          end as tier,
          case
            when t.due_date is not null and t.due_date <= (p_day + 2) then t.due_date
          end as soon_due
        from public.tasks t
        where t.status <> 'done'
          and public.is_space_member(t.space_id)
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
    where picked.position <= 3;
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
    offer.position
  from public.today_suggestions offer
  join public.tasks t on t.id = offer.task_id
  join public.spaces space on space.id = t.space_id
  where offer.user_id = v_uid
    and offer.day = p_day
    and offer.dismissed_at is null
    and t.status <> 'done'
    and public.is_space_member(t.space_id)
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
  order by offer.position;
end;
$$;

revoke all on function public.list_today_suggestions(date, date) from public, anon;
grant execute on function public.list_today_suggestions(date, date) to authenticated;
grant execute on function public.list_today_suggestions(date, date) to service_role;

comment on function public.list_today_suggestions(date, date) is
  'The frozen Suggestions set for the caller''s local today. The first non-empty pick is stored. Later calls do not add replacements. Any other day returns nothing.';

create or replace function public.dismiss_today_suggestion(p_day date, p_task_id uuid)
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
  if p_day is null or p_task_id is null then
    raise exception 'Day and task are required';
  end if;

  update public.today_suggestions
  set dismissed_at = coalesce(dismissed_at, now())
  where user_id = v_uid
    and day = p_day
    and task_id = p_task_id;

  if not found then
    raise exception 'Suggestion not found';
  end if;
end;
$$;

revoke all on function public.dismiss_today_suggestion(date, uuid) from public, anon;
grant execute on function public.dismiss_today_suggestion(date, uuid) to authenticated;
grant execute on function public.dismiss_today_suggestion(date, uuid) to service_role;

comment on function public.dismiss_today_suggestion(date, uuid) is
  'Hide one offered suggestion for that day. Does not change the task. Idempotent when it is already hidden.';

create or replace function public.convert_today_item_to_task(p_item_id uuid, p_space_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item public.today_items;
  v_title text;
  v_role text;
  v_task_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_space_id is null then
    raise exception 'Circle is required';
  end if;

  select role into v_role
  from public.space_members
  where space_id = p_space_id
    and user_id = v_uid;
  if v_role is null or v_role not in ('owner', 'admin', 'member') then
    raise exception 'You cannot add an action in that circle';
  end if;

  select * into v_item
  from public.today_items
  where id = p_item_id
    and user_id = v_uid
  for update;
  if not found then
    raise exception 'Line not found';
  end if;
  if v_item.dismissed_at is not null then
    raise exception 'That line is not on this day';
  end if;
  if v_item.task_id is not null then
    raise exception 'That line is already an action';
  end if;
  if v_item.routine_id is not null then
    raise exception 'A repeating line stays as it is';
  end if;

  v_title := nullif(regexp_replace(btrim(coalesce(v_item.text, '')), '\s+', ' ', 'g'), '');
  if v_title is null then
    raise exception 'Write the line before making it an action';
  end if;
  if char_length(v_title) > 300 then
    raise exception 'That line is too long to be an action title';
  end if;

  insert into public.tasks (space_id, title, status, created_by, position)
  values (
    p_space_id,
    v_title,
    'todo',
    v_uid,
    (extract(epoch from clock_timestamp()) * 1000)::double precision
  )
  returning id into v_task_id;

  insert into public.task_assignees (task_id, user_id, position)
  values (v_task_id, v_uid, 0);

  update public.today_items
  set task_id = v_task_id, text = null
  where id = v_item.id;

  return v_task_id;
end;
$$;

revoke all on function public.convert_today_item_to_task(uuid, uuid) from public, anon;
grant execute on function public.convert_today_item_to_task(uuid, uuid) to authenticated;
grant execute on function public.convert_today_item_to_task(uuid, uuid) to service_role;

comment on function public.convert_today_item_to_task(uuid, uuid) is
  'Create a to-do in the named circle, assigned to the caller, and link this plain Today line to it. The line keeps its day, rank, and tick. Task lines and routines are refused.';
