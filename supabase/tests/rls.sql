-- Asserts the visibility model against the demo seed.
-- Run as a superuser who can SET ROLE to anon/authenticated (see bootstrap.sql).

\set ON_ERROR_STOP on

-- Alex: member of every demo group. Garden shows the whole list (5).
-- Mine is assignee = Alex: greenhouse, seedlings, programmes, boiler, spring menu = 5.
set role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);

do $$
declare
  n int;
  garden uuid := 'a4444444-4444-4444-8444-444444444444';
begin
  if auth.uid() <> 'a1111111-1111-4111-8111-111111111111' then
    raise exception 'auth.uid() did not follow the jwt setting';
  end if;

  select count(*) into n from public.tasks where space_id = garden;
  if n <> 5 then
    raise exception 'alex should see all 5 garden tasks, saw %', n;
  end if;

  select count(*) into n from public.tasks where assignee_id = auth.uid();
  if n <> 5 then
    raise exception 'alex mine view should be 5 assigned tasks, saw %', n;
  end if;

  -- The unassigned garden task is on the group board, not on anyone's Mine list.
  select count(*) into n
  from public.tasks
  where id = 'b3333333-3333-4333-8333-333333333333';
  if n <> 1 then
    raise exception 'unassigned garden task should stay visible on the group board';
  end if;
end $$;

-- Sam joined Garden and Choir, so Sam gets a Mine view of Sam's own assignments
-- and cannot see Alex's Personal space.
select set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', false);

do $$
declare
  n int;
  garden uuid := 'a4444444-4444-4444-8444-444444444444';
  choir uuid := 'a5555555-5555-4555-8555-555555555555';
begin
  select count(*) into n from public.tasks where space_id = garden;
  if n <> 5 then
    raise exception 'sam should see the whole garden list, saw %', n;
  end if;

  select count(*) into n from public.tasks where space_id = choir;
  if n <> 2 then
    raise exception 'sam should see the whole choir list, saw %', n;
  end if;

  select count(*) into n from public.tasks where assignee_id = auth.uid();
  if n <> 3 then
    raise exception 'sam mine view should be 3 (compost, soloist, call mum), saw %', n;
  end if;

  select count(*) into n
  from public.tasks t
  join public.spaces s on s.id = t.space_id
  where s.is_default and s.owner_id <> auth.uid();
  if n <> 0 then
    raise exception 'sam can see another person''s personal space (% rows)', n;
  end if;

  select count(*) into n from public.spaces where id = 'a6666666-6666-4666-8666-666666666666';
  if n <> 0 then
    raise exception 'sam should not see the household space';
  end if;
end $$;

-- Priya is only in Garden, so Choir is invisible, and Priya's Mine is the gate.
select set_config('request.jwt.claim.sub', 'a3333333-3333-4333-8333-333333333333', false);

do $$
declare
  n int;
begin
  select count(*) into n from public.tasks where space_id = 'a5555555-5555-4555-8555-555555555555';
  if n <> 0 then
    raise exception 'priya should not see choir tasks';
  end if;

  select count(*) into n from public.tasks where assignee_id = auth.uid();
  if n <> 1 then
    raise exception 'priya mine view should be the gate latch, saw %', n;
  end if;
end $$;

-- The owner cannot be removed or duplicated through the API, even by an owner.
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);

do $$
declare
  n int;
begin
  delete from public.space_members
  where space_id = 'a4444444-4444-4444-8444-444444444444'
    and user_id = 'a1111111-1111-4111-8111-111111111111';

  select count(*) into n
  from public.space_members
  where space_id = 'a4444444-4444-4444-8444-444444444444'
    and user_id = 'a1111111-1111-4111-8111-111111111111'
    and role = 'owner';
  if n <> 1 then
    raise exception 'garden owner membership was removed';
  end if;

  begin
    update public.space_members
    set role = 'owner'
    where space_id = 'a4444444-4444-4444-8444-444444444444'
      and user_id = 'a2222222-2222-4222-8222-222222222222';
    raise exception 'promoting another member to owner should be rejected';
  exception
    when insufficient_privilege then
      null;
  end;

  select count(*) into n
  from public.space_members
  where space_id = 'a4444444-4444-4444-8444-444444444444'
    and role = 'owner';
  if n <> 1 then
    raise exception 'a second owner was created through the API';
  end if;
end $$;

reset role;

-- Invites: only the invited email can join, and a stranger cannot read the token.
insert into public.invites (space_id, email, role, invited_by, token, status)
values (
  'a6666666-6666-4666-8666-666666666666',
  'quinn@trove.example',
  'member',
  'a1111111-1111-4111-8111-111111111111',
  'seeded-invite-token',
  'pending'
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  'a9999999-9999-4999-8999-999999999999',
  'quinn@trove.example',
  '{"display_name":"Quinn Adeyemi"}'::jsonb
);

