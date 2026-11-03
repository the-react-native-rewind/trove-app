-- Projects group actions inside a circle.
--
-- A project belongs to one circle. An action belongs to at most one project
-- (tasks.project_id, null when it is just in the circle).
--
-- project_members is an optional allow-list, not a second roster. People
-- still join the circle through invites. A member with no rows in
-- project_members for that circle sees the whole circle, which is today's
-- behaviour. One or more rows limit them to actions in those projects, and
-- to the projects themselves. Owners and admins always see everything.
-- The same rule applies to agent members. Enforced here, not only in the app.
--
-- Idempotent: tables, columns, indexes, and policies can be applied again.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  name text not null,
  color text not null default 'sage',
  description text,
  rank text collate "C" not null default 'n',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.invite_projects (
  invite_id uuid not null references public.invites (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  primary key (invite_id, project_id)
);

alter table public.tasks
  add column if not exists project_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_project_id_fkey'
  ) then
    alter table public.tasks
      add constraint tasks_project_id_fkey
      foreign key (project_id) references public.projects (id) on delete set null;
  end if;
end $$;

alter table public.projects drop constraint if exists projects_name_len;
alter table public.projects
  add constraint projects_name_len
  check (char_length(name) between 1 and 80);

alter table public.projects drop constraint if exists projects_rank_len;
alter table public.projects
  add constraint projects_rank_len
  check (char_length(rank) > 0);

create index if not exists projects_space_idx
  on public.projects (space_id)
  where archived_at is null;

create index if not exists projects_space_rank_idx
  on public.projects (space_id, rank desc);

create index if not exists project_members_user_idx
  on public.project_members (user_id);

create index if not exists tasks_project_idx
  on public.tasks (project_id)
  where project_id is not null;

create index if not exists invite_projects_project_idx
  on public.invite_projects (project_id);

comment on table public.projects is
  'A named group of actions inside one circle. Archived projects stay on their actions but leave the projects list.';

comment on table public.project_members is
  'Optional allow-list. Zero rows for a member in a circle means they see the whole circle. One or more rows limit them to those projects. Owners and admins are not limited.';

comment on column public.tasks.project_id is
  'The single project this action belongs to, or null when it sits in the circle list only.';

comment on table public.invite_projects is
  'Projects applied to the membership when the invite is accepted. Empty means the new member sees the whole circle.';

-- ---------------------------------------------------------------------------
-- Visibility. Security definer so policies can call these without recursing
-- through RLS on projects or tasks.
-- ---------------------------------------------------------------------------

