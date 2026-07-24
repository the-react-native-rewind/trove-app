-- Private weekly planning metadata. The task remains shared with its space;
-- only the owning user can see or change their intention to work on it.
create table public.user_task_week_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  week_start date not null,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, task_id)
);

create index user_task_week_plans_user_week_idx
  on public.user_task_week_plans(user_id, week_start, position);

alter table public.user_task_week_plans enable row level security;

create policy "users read own week plans" on public.user_task_week_plans
  for select to authenticated
  using (user_id = auth.uid());

create policy "users add own visible tasks to a week" on public.user_task_week_plans
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.tasks
      where tasks.id = task_id
        and is_space_member(tasks.space_id)
    )
  );

create policy "users move own week plans" on public.user_task_week_plans
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.tasks
      where tasks.id = task_id
        and is_space_member(tasks.space_id)
    )
  );

create policy "users remove own week plans" on public.user_task_week_plans
  for delete to authenticated
  using (user_id = auth.uid());
