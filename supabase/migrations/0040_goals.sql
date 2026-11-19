-- Goals: the handful of results a person is actually working towards, kept
-- apart from the day-to-day of circles and actions.
--
-- A goal is deliberately made to commit to something checkable. Beyond a title
-- and the context behind it, every goal names one result, in one of two shapes:
--
--   * 'outcome' -> a written line that is either true or it is not, e.g.
--                  "Trove is on the App Store with 100 paying users".
--   * 'number'  -> a figure to reach, with where it stands now, e.g. 12 of 100.
--
-- There is no due date. A goal is a direction with a finish line, not a task
-- with a deadline, and dating one tends to turn it back into a task.
--
-- Projects can be tied to a goal, so the work that serves it is visible from
-- it. The link is many-to-many: a project can serve more than one goal.
--
-- Goals are private to the person. They are behind a beta flag on the profile
-- until the feature settles.

alter table public.profiles
  add column if not exists goals_enabled boolean not null default false;

comment on column public.profiles.goals_enabled is
  'When true, this person sees Goals. Beta, so it defaults to false.';

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null,
  -- Why this matters. Optional: a goal can stand on its result alone.
  description text,
  -- Which shape the result takes. See the header.
  result_kind text not null default 'outcome',
  -- result_kind = 'outcome': the line that is either true or it is not.
  outcome text,
  -- result_kind = 'number': the figure to reach, where it stands, and what is
  -- being counted ('paying users', 'kg', 'chapters'). Unit is for display only.
  target_value numeric,
  current_value numeric not null default 0,
  unit text,
  -- Set when the goal is reached. Nulling it reopens the goal.
  achieved_at timestamptz,
  -- Hand order in the list, newest at the top by default. Same scheme as tasks.
  rank text collate "C" not null default 'n',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint goals_title_ok check (char_length(btrim(title)) between 1 and 200),
  constraint goals_description_ok
    check (description is null or char_length(btrim(description)) <= 4000),
  constraint goals_result_kind_ok check (result_kind in ('outcome', 'number')),
  -- A written goal has to actually say what the result is.
  constraint goals_outcome_ok check (
    result_kind <> 'outcome'
    or (outcome is not null and char_length(btrim(outcome)) between 1 and 500)
  ),
  -- A counted goal has to have something to count towards.
  constraint goals_target_ok check (result_kind <> 'number' or target_value is not null),
  constraint goals_unit_ok check (unit is null or char_length(btrim(unit)) between 1 and 40)
);

create index goals_owner_idx on public.goals (user_id, created_at desc);

comment on table public.goals is
  'One person''s goals. Each names a result: a written outcome, or a number to reach. No due date by design. Private to the owner.';
comment on column public.goals.result_kind is
  '''outcome'' for a written result, ''number'' for a figure to reach.';
comment on column public.goals.current_value is
  'Where a counted goal stands now. Ignored when result_kind is ''outcome''.';

-- The work that serves a goal. Many-to-many: a project can serve more than one.
create table public.goal_projects (
  goal_id uuid not null references public.goals(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (goal_id, project_id)
);

create index goal_projects_project_idx on public.goal_projects (project_id);

comment on table public.goal_projects is
  'Projects tied to a goal, so the work serving it is visible from it.';

alter table public.goals enable row level security;
alter table public.goal_projects enable row level security;

create policy "read own goals" on public.goals
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "insert own goals" on public.goals
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "update own goals" on public.goals
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "delete own goals" on public.goals
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- A link is the goal owner's to make or break. Whether they can see the project
-- is already settled by the projects table's own policies, which this does not
-- widen: reading a row here returns ids, not project contents.
create policy "read own goal links" on public.goal_projects
  for select to authenticated
  using (
    exists (
      select 1 from public.goals g
      where g.id = goal_projects.goal_id and g.user_id = (select auth.uid())
    )
  );

create policy "insert own goal links" on public.goal_projects
  for insert to authenticated
  with check (
    exists (
      select 1 from public.goals g
      where g.id = goal_projects.goal_id and g.user_id = (select auth.uid())
    )
  );

create policy "delete own goal links" on public.goal_projects
  for delete to authenticated
  using (
    exists (
      select 1 from public.goals g
      where g.id = goal_projects.goal_id and g.user_id = (select auth.uid())
    )
  );

revoke all on table public.goals from public, anon;
revoke all on table public.goal_projects from public, anon;
grant select, insert, update, delete on table public.goals to authenticated;
grant select, insert, delete on table public.goal_projects to authenticated;
grant all on table public.goals to service_role;
grant all on table public.goal_projects to service_role;