create or replace function public.sees_full_circle(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_space_role(p_space_id) in ('owner', 'admin')
    or (
      public.is_space_member(p_space_id)
      and not exists (
        select 1
        from public.project_members pm
        join public.projects p on p.id = pm.project_id
        where pm.user_id = (select auth.uid())
          and p.space_id = p_space_id
      )
    );
$$;

-- Takes the row's own id and circle so INSERT ... RETURNING does not have to
-- read projects again. A security-definer lookup by id cannot see the row
-- that is still being inserted, and the insert would be rejected.
create or replace function public.can_see_project_row(p_project_id uuid, p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.sees_full_circle(p_space_id)
    or exists (
      select 1
      from public.project_members pm
      where pm.project_id = p_project_id
        and pm.user_id = (select auth.uid())
    );
$$;

create or replace function public.can_see_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and public.can_see_project_row(p.id, p.space_id)
  );
$$;

create or replace function public.can_see_task(p_space_id uuid, p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.sees_full_circle(p_space_id)
    or (
      p_project_id is not null
      and exists (
        select 1
        from public.projects p
        join public.project_members pm on pm.project_id = p.id
        where p.id = p_project_id
          and p.space_id = p_space_id
          and pm.user_id = (select auth.uid())
      )
    );
$$;

create or replace function public.task_project_allowed(p_space_id uuid, p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_project_id is null then public.sees_full_circle(p_space_id)
    else exists (
      select 1
      from public.projects p
      where p.id = p_project_id
        and p.space_id = p_space_id
        and (
          public.sees_full_circle(p.space_id)
          or exists (
            select 1
            from public.project_members pm
            where pm.project_id = p.id
              and pm.user_id = (select auth.uid())
          )
        )
    )
  end;
$$;

revoke all on function public.sees_full_circle(uuid) from public, anon;
revoke all on function public.can_see_project_row(uuid, uuid) from public, anon;
revoke all on function public.can_see_project(uuid) from public, anon;
revoke all on function public.can_see_task(uuid, uuid) from public, anon;
revoke all on function public.task_project_allowed(uuid, uuid) from public, anon;
grant execute on function public.sees_full_circle(uuid) to authenticated;
grant execute on function public.can_see_project_row(uuid, uuid) to authenticated;
grant execute on function public.can_see_project(uuid) to authenticated;
grant execute on function public.can_see_task(uuid, uuid) to authenticated;
grant execute on function public.task_project_allowed(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Keep a project in its circle, trim its name, and give a restricted creator
-- a row so they can see the project they just made. A member who sees the
-- whole circle must not gain a row here: that would hide the rest of the circle.
-- ---------------------------------------------------------------------------

create or replace function public.projects_prepare()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.space_id is distinct from old.space_id then
    raise exception 'A project stays in its circle';
  end if;

  new.name := btrim(coalesce(new.name, ''));
  if char_length(new.name) < 1 or char_length(new.name) > 80 then
    raise exception 'Project name must be 1 to 80 characters';
  end if;

  if new.description is not null then
    new.description := nullif(btrim(new.description), '');
  end if;

  if new.color is null or btrim(new.color) = '' then
    new.color := 'sage';
  end if;

  if tg_op = 'INSERT' and new.created_by is null then
    new.created_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists projects_prepare on public.projects;
create trigger projects_prepare
  before insert or update on public.projects
  for each row execute function public.projects_prepare();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create or replace function public.projects_track_restricted_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and public.is_space_member(new.space_id)
     and not public.sees_full_circle(new.space_id) then
    insert into public.project_members (project_id, user_id)
    values (new.id, auth.uid())
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_track_restricted_creator on public.projects;
create trigger projects_track_restricted_creator
  after insert on public.projects
  for each row execute function public.projects_track_restricted_creator();

create or replace function public.tasks_project_same_circle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.project_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.projects p
    where p.id = new.project_id
      and p.space_id = new.space_id
  ) then
    raise exception 'That project is not in this circle';
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_project_same_circle on public.tasks;
create trigger tasks_project_same_circle
  before insert or update of project_id, space_id on public.tasks
  for each row execute function public.tasks_project_same_circle();

create or replace function public.clear_project_members_on_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.project_members pm
  using public.projects p
  where pm.project_id = p.id
    and pm.user_id = old.user_id
    and p.space_id = old.space_id;
  return old;
end;
$$;

drop trigger if exists space_members_clear_project_members on public.space_members;
create trigger space_members_clear_project_members
  after delete on public.space_members
  for each row execute function public.clear_project_members_on_leave();

revoke all on function public.projects_prepare() from public, anon, authenticated;
revoke all on function public.projects_track_restricted_creator() from public, anon, authenticated;
revoke all on function public.tasks_project_same_circle() from public, anon, authenticated;
revoke all on function public.clear_project_members_on_leave() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Replace a member's project allow-list in one circle. An empty list restores
-- the whole circle. Only an owner or admin. The target must already be a member.
-- ---------------------------------------------------------------------------

create or replace function public.set_member_projects(
  p_space_id uuid,
  p_user_id uuid,
  p_project_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if public.current_space_role(p_space_id) not in ('owner', 'admin') then
    raise exception 'Only an owner or admin can change project access';
  end if;

  if not exists (
    select 1
    from public.space_members m
    where m.space_id = p_space_id
      and m.user_id = p_user_id
  ) then
    raise exception 'That person is not a member of this circle';
  end if;

  select coalesce(array_agg(distinct id), array[]::uuid[])
  into v_ids
  from unnest(coalesce(p_project_ids, array[]::uuid[])) as ids(id)
  where id is not null;

  if exists (
    select 1
    from unnest(v_ids) as ids(id)
    where not exists (
      select 1
      from public.projects p
      where p.id = ids.id
        and p.space_id = p_space_id
    )
  ) then
    raise exception 'That project is not in this circle';
  end if;

  delete from public.project_members pm
  using public.projects p
  where pm.project_id = p.id
    and pm.user_id = p_user_id
    and p.space_id = p_space_id
    and not (pm.project_id = any(v_ids));

  insert into public.project_members (project_id, user_id)
  select id, p_user_id
  from unnest(v_ids) as ids(id)
  on conflict do nothing;
end;
$$;

revoke all on function public.set_member_projects(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.set_member_projects(uuid, uuid, uuid[]) to authenticated;

comment on function public.set_member_projects(uuid, uuid, uuid[]) is
  'Replace one member''s project allow-list in a circle. An empty list lets them see the whole circle. Owners and admins only.';

-- ---------------------------------------------------------------------------
-- Accepting an invite copies its project list onto the membership.
-- ---------------------------------------------------------------------------

create or replace function public.apply_invite_projects(p_invite_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_members (project_id, user_id)
  select ip.project_id, p_user_id
  from public.invite_projects ip
  join public.projects p on p.id = ip.project_id
  join public.invites i on i.id = ip.invite_id
  where ip.invite_id = p_invite_id
    and p.space_id = i.space_id
  on conflict do nothing;
end;
$$;

revoke all on function public.apply_invite_projects(uuid, uuid) from public, anon, authenticated;

create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites%rowtype;
  v_email text;
begin
  select * into v_invite from public.invites where token = p_token;
  if not found then
    raise exception 'Invite not found';
  end if;
  if v_invite.status <> 'pending' then
    raise exception 'This invite is no longer valid';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'This invite has expired';
  end if;

  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    raise exception 'Not authenticated';
  end if;
  if lower(v_email) <> lower(v_invite.email) then
    raise exception 'This invite was sent to a different email';
  end if;

  insert into public.space_members (space_id, user_id, role, is_agent)
  values (v_invite.space_id, auth.uid(), v_invite.role, v_invite.is_agent)
  on conflict (space_id, user_id) do nothing;

  perform public.apply_invite_projects(v_invite.id, auth.uid());

  update public.invites set status = 'accepted' where id = v_invite.id;
  return v_invite.space_id;
end;
$$;

revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;

create or replace function public.accept_pending_invites_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_invite record;
begin
  select email into v_email from auth.users where id = p_user_id;
  if v_email is null then
    return;
  end if;

  for v_invite in
    select *
    from public.invites
    where status = 'pending'
      and expires_at >= now()
      and lower(email) = lower(v_email)
    order by created_at
    for update skip locked
  loop
    insert into public.space_members (space_id, user_id, role, is_agent)
    values (v_invite.space_id, p_user_id, v_invite.role, v_invite.is_agent)
    on conflict (space_id, user_id) do nothing;

    perform public.apply_invite_projects(v_invite.id, p_user_id);

    update public.invites
    set status = 'accepted'
    where id = v_invite.id
      and status = 'pending';
  end loop;
end;
$$;

revoke all on function public.accept_pending_invites_for_user(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Bulk updates can set or clear the project. Runs as the caller, so a
-- restricted member cannot move actions onto a project they cannot see,
-- or off a project onto the open circle list.
-- Project is written before status so a repeating action's next occurrence
-- keeps the new project.
-- ---------------------------------------------------------------------------

drop function if exists public.bulk_update_tasks(uuid[], text, uuid[], boolean);

create or replace function public.bulk_update_tasks(
  p_task_ids uuid[],
  p_status text default null,
  p_assignee_ids uuid[] default null,
  p_set_assignee boolean default false,
  p_project_id uuid default null,
  p_set_project boolean default false
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_requested integer;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_status is not null and p_status not in ('todo', 'in_progress', 'done') then
    raise exception 'Status must be todo, in_progress, or done';
  end if;

  if p_status is null and not p_set_assignee and not p_set_project then
    raise exception 'Nothing to update';
  end if;

  select count(distinct id)
  into v_requested
  from unnest(coalesce(p_task_ids, array[]::uuid[])) as ids(id)
  where id is not null;

  if v_requested = 0 then
    raise exception 'Choose at least one task';
  end if;

  if v_requested > 200 then
    raise exception 'Choose 200 tasks or fewer';
  end if;

  if p_set_assignee and exists (
    select 1
    from unnest(coalesce(p_assignee_ids, array[]::uuid[])) as ids(user_id)
    cross join public.tasks t
    where ids.user_id is not null
      and t.id = any(p_task_ids)
      and not exists (
        select 1
        from public.space_members m
        where m.space_id = t.space_id
          and m.user_id = ids.user_id
      )
  ) then
    raise exception 'Those people are not in every circle these tasks belong to';
  end if;

  if p_set_project and p_project_id is not null and exists (
    select 1
    from public.tasks t
    where t.id = any(p_task_ids)
      and not exists (
        select 1
        from public.projects p
        where p.id = p_project_id
          and p.space_id = t.space_id
      )
  ) then
    raise exception 'That project is not in this circle';
  end if;

  update public.tasks
  set updated_at = updated_at
  where id = any(p_task_ids);

  get diagnostics v_count = row_count;

  if v_count <> v_requested then
    raise exception 'Some tasks could not be updated';
  end if;

  if p_set_assignee then
    delete from public.task_assignees
    where task_id = any(p_task_ids);

    insert into public.task_assignees (task_id, user_id, position)
    select t.id, picked.user_id, picked.position
    from public.tasks t
    cross join (
      select id as user_id, (min(ord) - 1)::integer as position
      from unnest(coalesce(p_assignee_ids, array[]::uuid[])) with ordinality as u(id, ord)
      where id is not null
      group by id
    ) picked
    where t.id = any(p_task_ids);
  end if;

  if p_set_project then
    update public.tasks
    set project_id = p_project_id
    where id = any(p_task_ids);
  end if;

  if p_status is not null then
    update public.tasks
    set status = p_status
    where id = any(p_task_ids);
  end if;

  return v_count;
end;
$$;

revoke all on function public.bulk_update_tasks(uuid[], text, uuid[], boolean, uuid, boolean) from public, anon;
grant execute on function public.bulk_update_tasks(uuid[], text, uuid[], boolean, uuid, boolean) to authenticated;

comment on function public.bulk_update_tasks(uuid[], text, uuid[], boolean, uuid, boolean) is
  'Replace assignees, set or clear the project, and/or set status for many tasks. Runs as the caller so RLS applies. Completing a repeating task still spawns the next occurrence.';

-- ---------------------------------------------------------------------------
-- Moving circles drops the project. A project cannot follow an action out
-- of its circle. The caller must already be able to see the action.
-- ---------------------------------------------------------------------------

create or replace function public.move_task(p_task_id uuid, p_target_space_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_task public.tasks%rowtype;
  v_source_role text;
  v_assignee_cleared boolean := false;
  v_removed integer := 0;
  v_tags_removed integer := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found';
  end if;

  if not public.can_see_task(v_task.space_id, v_task.project_id) then
    raise exception 'Task not found';
  end if;

  select role into v_source_role
  from public.space_members
  where space_id = v_task.space_id and user_id = v_uid;

  if v_source_role is null then
    raise exception 'Task not found';
  end if;

  if v_source_role not in ('owner', 'admin', 'member') then
    raise exception 'You cannot edit tasks in this circle';
  end if;

  if v_task.space_id = p_target_space_id then
    return jsonb_build_object(
      'task_id', v_task.id,
      'source_space_id', v_task.space_id,
      'target_space_id', p_target_space_id,
      'assignee_cleared', false,
      'already_there', true,
      'tags_removed', 0
    );
  end if;

  if not exists (select 1 from public.spaces where id = p_target_space_id) then
    raise exception 'Circle not found';
  end if;

  if not exists (
    select 1 from public.space_members
    where space_id = p_target_space_id and user_id = v_uid
  ) then
    raise exception 'Circle not found';
  end if;

  perform set_config('trove.move_task', 'on', true);
  begin
    update public.tasks
    set
      space_id = p_target_space_id,
      project_id = null,
      position = extract(epoch from clock_timestamp()) * 1000
    where id = v_task.id;
    perform set_config('trove.move_task', 'off', true);
  exception
    when others then
      perform set_config('trove.move_task', 'off', true);
      raise;
  end;

  with removed as (
    delete from public.task_assignees ta
    where ta.task_id = v_task.id
      and not exists (
        select 1
        from public.space_members m
        where m.space_id = p_target_space_id
          and m.user_id = ta.user_id
      )
    returning 1
  )
  select count(*)::integer into v_removed from removed;

  v_assignee_cleared := v_removed > 0;

  with removed_tags as (
    delete from public.task_labels tl
    using public.labels l
    where tl.task_id = v_task.id
      and tl.label_id = l.id
      and l.space_id is distinct from p_target_space_id
    returning 1
  )
  select count(*)::integer into v_tags_removed from removed_tags;

  return jsonb_build_object(
    'task_id', v_task.id,
    'source_space_id', v_task.space_id,
    'target_space_id', p_target_space_id,
    'assignee_cleared', v_assignee_cleared,
    'already_there', false,
    'tags_removed', v_tags_removed
  );
end;
$$;

revoke all on function public.move_task(uuid, uuid) from public, anon;
grant execute on function public.move_task(uuid, uuid) to authenticated;

-- The next occurrence stays in the same project.
create or replace function public.tasks_spawn_next_occurrence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anchor date;
  v_due date;
  v_new_id uuid;
begin
  if tg_op <> 'UPDATE' or new.status is distinct from 'done' or old.status = 'done' then
    return new;
  end if;
  if new.repeat_unit is null then
    return new;
  end if;

  v_anchor := coalesce(new.due_date, (timezone('utc', now()))::date);
  v_due := public.next_recurrence_date(
    v_anchor,
    new.repeat_unit,
    new.repeat_interval,
    new.repeat_weekday
  );

  perform set_config('trove.spawn_recurrence', 'on', true);
  begin
    v_new_id := null;
    insert into public.tasks (
      space_id,
      project_id,
      title,
      description,
      status,
      position,
      priority,
      due_date,
      created_by,
      repeat_unit,
      repeat_interval,
      repeat_weekday,
      recurrence_series_id,
      recurrence_source_id
    )
    values (
      new.space_id,
      new.project_id,
      new.title,
      new.description,
      'todo',
      extract(epoch from clock_timestamp()) * 1000,
      new.priority,
      v_due,
      new.created_by,
      new.repeat_unit,
      new.repeat_interval,
      new.repeat_weekday,
      coalesce(new.recurrence_series_id, new.id),
      new.id
    )
    on conflict (recurrence_source_id) do nothing
    returning id into v_new_id;

    if found then
      insert into public.task_assignees (task_id, user_id, position, created_at)
      select v_new_id, user_id, position, created_at
      from public.task_assignees
      where task_id = new.id;

      insert into public.task_labels (task_id, label_id)
      select v_new_id, label_id
      from public.task_labels
      where task_id = new.id;

      insert into public.task_attachments (task_id, space_id, path, media_type, created_by)
      select v_new_id, space_id, path, media_type, created_by
      from public.task_attachments
      where task_id = new.id;
    end if;

    perform set_config('trove.spawn_recurrence', 'off', true);
  exception
    when others then
      perform set_config('trove.spawn_recurrence', 'off', true);
      raise;
  end;

  return new;
end;
$$;

revoke all on function public.tasks_spawn_next_occurrence() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.invite_projects enable row level security;

drop policy if exists "members read projects" on public.projects;
create policy "members read projects"
  on public.projects
  for select
  to authenticated
  using (public.can_see_project_row(id, space_id));

drop policy if exists "writers insert projects" on public.projects;
create policy "writers insert projects"
  on public.projects
  for insert
  to authenticated
  with check (
    public.current_space_role(space_id) in ('owner', 'admin', 'member')
    and created_by = (select auth.uid())
  );

drop policy if exists "writers update projects" on public.projects;
create policy "writers update projects"
  on public.projects
  for update
  to authenticated
  using (
    public.current_space_role(space_id) in ('owner', 'admin', 'member')
    and public.can_see_project_row(id, space_id)
  )
  with check (
    public.current_space_role(space_id) in ('owner', 'admin', 'member')
    and public.can_see_project_row(id, space_id)
  );

drop policy if exists "admins delete projects" on public.projects;
create policy "admins delete projects"
  on public.projects
  for delete
  to authenticated
  using (
    public.current_space_role(space_id) in ('owner', 'admin')
  );

drop policy if exists "read project members" on public.project_members;
create policy "read project members"
  on public.project_members
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.projects p
      where p.id = project_id
        and public.current_space_role(p.space_id) in ('owner', 'admin')
    )
  );

drop policy if exists "admins insert project members" on public.project_members;
create policy "admins insert project members"
  on public.project_members
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.projects p
      join public.space_members m
        on m.space_id = p.space_id
       and m.user_id = project_members.user_id
      where p.id = project_id
        and public.current_space_role(p.space_id) in ('owner', 'admin')
    )
  );

drop policy if exists "admins delete project members" on public.project_members;
create policy "admins delete project members"
  on public.project_members
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.projects p
      where p.id = project_id
        and public.current_space_role(p.space_id) in ('owner', 'admin')
    )
  );

drop policy if exists "admins read invite projects" on public.invite_projects;
create policy "admins read invite projects"
  on public.invite_projects
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.invites i
      where i.id = invite_id
        and public.current_space_role(i.space_id) in ('owner', 'admin')
    )
  );

drop policy if exists "admins insert invite projects" on public.invite_projects;
create policy "admins insert invite projects"
  on public.invite_projects
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.invites i
      join public.projects p on p.id = project_id
      where i.id = invite_id
        and p.space_id = i.space_id
        and public.current_space_role(i.space_id) in ('owner', 'admin')
    )
  );