set role authenticated;
select set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', false);

do $$
begin
  begin
    perform public.accept_invite('seeded-invite-token');
    raise exception 'sam accepted an invite addressed to quinn';
  exception when others then
    if sqlerrm not ilike '%different email%' and sqlerrm not ilike '%sam accepted%' then
      raise exception 'unexpected invite error: %', sqlerrm;
    end if;
    if sqlerrm ilike '%sam accepted%' then
      raise exception '%', sqlerrm;
    end if;
  end;
end $$;

select set_config('request.jwt.claim.sub', 'a9999999-9999-4999-8999-999999999999', false);

do $$
declare
  joined uuid;
  n int;
begin
  select count(*) into n from public.spaces where id = 'a6666666-6666-4666-8666-666666666666';
  if n <> 0 then
    raise exception 'quinn could see household before accepting the invite';
  end if;

  joined := public.accept_invite('seeded-invite-token');
  if joined <> 'a6666666-6666-4666-8666-666666666666' then
    raise exception 'accept_invite returned %', joined;
  end if;

  select count(*) into n from public.tasks where space_id = joined;
  if n <> 1 then
    raise exception 'quinn should see the household list after joining, saw %', n;
  end if;

  select count(*) into n from public.tasks where assignee_id = auth.uid();
  if n <> 0 then
    raise exception 'quinn mine view should be empty until something is assigned, saw %', n;
  end if;
end $$;

reset role;

-- Moving a task, and personal access tokens. Direct updates of tasks.space_id
-- are rejected for every role unless move_task has set the transaction-local
-- flag. Restore the compost task before the account-deletion section below.

do $$
begin
  begin
    update public.tasks
    set space_id = 'a6666666-6666-4666-8666-666666666666'
    where id = 'b2222222-2222-4222-8222-222222222222';
    raise exception 'direct space_id update was allowed';
  exception when others then
    if sqlerrm ilike '%direct space_id update was allowed%' then
      raise exception '%', sqlerrm;
    end if;
    if sqlerrm not like '%Use move_task%' then
      raise exception 'unexpected move guard: %', sqlerrm;
    end if;
  end;
end $$;

insert into public.labels (id, space_id, name, color)
values (
  'c1111111-1111-4111-8111-111111111111',
  'a4444444-4444-4444-8444-444444444444',
  'compost-bin',
  'sage'
);

insert into public.task_labels (task_id, label_id)
values (
  'b2222222-2222-4222-8222-222222222222',
  'c1111111-1111-4111-8111-111111111111'
);

set role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);

do $$
declare
  result jsonb;
begin
  result := public.move_task(
    'b2222222-2222-4222-8222-222222222222',
    'a4444444-4444-4444-8444-444444444444'
  );
  if coalesce((result->>'already_there')::boolean, false) is not true then
    raise exception 'same-circle move should be a no-op, got %', result;
  end if;

  -- Compost is assigned to Sam, who is not in Household.
  result := public.move_task(
    'b2222222-2222-4222-8222-222222222222',
    'a6666666-6666-4666-8666-666666666666'
  );
  if coalesce((result->>'assignee_cleared')::boolean, false) is not true then
    raise exception 'assignee should be cleared, got %', result;
  end if;
  if coalesce((result->>'tags_removed')::int, -1) <> 1 then
    raise exception 'garden tag should be detached, got %', result;
  end if;
  if coalesce((result->>'already_there')::boolean, true) then
    raise exception 'move reported already_there, got %', result;
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'a3333333-3333-4333-8333-333333333333', false);

do $$
begin
  begin
    perform public.move_task(
      'b8888888-8888-4888-8888-888888888888',
      'a4444444-4444-4444-8444-444444444444'
    );
    raise exception 'priya moved a household task';
  exception when others then
    if sqlerrm ilike '%priya moved%' then
      raise exception '%', sqlerrm;
    end if;
    if sqlerrm not ilike '%Task not found%' then
      raise exception 'unexpected hidden-task error: %', sqlerrm;
    end if;
  end;

  begin
    perform public.move_task(
      'b3333333-3333-4333-8333-333333333333',
      'a5555555-5555-4555-8555-555555555555'
    );
    raise exception 'priya moved a task into choir';
  exception when others then
    if sqlerrm ilike '%priya moved%' then
      raise exception '%', sqlerrm;
    end if;
    if sqlerrm not ilike '%Circle not found%' then
      raise exception 'unexpected destination error: %', sqlerrm;
    end if;
  end;
end $$;

reset role;

update public.space_members
set role = 'viewer'
where space_id = 'a4444444-4444-4444-8444-444444444444'
  and user_id = 'a3333333-3333-4333-8333-333333333333';

set role authenticated;
select set_config('request.jwt.claim.sub', 'a3333333-3333-4333-8333-333333333333', false);

