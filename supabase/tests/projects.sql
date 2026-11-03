-- Project allow-list. Rolls back so the later RLS checks still see the seed.
-- Alex owns Garden crew. Sam is a member and, with no project rows, sees every action.

\set ON_ERROR_STOP on

begin;

set role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);

do $$
declare
  garden uuid := 'a4444444-4444-4444-8444-444444444444';
  alex uuid := 'a1111111-1111-4111-8111-111111111111';
  sam uuid := 'a2222222-2222-4222-8222-222222222222';
  greenhouse uuid;
  compost uuid;
  n int;
  task_id uuid;
begin
  insert into public.projects (space_id, name, color, description, created_by)
  values (garden, 'Greenhouse', 'moss', 'Glasshouse jobs', alex)
  returning id into greenhouse;

  insert into public.projects (space_id, name, created_by)
  values (garden, 'Compost', alex)
  returning id into compost;

  select id into task_id
  from public.tasks
  where space_id = garden
  order by created_at
  limit 1;

  update public.tasks set project_id = greenhouse where id = task_id;

  update public.tasks
  set project_id = compost
  where space_id = garden
    and id <> task_id
    and id = (
      select id from public.tasks
      where space_id = garden and id <> task_id
      order by created_at
      limit 1
    );

  perform public.set_member_projects(garden, sam, array[greenhouse]);
end $$;

select set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', false);

do $$
declare
  garden uuid := 'a4444444-4444-4444-8444-444444444444';
  n int;
  visible_projects int;
  created uuid;
begin
  if public.sees_full_circle(garden) then
    raise exception 'sam should be limited to the greenhouse project';
  end if;

  select count(*) into visible_projects from public.projects where space_id = garden;
  if visible_projects <> 1 then
    raise exception 'sam should see 1 project, saw %', visible_projects;
  end if;

  if (select name from public.projects where space_id = garden) <> 'Greenhouse' then
    raise exception 'sam saw the wrong project';
  end if;

  select count(*) into n from public.tasks where space_id = garden;
  if n <> 1 then
    raise exception 'sam should see only the greenhouse action, saw %', n;
  end if;

  if exists (
    select 1 from public.tasks where space_id = garden and project_id is null
  ) then
    raise exception 'sam should not see actions that are not in a project';
  end if;

  -- A limited member can create a project and still read the row back.
  insert into public.projects (space_id, name, created_by)
  values (garden, 'Sam project', auth.uid());

  select id into created
  from public.projects
  where space_id = garden and name = 'Sam project';

  if not exists (
    select 1 from public.project_members where project_id = created and user_id = auth.uid()
  ) then
    raise exception 'sam should be added to the project he created';
  end if;
end $$;

-- A limited member cannot file an action on the open circle list.
do $$
declare
  garden uuid := 'a4444444-4444-4444-8444-444444444444';
begin
  begin
    insert into public.tasks (space_id, title, status, created_by)
    values (garden, 'Should fail', 'todo', auth.uid());
    raise exception 'sam inserted an action with no project';
  exception
    when insufficient_privilege or check_violation or others then
      if sqlerrm = 'sam inserted an action with no project' then
        raise;
      end if;
  end;
end $$;

-- Clearing the allow-list restores the whole circle.
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);

do $$
declare
  garden uuid := 'a4444444-4444-4444-8444-444444444444';
  sam uuid := 'a2222222-2222-4222-8222-222222222222';
  greenhouse uuid;
  n int;
begin
  select id into greenhouse from public.projects where space_id = garden and name = 'Greenhouse';

  perform public.bulk_update_tasks(
    array(select id from public.tasks where space_id = garden and project_id is null),
    null,
    null,
    false,
    greenhouse,
    true
  );

  perform public.set_member_projects(garden, sam, array[]::uuid[]);
end $$;

select set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', false);

do $$
declare
  garden uuid := 'a4444444-4444-4444-8444-444444444444';
  n int;
begin
  if not public.sees_full_circle(garden) then
    raise exception 'sam should see the whole circle again';
  end if;

  select count(*) into n from public.tasks where space_id = garden;
  if n <> 5 then
    raise exception 'sam should see all 5 garden actions again, saw %', n;
  end if;

  select count(*) into n from public.projects where space_id = garden;
  if n <> 3 then
    raise exception 'sam should see every project again, saw %', n;
  end if;
end $$;

-- An invite's project list is applied on accept, including for someone
-- who is already a member. Alex owns the circle. Sam accepts.
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);

do $$
declare
  garden uuid := 'a4444444-4444-4444-8444-444444444444';
  compost uuid;
  v_invite uuid;
  v_token text;
begin
  select id into compost from public.projects where space_id = garden and name = 'Compost';

  insert into public.invites (space_id, email, role, invited_by)
  values (garden, 'sam@trove.example', 'member', auth.uid())
  returning id, invites.token into v_invite, v_token;

  insert into public.invite_projects (invite_id, project_id)
  values (v_invite, compost);

  perform set_config('trove.invite_token', v_token, true);
end $$;

select set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', false);

do $$
declare
  garden uuid := 'a4444444-4444-4444-8444-444444444444';
  token text;
  n int;
begin
  select current_setting('trove.invite_token', true) into token;
  perform public.accept_invite(token);

  if public.sees_full_circle(garden) then
    raise exception 'accepting a project invite should limit sam';
  end if;

  select count(*) into n
  from public.projects
  where space_id = garden and name = 'Compost';
  if n <> 1 then
    raise exception 'sam should see the compost project from the invite';
  end if;

  select count(*) into n
  from public.projects
  where space_id = garden and name = 'Greenhouse';
  if n <> 0 then
    raise exception 'sam should not see greenhouse after the invite';
  end if;
end $$;

-- Owners still see every project and every action.
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);

do $$
declare
  garden uuid := 'a4444444-4444-4444-8444-444444444444';
  n int;
begin
  if not public.sees_full_circle(garden) then
    raise exception 'the owner should always see the whole circle';
  end if;

  select count(*) into n from public.tasks where space_id = garden;
  if n <> 5 then
    raise exception 'alex should still see 5 garden actions, saw %', n;
  end if;

  select count(*) into n from public.projects where space_id = garden;
  if n <> 3 then
    raise exception 'alex should still see every project, saw %', n;
  end if;
end $$;

rollback;