drop policy if exists "admins delete invite projects" on public.invite_projects;
create policy "admins delete invite projects"
  on public.invite_projects
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.invites i
      where i.id = invite_id
        and public.current_space_role(i.space_id) in ('owner', 'admin')
    )
  );

drop policy if exists "members read tasks" on public.tasks;
create policy "members read tasks"
  on public.tasks
  for select
  to authenticated
  using (public.can_see_task(space_id, project_id));

drop policy if exists "writers insert tasks" on public.tasks;
create policy "writers insert tasks"
  on public.tasks
  for insert
  to authenticated
  with check (
    public.current_space_role(space_id) in ('owner', 'admin', 'member')
    and public.task_project_allowed(space_id, project_id)
  );

drop policy if exists "writers update tasks" on public.tasks;
create policy "writers update tasks"
  on public.tasks
  for update
  to authenticated
  using (
    public.current_space_role(space_id) in ('owner', 'admin', 'member')
    and public.can_see_task(space_id, project_id)
  )
  with check (
    public.current_space_role(space_id) in ('owner', 'admin', 'member')
    and public.task_project_allowed(space_id, project_id)
  );

drop policy if exists "writers delete tasks" on public.tasks;
create policy "writers delete tasks"
  on public.tasks
  for delete
  to authenticated
  using (
    public.current_space_role(space_id) in ('owner', 'admin', 'member')
    and public.can_see_task(space_id, project_id)
  );

