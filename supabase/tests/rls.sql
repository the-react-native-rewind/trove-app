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

-- Account deletion transfers a group that has other members, and removes the user.
do $$
declare
  n int;
  owner uuid;
begin
  perform set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);
  -- delete_own_account is security definer; call it as the signed-in user.
  execute 'set local role authenticated';
  perform public.delete_own_account();
end $$;

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
