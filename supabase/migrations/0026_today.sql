-- Private per-user Today lists. A line is either free text or a link to a
-- task the person can see. It is never shared with a circle.
--
-- today_days records that a date has been prepared. ensure_today is idempotent
-- under a per-user, per-day advisory lock. The first time a day is opened:
--   * unticked one-off lines move forward from the most recent earlier day
--     that has rows (ticked lines and routine lines stay as history);
--   * active routines whose weekday bitmask includes that date are inserted
--     unticked, at the rank the person last left them.
-- A later prepared day blocks the move, so opening an earlier date cannot
-- pull lines backward. Repeating lines are not rolled; each scheduled day
-- gets a fresh row. The app passes the device-local date. This function does
-- not guess a timezone.
--
-- days is a Sunday-based bitmask: bit 0 = Sunday … bit 6 = Saturday.
-- 127 is every day. 62 is Monday–Friday.
--
-- The Today functions are security definer so preparing a day can copy the
-- caller's own lines even when a linked task is no longer visible to them.
-- Every function takes the user from auth.uid() and only touches those rows.
-- Direct table access stays under row level security.

create table public.today_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  text text,
  task_id uuid references public.tasks(id) on delete set null,
  days smallint not null default 127,
  rank text collate "C" not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint today_routines_one_body check (
    (text is not null and task_id is null)
    or (text is null and task_id is not null)
  ),
  constraint today_routines_text_ok check (
    text is null or char_length(btrim(text)) between 1 and 4000
  ),
  constraint today_routines_days_ok check (days between 1 and 127),
  constraint today_routines_rank_ok check (char_length(rank) > 0)
);

create index today_routines_user_active_idx
  on public.today_routines (user_id)
  where active;

create index today_routines_task_idx
  on public.today_routines (task_id)
  where task_id is not null;

create table public.today_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  text text,
  task_id uuid references public.tasks(id) on delete set null,
  routine_id uuid references public.today_routines(id) on delete set null,
  rank text collate "C" not null,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint today_items_one_body check (
    (text is not null and task_id is null)
    or (text is null and task_id is not null)
  ),
  constraint today_items_text_ok check (
    text is null or char_length(btrim(text)) between 1 and 4000
  ),
  constraint today_items_rank_ok check (char_length(rank) > 0)
);

create index today_items_user_day_idx
  on public.today_items (user_id, day, rank);

create unique index today_items_routine_day_idx
  on public.today_items (user_id, day, routine_id)
  where routine_id is not null;

create index today_items_task_idx
  on public.today_items (task_id)
  where task_id is not null;

-- Marker so an empty day is not prepared twice, and so a cleared day does not
-- get older lines back.
create table public.today_days (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

comment on table public.today_routines is
  'Private repeating lines for Today. days is a Sunday-based bitmask (bit 0 = Sunday). Changes apply from today onward; past today_items rows are not rewritten.';

comment on table public.today_items is
  'One person''s Today list for one local date. routine_id is set when the line was generated from a routine. Ticked lines stay on this day.';

comment on table public.today_days is
  'A day that ensure_today has already prepared for this person.';

comment on column public.today_routines.days is
  'Weekday bitmask. Bit 0 = Sunday through bit 6 = Saturday. 127 = every day. 62 = weekdays.';

-- Copy a title onto Today rows before a task disappears, then detach them so
-- the exactly-one-of text/task_id check still holds. Security definer because
-- the person deleting a shared task cannot update other people's rows under RLS.
create or replace function public.tasks_snapshot_today_text()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.today_items
  set
    text = left(
      coalesce(nullif(btrim(text), ''), nullif(btrim(old.title), ''), 'Task removed'),
      4000
    ),
    task_id = null
  where task_id = old.id;

  update public.today_routines
  set
    text = left(
      coalesce(nullif(btrim(text), ''), nullif(btrim(old.title), ''), 'Task removed'),
      4000
    ),
    task_id = null
  where task_id = old.id;

  return old;
end;
$$;

revoke all on function public.tasks_snapshot_today_text() from public, anon, authenticated;

create trigger tasks_snapshot_today_text
  before delete on public.tasks
  for each row execute function public.tasks_snapshot_today_text();

-- The stored task_id of one of the caller's own rows. Used by the update
-- policies so keeping a linked task that is no longer visible stays allowed.
-- A subquery on the same table inside its own policy recurses (42P17), so this
-- reads the row as security definer instead. Stable, so an update's check sees
-- the value from before the statement.
create or replace function public.today_item_task_id(p_item_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select task_id
  from public.today_items
  where id = p_item_id
    and user_id = (select auth.uid());
$$;

create or replace function public.today_routine_task_id(p_routine_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select task_id
  from public.today_routines
  where id = p_routine_id
    and user_id = (select auth.uid());
$$;

revoke all on function public.today_item_task_id(uuid) from public, anon;
revoke all on function public.today_routine_task_id(uuid) from public, anon;
grant execute on function public.today_item_task_id(uuid) to authenticated, service_role;
grant execute on function public.today_routine_task_id(uuid) to authenticated, service_role;

alter table public.today_routines enable row level security;
alter table public.today_items enable row level security;
alter table public.today_days enable row level security;

create policy "read own today routines" on public.today_routines
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "insert own today routines" on public.today_routines
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      task_id is null
      or exists (select 1 from public.tasks t where t.id = task_id)
    )
  );

create policy "update own today routines" on public.today_routines
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      task_id is null
      -- Keeping the current task is allowed even if the circle is no longer visible.
      or task_id is not distinct from public.today_routine_task_id(id)
      or exists (select 1 from public.tasks t where t.id = task_id)
    )
  );