do $$
begin
  perform public.move_task(
    'b1111111-1111-4111-8111-111111111111',
    'a4444444-4444-4444-8444-444444444444'
  );
  raise exception 'viewer moved a garden task';
exception when others then
  if sqlerrm ilike '%viewer moved%' then
    raise exception '%', sqlerrm;
  end if;
  if sqlerrm not ilike '%cannot edit%' then
    raise exception 'unexpected viewer error: %', sqlerrm;
  end if;
end $$;

reset role;

update public.space_members
set role = 'member'
where space_id = 'a4444444-4444-4444-8444-444444444444'
  and user_id = 'a3333333-3333-4333-8333-333333333333';

set role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);

select public.move_task(
  'b2222222-2222-4222-8222-222222222222',
  'a4444444-4444-4444-8444-444444444444'
);

reset role;

update public.tasks
set
  assignee_id = 'a2222222-2222-4222-8222-222222222222',
  position = 2
where id = 'b2222222-2222-4222-8222-222222222222';

insert into public.task_labels (task_id, label_id)
values (
  'b2222222-2222-4222-8222-222222222222',
  'c1111111-1111-4111-8111-111111111111'
);

delete from public.labels where id = 'c1111111-1111-4111-8111-111111111111';

do $$
declare
  n int;
  space uuid;
  assignee uuid;
begin
  select space_id, assignee_id into space, assignee
  from public.tasks
  where id = 'b2222222-2222-4222-8222-222222222222';
  if space <> 'a4444444-4444-4444-8444-444444444444' or assignee <> 'a2222222-2222-4222-8222-222222222222' then
    raise exception 'compost task was not restored (space %, assignee %)', space, assignee;
  end if;

  select count(*) into n from public.task_labels
  where task_id = 'b2222222-2222-4222-8222-222222222222';
  if n <> 0 then
    raise exception 'test label was left attached';
  end if;
end $$;

-- Open-task counts follow RLS. Alex sees every demo circle. Priya does not
-- see Choir. Garden has one done task, so four stay open.
set role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);

do $$
declare
  n bigint;
begin
  select open_count into n from public.open_task_counts()
  where space_id = 'a4444444-4444-4444-8444-444444444444';
  if n is distinct from 4 then
    raise exception 'alex garden open count is %, expected 4', n;
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'a3333333-3333-4333-8333-333333333333', false);

do $$
declare
  n int;
begin
  select count(*) into n from public.open_task_counts()
  where space_id = 'a5555555-5555-4555-8555-555555555555';
  if n <> 0 then
    raise exception 'priya can see choir open tasks';
  end if;
end $$;

-- API tokens: a person sees only their own, cannot un-revoke, and cannot
-- rewrite the hash. last_used_at is service_role, postgres, or the table owner.
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);

insert into public.api_tokens (user_id, name, token_hash, token_prefix)
values (
  'a2222222-2222-4222-8222-222222222222',
  'claude',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'trove_aaaaaa'
);

do $$
declare
  owner uuid;
  n int;
begin
  select user_id into owner from public.api_tokens
  where token_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  if owner <> 'a1111111-1111-4111-8111-111111111111' then
    raise exception 'insert guard did not force user_id, saw %', owner;
  end if;

  select count(*) into n from public.api_tokens where last_used_at is not null or revoked_at is not null;
  if n <> 0 then
    raise exception 'a new token should have null last_used_at and revoked_at';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', false);

do $$
declare
  n int;
begin
  select count(*) into n from public.api_tokens
  where token_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  if n <> 0 then
    raise exception 'sam could read alex''s api token';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);

update public.api_tokens
set revoked_at = now()
where token_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

do $$
begin
  update public.api_tokens
  set revoked_at = null
  where token_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  raise exception 'revoked token was restored';
exception when others then
  if sqlerrm ilike '%restored%' and sqlerrm not ilike '%cannot be restored%' then
    raise exception '%', sqlerrm;
  end if;
  if sqlerrm not ilike '%cannot be restored%' then
    raise exception 'unexpected un-revoke error: %', sqlerrm;
  end if;
end $$;

do $$
begin
  update public.api_tokens
  set token_hash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  where token_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  raise exception 'token hash was rewritten';
exception when others then
  if sqlerrm ilike '%rewritten%' then
    raise exception '%', sqlerrm;
  end if;
  if sqlerrm not ilike '%immutable%' then
    raise exception 'unexpected hash error: %', sqlerrm;
  end if;
end $$;

do $$
begin
  update public.api_tokens
  set last_used_at = now()
  where token_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  raise exception 'authenticated set last_used_at';
exception when others then
  if sqlerrm ilike '%authenticated set%' then
    raise exception '%', sqlerrm;
  end if;
  if sqlerrm not ilike '%last_used_at%' then
    raise exception 'unexpected last_used error: %', sqlerrm;
  end if;
