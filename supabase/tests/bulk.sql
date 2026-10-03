-- Bulk assign and complete. Runs after seed, inside a transaction that rolls
-- back, so the demo counts the RLS checks expect stay intact.
-- Alex owns Garden, Choir, and Household. Sam is in Garden and Choir.
-- Priya is in Garden only.

\set ON_ERROR_STOP on

begin;

set role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);

-- Completing a repeating task through the bulk update still spawns once.
do $$
declare
  garden uuid := 'a4444444-4444-4444-8444-444444444444';
  alex uuid := 'a1111111-1111-4111-8111-111111111111';
  parent uuid := 'd1111111-1111-4111-8111-111111111111';
  child public.tasks%rowtype;
  n int;
begin
  insert into public.tasks (
    id, space_id, title, description, status, position, created_by,
    due_date, repeat_unit, repeat_interval
  )
  values (
    parent, garden, 'Feed the starters', 'Morning and evening.',
    'todo', 20, alex, '2026-10-03', 'day', 1
  );

  n := public.bulk_update_tasks(array[parent], 'done', null, false);
  if n <> 1 then
    raise exception 'bulk complete returned %', n;
  end if;

  if (select status from public.tasks where id = parent) <> 'done' then
    raise exception 'bulk complete did not mark the task done';
  end if;

  select * into child from public.tasks where recurrence_source_id = parent;
  if child.id is null then
    raise exception 'bulk complete did not spawn the next occurrence';
  end if;
  if child.status <> 'todo' or child.due_date <> '2026-10-04' then
    raise exception 'successor is % on %', child.status, child.due_date;
  end if;
  if child.description <> 'Morning and evening.' or child.repeat_unit <> 'day' then
    raise exception 'successor did not keep the notes and rule';
  end if;

  n := public.bulk_update_tasks(array[parent, parent], 'done', null, false);
  if n <> 1 then
    raise exception 'duplicate ids should count once, got %', n;
  end if;
  select count(*) into n from public.tasks where recurrence_source_id = parent;
  if n <> 1 then
    raise exception 'completing again spawned % successors', n;
  end if;
end $$;

-- Assigning a repeating task does not mention status, so nothing spawns.
do $$
declare
  garden uuid := 'a4444444-4444-4444-8444-444444444444';
  alex uuid := 'a1111111-1111-4111-8111-111111111111';
  sam uuid := 'a2222222-2222-4222-8222-222222222222';
  parent uuid := 'd2222222-2222-4222-8222-222222222222';
  n int;
begin
  insert into public.tasks (
    id, space_id, title, status, position, created_by,
    due_date, repeat_unit, repeat_interval, assignee_id
  )
  values (
    parent, garden, 'Turn the beds', 'todo', 21, alex,
    '2026-10-03', 'week', 1, null
  );

  perform public.bulk_update_tasks(array[parent], null, sam, true);
  if (select assignee_id from public.tasks where id = parent) <> sam then
    raise exception 'bulk assign did not set the assignee';
  end if;
  if (select status from public.tasks where id = parent) <> 'todo' then
    raise exception 'assign changed the status';
  end if;
  select count(*) into n from public.tasks where recurrence_source_id = parent;
  if n <> 0 then
    raise exception 'assign spawned a successor';
  end if;

  perform public.bulk_update_tasks(array[parent], null, null, true);
  if (select assignee_id from public.tasks where id = parent) is not null then
    raise exception 'bulk unassign left an assignee';
  end if;
end $$;

-- Someone who is not in every circle is rejected, and nothing changes.
do $$
declare
  alex uuid := 'a1111111-1111-4111-8111-111111111111';
  priya uuid := 'a3333333-3333-4333-8333-333333333333';
  before_garden uuid;
  before_choir uuid;
begin
  select assignee_id into before_garden from public.tasks where id = 'b1111111-1111-4111-8111-111111111111';
  select assignee_id into before_choir from public.tasks where id = 'b6666666-6666-4666-8666-666666666666';
  if before_garden <> alex or before_choir <> alex then
    raise exception 'seed assignees moved before the cross-circle check';
  end if;

  begin
    perform public.bulk_update_tasks(
      array[
        'b1111111-1111-4111-8111-111111111111',
        'b6666666-6666-4666-8666-666666666666'
      ]::uuid[],
      null,
      priya,
      true
    );
    raise exception 'assigned across circles to someone who is not in both';
  exception
    when others then
      if sqlerrm ilike '%assigned across circles%' then
        raise;
      end if;
      if sqlerrm not ilike '%not in every circle%' then
        raise exception 'unexpected cross-circle error: %', sqlerrm;
      end if;
  end;

  if (select assignee_id from public.tasks where id = 'b1111111-1111-4111-8111-111111111111') <> before_garden
     or (select assignee_id from public.tasks where id = 'b6666666-6666-4666-8666-666666666666') <> before_choir then
    raise exception 'rejected assign still changed a task';
  end if;