create policy "delete own today routines" on public.today_routines
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "read own today items" on public.today_items
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "insert own today items" on public.today_items
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      task_id is null
      or exists (select 1 from public.tasks t where t.id = task_id)
    )
  );

create policy "update own today items" on public.today_items
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      task_id is null
      or task_id is not distinct from public.today_item_task_id(id)
      or exists (select 1 from public.tasks t where t.id = task_id)
    )
  );

create policy "delete own today items" on public.today_items
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "read own today days" on public.today_days
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "insert own today days" on public.today_days
  for insert to authenticated
  with check (user_id = (select auth.uid()));

revoke all on table public.today_routines from public, anon;
revoke all on table public.today_items from public, anon;
revoke all on table public.today_days from public, anon;
grant select, insert, update, delete on table public.today_routines to authenticated;
grant select, insert, update, delete on table public.today_items to authenticated;
grant select, insert on table public.today_days to authenticated;
grant all on table public.today_routines to service_role;
grant all on table public.today_items to service_role;
grant all on table public.today_days to service_role;

-- Lowest rank on this person's day, or a0 when the day is empty.
-- Higher keys sort first, so the bottom of the list is the minimum key.
create or replace function public.today_rank_at_bottom(p_day date)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.rank_before((
    select min(rank)
    from public.today_items
    where user_id = auth.uid()
      and day = p_day
  ));
$$;

revoke all on function public.today_rank_at_bottom(date) from public, anon;
grant execute on function public.today_rank_at_bottom(date) to authenticated;
grant execute on function public.today_rank_at_bottom(date) to service_role;

