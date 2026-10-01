-- Performance advisor: evaluate auth.uid() once per query, index foreign
-- keys, and fold duplicate permissive SELECT policies. Visibility is the
-- same: each rewritten predicate is the previous one with (select auth.uid()),
-- and merged SELECT policies are the OR of the policies they replace.

-- profiles
drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()));

drop policy if exists "read profiles you share a space with" on public.profiles;
create policy "read profiles you share a space with" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.space_members mine
      join public.space_members theirs on theirs.space_id = mine.space_id
      where mine.user_id = (select auth.uid())
        and theirs.user_id = profiles.id
    )
  );

-- spaces: members, plus the owner during insert before the membership trigger.
drop policy if exists "members read spaces" on public.spaces;
drop policy if exists "owners read own spaces" on public.spaces;
create policy "members read spaces" on public.spaces
  for select to authenticated
  using (
    is_space_member(id)
    or owner_id = (select auth.uid())
  );

drop policy if exists "create space" on public.spaces;
create policy "create space" on public.spaces
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "owners update space" on public.spaces;
create policy "owners update space" on public.spaces
  for update to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "owners delete non-default space" on public.spaces;
create policy "owners delete non-default space" on public.spaces
  for delete to authenticated
  using (owner_id = (select auth.uid()) and is_default = false);

-- space_members
drop policy if exists "admins or self remove member" on public.space_members;
create policy "admins or self remove member" on public.space_members
  for delete to authenticated
  using (
    role <> 'owner'
    and (
      current_space_role(space_id) in ('owner', 'admin')
      or user_id = (select auth.uid())
    )
  );

-- invites
drop policy if exists "admins create invites" on public.invites;
create policy "admins create invites" on public.invites
  for insert to authenticated
  with check (
    current_space_role(space_id) in ('owner', 'admin')
    and invited_by = (select auth.uid())
  );

-- task_attachments
drop policy if exists "writers add attachments" on public.task_attachments;
create policy "writers add attachments" on public.task_attachments
  for insert to authenticated
  with check (
    current_space_role(space_id) in ('owner', 'admin', 'member')
    and created_by = (select auth.uid())
  );

-- user_task_week_plans
drop policy if exists "users read own week plans" on public.user_task_week_plans;
create policy "users read own week plans" on public.user_task_week_plans
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "users add own visible tasks to a week" on public.user_task_week_plans;
create policy "users add own visible tasks to a week" on public.user_task_week_plans
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.tasks
      where tasks.id = task_id
        and is_space_member(tasks.space_id)
    )
  );

drop policy if exists "users move own week plans" on public.user_task_week_plans;
create policy "users move own week plans" on public.user_task_week_plans
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.tasks
      where tasks.id = task_id
        and is_space_member(tasks.space_id)
    )
  );

drop policy if exists "users remove own week plans" on public.user_task_week_plans;
create policy "users remove own week plans" on public.user_task_week_plans
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- labels and task_labels: FOR ALL repeated the member SELECT for writers.
-- Writers are members, so the SELECT policy already covers them. Split the
-- write commands so there is one SELECT policy.
drop policy if exists "writers manage labels" on public.labels;
create policy "writers insert labels" on public.labels
  for insert to authenticated
  with check (current_space_role(space_id) in ('owner', 'admin', 'member'));
create policy "writers update labels" on public.labels
  for update to authenticated
  using (current_space_role(space_id) in ('owner', 'admin', 'member'))
  with check (current_space_role(space_id) in ('owner', 'admin', 'member'));
create policy "writers delete labels" on public.labels
  for delete to authenticated
  using (current_space_role(space_id) in ('owner', 'admin', 'member'));

drop policy if exists "writers manage task_labels" on public.task_labels;
create policy "writers insert task_labels" on public.task_labels
  for insert to authenticated
  with check (
    exists (
      select 1 from public.tasks t
      where t.id = task_id
        and current_space_role(t.space_id) in ('owner', 'admin', 'member')
    )
  );
create policy "writers update task_labels" on public.task_labels
  for update to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_id
        and current_space_role(t.space_id) in ('owner', 'admin', 'member')
    )
  )
  with check (
    exists (
      select 1 from public.tasks t
      where t.id = task_id
        and current_space_role(t.space_id) in ('owner', 'admin', 'member')
    )
  );
create policy "writers delete task_labels" on public.task_labels
  for delete to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_id
        and current_space_role(t.space_id) in ('owner', 'admin', 'member')
    )
  );

create index if not exists invites_invited_by_idx on public.invites (invited_by);
create index if not exists labels_space_id_idx on public.labels (space_id);
create index if not exists spaces_owner_id_idx on public.spaces (owner_id);
create index if not exists task_attachments_created_by_idx on public.task_attachments (created_by);
create index if not exists task_attachments_space_id_idx on public.task_attachments (space_id);
create index if not exists task_labels_label_id_idx on public.task_labels (label_id);
create index if not exists tasks_created_by_idx on public.tasks (created_by);
create index if not exists user_task_week_plans_task_id_idx on public.user_task_week_plans (task_id);