end $$;

-- Sam is in Garden and Choir, so both tasks can move together.
do $$
declare
  sam uuid := 'a2222222-2222-4222-8222-222222222222';
  n int;
begin
  n := public.bulk_update_tasks(
    array[
      'b2222222-2222-4222-8222-222222222222',
      'b7777777-7777-4777-8777-777777777777'
    ]::uuid[],
    'in_progress',
    sam,
    true
  );
  if n <> 2 then
    raise exception 'shared-member assign returned %', n;
  end if;
  if exists (
    select 1 from public.tasks
    where id in (
      'b2222222-2222-4222-8222-222222222222',
      'b7777777-7777-4777-8777-777777777777'
    )
      and (assignee_id is distinct from sam or status is distinct from 'in_progress')
  ) then
    raise exception 'shared-member assign did not update both tasks';
  end if;
end $$;

-- A task Priya cannot see makes the whole batch fail, including the one she can.
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'a3333333-3333-4333-8333-333333333333', false);

do $$
begin
  begin
    perform public.bulk_update_tasks(
      array[
        'b3333333-3333-4333-8333-333333333333',
        'b6666666-6666-4666-8666-666666666666'
      ]::uuid[],
      'done',
      null,
      false
    );
    raise exception 'partial batch succeeded';
  exception
    when others then
      if sqlerrm ilike '%partial batch%' then
        raise;
      end if;
      if sqlerrm not ilike '%could not be updated%' then
        raise exception 'unexpected partial error: %', sqlerrm;
      end if;
  end;
end $$;

reset role;

do $$
begin
  if (select status from public.tasks where id = 'b3333333-3333-4333-8333-333333333333') <> 'todo' then
    raise exception 'failed batch still completed a visible task';
  end if;
  if (select status from public.tasks where id = 'b6666666-6666-4666-8666-666666666666') <> 'in_progress' then
    raise exception 'failed batch changed a task Priya cannot see';
  end if;
end $$;

-- A viewer cannot complete a task they can see.
update public.space_members set role = 'viewer'
where space_id = 'a4444444-4444-4444-8444-444444444444'
  and user_id = 'a3333333-3333-4333-8333-333333333333';

set role authenticated;
select set_config('request.jwt.claim.sub', 'a3333333-3333-4333-8333-333333333333', false);

do $$
begin
  begin
    perform public.bulk_update_tasks(
      array['b5555555-5555-4555-8555-555555555555']::uuid[],
      'done',
      null,
      false
    );
    raise exception 'viewer completed a task';
  exception
    when others then
      if sqlerrm ilike '%viewer completed%' then
        raise;
      end if;
      if sqlerrm not ilike '%could not be updated%' then
        raise exception 'unexpected viewer error: %', sqlerrm;
      end if;
  end;
end $$;

reset role;

do $$
begin
  if (select status from public.tasks where id = 'b5555555-5555-4555-8555-555555555555') <> 'in_progress' then
    raise exception 'viewer update changed the task';
  end if;
end $$;

update public.space_members set role = 'member'
where space_id = 'a4444444-4444-4444-8444-444444444444'
  and user_id = 'a3333333-3333-4333-8333-333333333333';

set role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);

-- Empty, invalid, and anonymous calls are refused.
do $$
begin
  begin
    perform public.bulk_update_tasks('{}'::uuid[], 'done', null, false);
    raise exception 'empty list was accepted';
  exception
    when others then
      if sqlerrm ilike '%empty list%' then raise; end if;
      if sqlerrm not ilike '%at least one task%' then
        raise exception 'unexpected empty error: %', sqlerrm;
      end if;
  end;

  begin
    perform public.bulk_update_tasks(
      array['b1111111-1111-4111-8111-111111111111']::uuid[],
      'archived',
      null,
      false
    );
    raise exception 'bad status was accepted';
  exception
    when others then
      if sqlerrm ilike '%bad status%' then raise; end if;
      if sqlerrm not ilike '%Status must be%' then
        raise exception 'unexpected status error: %', sqlerrm;
      end if;
  end;
end $$;

reset role;
set role anon;

do $$
begin
  perform public.bulk_update_tasks(
    array['b1111111-1111-4111-8111-111111111111']::uuid[],
    'done',
    null,
    false
  );
  raise exception 'anon called bulk_update_tasks';
exception
  when insufficient_privilege then
    null;
  when others then
    if sqlerrm ilike '%anon called%' then
      raise;
    end if;
    if sqlerrm not ilike '%permission denied%' then
      raise exception 'unexpected anon error: %', sqlerrm;
    end if;
end $$;

reset role;

rollback;