drop policy if exists "members read attachments" on public.task_attachments;
create policy "members read attachments"
  on public.task_attachments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tasks t
      where t.id = task_id
        and public.can_see_task(t.space_id, t.project_id)
    )
  );

drop policy if exists "writers add attachments" on public.task_attachments;
create policy "writers add attachments"
  on public.task_attachments
  for insert
  to authenticated
  with check (
    public.current_space_role(space_id) in ('owner', 'admin', 'member')
    and created_by = (select auth.uid())
    and exists (
      select 1
      from public.tasks t
      where t.id = task_id
        and t.space_id = task_attachments.space_id
        and public.can_see_task(t.space_id, t.project_id)
    )
  );

drop policy if exists "writers delete attachments" on public.task_attachments;
create policy "writers delete attachments"
  on public.task_attachments
  for delete
  to authenticated
  using (
    public.current_space_role(space_id) in ('owner', 'admin', 'member')
    and exists (
      select 1
      from public.tasks t
      where t.id = task_id
        and public.can_see_task(t.space_id, t.project_id)
    )
  );

drop policy if exists "members read task_assignees" on public.task_assignees;
create policy "members read task_assignees"
  on public.task_assignees
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tasks t
      where t.id = task_id
        and public.can_see_task(t.space_id, t.project_id)
    )
  );