create or replace function public.ensure_today(p_day date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_source date;
  v_later boolean;
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

  if not v_later then
    select max(item.day)
    into v_source
    from public.today_items item
    where item.user_id = v_uid
      and item.day < p_day;

    if v_source is not null then
      update public.today_items
      set day = p_day
      where user_id = v_uid
        and day = v_source
        and routine_id is null
        and checked_at is null;
    end if;
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

revoke all on function public.ensure_today(date) from public, anon;
grant execute on function public.ensure_today(date) to authenticated;
grant execute on function public.ensure_today(date) to service_role;

comment on function public.ensure_today(date) is
  'Prepare the caller''s Today list for one date. Safe to call more than once. Moves unticked one-offs forward and inserts scheduled routines.';

create or replace function public.add_today_item(
  p_day date,
  p_text text default null,
  p_task_id uuid default null
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

  perform public.ensure_today(p_day);

  if p_task_id is not null and exists (
    select 1
    from public.today_items
    where user_id = v_uid
      and day = p_day
      and task_id = p_task_id
  ) then
    raise exception 'That task is already on this day';
  end if;

  insert into public.today_items (user_id, day, text, task_id, rank)
  values (v_uid, p_day, v_text, p_task_id, public.today_rank_at_bottom(p_day))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.add_today_item(date, text, uuid) from public, anon;
grant execute on function public.add_today_item(date, text, uuid) to authenticated;
grant execute on function public.add_today_item(date, text, uuid) to service_role;

comment on function public.add_today_item(date, text, uuid) is
  'Append a private Today line for the caller. Prepares the day first. text or task_id, not both.';

create or replace function public.move_today_item(p_item_id uuid, p_rank text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item public.today_items;
  v_rank text := btrim(p_rank);
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if v_rank is null or char_length(v_rank) = 0 or char_length(v_rank) > 200 then
    raise exception 'Rank is not valid';
  end if;

  select * into v_item
  from public.today_items
  where id = p_item_id
    and user_id = v_uid;
  if not found then
    raise exception 'Line not found';
  end if;

  update public.today_items
  set rank = v_rank
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

revoke all on function public.move_today_item(uuid, text) from public, anon;
grant execute on function public.move_today_item(uuid, text) to authenticated;
grant execute on function public.move_today_item(uuid, text) to service_role;

comment on function public.move_today_item(uuid, text) is
  'Set one Today line''s fractional rank. An active routine keeps that rank for later days. Past days are not rewritten.';

create or replace function public.rename_today_item(p_item_id uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item public.today_items;
  v_text text := nullif(btrim(p_text), '');
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if v_text is null or char_length(v_text) > 4000 then
    raise exception 'A line can be 4000 characters or fewer';
  end if;

  select * into v_item
  from public.today_items
  where id = p_item_id
    and user_id = v_uid;
  if not found then
    raise exception 'Line not found';
  end if;
  if v_item.task_id is not null then
    raise exception 'This line follows a task';
  end if;

  update public.today_items
  set text = v_text
  where id = v_item.id;

  if v_item.routine_id is not null then
    update public.today_routines
    set text = v_text
    where id = v_item.routine_id
      and user_id = v_uid
      and active;
  end if;
end;
$$;

revoke all on function public.rename_today_item(uuid, text) from public, anon;
grant execute on function public.rename_today_item(uuid, text) to authenticated;
grant execute on function public.rename_today_item(uuid, text) to service_role;

-- p_days 0 stops repeating. The line stays today as a one-off.
-- Any other mask (1–127) starts or changes the routine from this line forward.
-- When this line's date is no longer scheduled and it is unticked, the line
-- leaves today. Ticked lines stay as history. Past dates are not rewritten.
create or replace function public.set_today_repeat(p_item_id uuid, p_days smallint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item public.today_items;
  v_routine_id uuid;
  v_matches boolean;
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

  if p_days is null or p_days = 0 then
    if v_item.routine_id is not null then
      update public.today_routines
      set active = false
      where id = v_item.routine_id
        and user_id = v_uid;
      update public.today_items
      set routine_id = null
      where id = v_item.id;
    end if;
    return v_item.id;
  end if;

  if p_days < 1 or p_days > 127 then
    raise exception 'Choose at least one day';
  end if;

  v_matches := (p_days::integer & (1 << extract(dow from v_item.day)::integer)) <> 0;

  if v_item.routine_id is null then
    insert into public.today_routines (user_id, text, task_id, days, rank, active)
    values (v_uid, v_item.text, v_item.task_id, p_days, v_item.rank, true)
    returning id into v_routine_id;
  else
    update public.today_routines
    set
      days = p_days,
      active = true,
      rank = v_item.rank,
      text = v_item.text,
      task_id = v_item.task_id
    where id = v_item.routine_id
      and user_id = v_uid
    returning id into v_routine_id;
    if v_routine_id is null then
      raise exception 'Line not found';
    end if;
  end if;

  if v_matches then
    update public.today_items
    set routine_id = v_routine_id
    where id = v_item.id;
    return v_item.id;
  end if;

  if v_item.checked_at is null then
    delete from public.today_items where id = v_item.id;
    return null;
  end if;

  return v_item.id;
end;
$$;

revoke all on function public.set_today_repeat(uuid, smallint) from public, anon;
grant execute on function public.set_today_repeat(uuid, smallint) to authenticated;
grant execute on function public.set_today_repeat(uuid, smallint) to service_role;

comment on function public.set_today_repeat(uuid, smallint) is
  'Start, change, or stop (p_days 0) a Today routine from one line. Applies from that line''s day forward. Past rows are left as they are.';

-- Deleting a repeating line also stops the routine, so tomorrow does not
-- bring it back. Past days keep their rows. Stopping without deleting is
-- set_today_repeat(..., 0), which leaves today's line in place.
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
    update public.today_routines
    set active = false
    where id = v_item.routine_id
      and user_id = v_uid;
  end if;

  delete from public.today_items where id = v_item.id;
end;
$$;

revoke all on function public.delete_today_item(uuid) from public, anon;
grant execute on function public.delete_today_item(uuid) to authenticated;
grant execute on function public.delete_today_item(uuid) to service_role;

comment on function public.delete_today_item(uuid) is
  'Remove one Today line. A repeating line stops repeating as well. Past days are not rewritten.';