end $$;

set role service_role;

update public.api_tokens
set last_used_at = now()
where token_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

do $$
declare
  n int;
begin
  select count(*) into n from public.api_tokens
  where token_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    and last_used_at is not null;
  if n <> 1 then
    raise exception 'service_role could not stamp last_used_at';
  end if;
end $$;

reset role;

update public.api_tokens
set last_used_at = now()
where token_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

-- Ten active tokens are allowed. The eleventh is rejected. The revoked token
-- above does not count.
set role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);

do $$
declare
  i int;
begin
  for i in 1..10 loop
    insert into public.api_tokens (user_id, name, token_hash, token_prefix)
    values (
      auth.uid(),
      'limit-' || i,
      encode(sha256(convert_to('limit-' || i::text, 'UTF8')), 'hex'),
      'trove_' || lpad(i::text, 6, '0')
    );
  end loop;
end $$;

do $$
begin
  insert into public.api_tokens (user_id, name, token_hash, token_prefix)
  values (
    auth.uid(),
    'limit-overflow',
    encode(sha256(convert_to('limit-overflow', 'UTF8')), 'hex'),
    'trove_overfl'
  );
  raise exception 'eleventh active token was allowed';
exception when others then
  if sqlerrm ilike '%eleventh active%' then
    raise exception '%', sqlerrm;
  end if;
  if sqlerrm not ilike '%10 active%' then
    raise exception 'unexpected token limit error: %', sqlerrm;
  end if;
end $$;

reset role;

delete from public.api_tokens
where name like 'limit-%'
   or token_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

-- storage.protect_delete fires for a delete that matches nothing. The account
-- function must not take that path; file removal is the delete-account edge
-- function (verify_jwt on) via the Storage API.
do $$
begin
  delete from storage.objects where bucket_id = 'does-not-exist';
  raise exception 'direct storage delete was allowed';
exception
  when insufficient_privilege then
    if sqlerrm not like '%Storage API%' then
      raise exception 'unexpected storage error: %', sqlerrm;
    end if;
end $$;

-- The signed-in role cannot run the deletion function. The edge function
-- calls it with the service role.
set role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);

do $$
begin
  perform public.delete_account_data('a1111111-1111-4111-8111-111111111111');
  raise exception 'authenticated was able to run delete_account_data';
exception
  when insufficient_privilege then
    null;
end $$;

reset role;

-- Account deletion transfers a group that has other members. It must succeed
-- while storage.protect_delete is in place, and it must leave the auth user
-- for auth.admin.deleteUser.
set role service_role;
select public.delete_account_data('a1111111-1111-4111-8111-111111111111');
reset role;

do $$
declare
  n int;
begin
  select count(*) into n from auth.users where id = 'a1111111-1111-4111-8111-111111111111';
  if n <> 1 then
    raise exception 'delete_account_data removed auth.users; the edge function calls auth.admin.deleteUser';
  end if;
end $$;

-- Stand-in for auth.admin.deleteUser. Profile and personal space cascade.
delete from auth.users where id = 'a1111111-1111-4111-8111-111111111111';

set role authenticated;
select set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', false);

do $$
declare
  n int;
  owner uuid;
begin
  select owner_id into owner from public.spaces where id = 'a4444444-4444-4444-8444-444444444444';
  if owner is null then
    raise exception 'garden space disappeared; ownership should have transferred';
  end if;
  if owner = 'a1111111-1111-4111-8111-111111111111' then
    raise exception 'garden is still owned by the deleted account';
  end if;

  select count(*) into n from public.profiles where id = 'a1111111-1111-4111-8111-111111111111';
  if n <> 0 then
    raise exception 'deleted profile is still visible';
  end if;

  select count(*) into n from public.tasks where id = 'b9999999-9999-4999-8999-999999999999';
  if n <> 0 then
    raise exception 'personal task survived account deletion';
  end if;
end $$;

reset role;

do $$
declare
  n int;
begin
  select count(*) into n from auth.users where id = 'a1111111-1111-4111-8111-111111111111';
  if n <> 0 then
    raise exception 'auth user was not deleted';
  end if;

  select count(*) into n
  from public.space_members
  where space_id = 'a4444444-4444-4444-8444-444444444444'
    and role = 'owner'
    and user_id = 'a2222222-2222-4222-8222-222222222222';
  if n <> 1 then
    raise exception 'garden ownership did not pass to sam (the earliest member)';
  end if;
end $$;

-- Anonymous role cannot read the task table.
do $$
begin
  execute 'set local role anon';
  begin
    perform 1 from public.tasks;
    raise exception 'anon was able to read tasks';
  exception
    when insufficient_privilege then
      null;
  end;
end $$;

reset role;