drop policy if exists "writers insert task_assignees" on public.task_assignees;
create policy "writers insert task_assignees"
  on public.task_assignees
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.tasks t
      where t.id = task_id
        and public.current_space_role(t.space_id) in ('owner', 'admin', 'member')
        and public.can_see_task(t.space_id, t.project_id)
    )
    and exists (
      select 1
      from public.tasks t
      join public.space_members m
        on m.space_id = t.space_id
       and m.user_id = task_assignees.user_id
      where t.id = task_id
    )
  );

drop policy if exists "writers delete task_assignees" on public.task_assignees;
create policy "writers delete task_assignees"
  on public.task_assignees
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.tasks t
      where t.id = task_id
        and public.current_space_role(t.space_id) in ('owner', 'admin', 'member')
        and public.can_see_task(t.space_id, t.project_id)
    )
  );

drop policy if exists "members read task_handoffs" on public.task_handoffs;
create policy "members read task_handoffs"
  on public.task_handoffs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tasks t
      where t.id = task_id
        and public.can_see_task(t.space_id, t.project_id)
    )
  );

drop policy if exists "members read agent_log_entries" on public.agent_log_entries;
create policy "members read agent_log_entries"
  on public.agent_log_entries
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tasks t
      where t.id = task_id
        and public.can_see_task(t.space_id, t.project_id)
    )
  );

-- Task media paths are <space_id>/<task_id>/<file>. Reading the object
-- requires the action itself, not only the circle.
create or replace function public.safe_object_task_id(object_name text)
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  seg text;
begin
  seg := (storage.foldername(object_name))[2];
  if seg is null or seg = '' then
    return null;
  end if;
  return seg::uuid;
exception
  when others then
    return null;
end;
$$;

revoke all on function public.safe_object_task_id(text) from public, anon;
grant execute on function public.safe_object_task_id(text) to authenticated;

drop policy if exists "members read task-media" on storage.objects;
create policy "members read task-media"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'task-media'
    and exists (
      select 1
      from public.tasks t
      where t.id = public.safe_object_task_id(name)
        and t.space_id = public.safe_object_space_id(name)
        and public.can_see_task(t.space_id, t.project_id)
    )
  );

drop policy if exists "writers upload task-media" on storage.objects;
create policy "writers upload task-media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'task-media'
    and public.current_space_role(public.safe_object_space_id(name)) in ('owner', 'admin', 'member')
    and exists (
      select 1
      from public.tasks t
      where t.id = public.safe_object_task_id(name)
        and t.space_id = public.safe_object_space_id(name)
        and public.can_see_task(t.space_id, t.project_id)
    )
  );

drop policy if exists "writers delete task-media" on storage.objects;
create policy "writers delete task-media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'task-media'
    and public.current_space_role(public.safe_object_space_id(name)) in ('owner', 'admin', 'member')
    and exists (
      select 1
      from public.tasks t
      where t.id = public.safe_object_task_id(name)
        and public.can_see_task(t.space_id, t.project_id)
    )
  );

revoke all on table public.projects from public, anon;
grant select, insert, update, delete on table public.projects to authenticated;
grant all on table public.projects to service_role;

revoke all on table public.project_members from public, anon;
grant select, insert, delete on table public.project_members to authenticated;
grant all on table public.project_members to service_role;

revoke all on table public.invite_projects from public, anon;
grant select, insert, delete on table public.invite_projects to authenticated;
grant all on table public.invite_projects to service_role;
