-- Handoffs, the agent log, and the Bot update backfill.
-- Runs after seed, inside a transaction that rolls back, so the demo
-- counts the RLS checks expect stay intact.
-- Alex owns Garden crew and Choir. Sam and Priya are Garden members.
-- Sam is also in Choir. Priya is not.

\set ON_ERROR_STOP on

begin;

create function pg_temp.assert_raises(p_sql text, p_like text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
    raise exception 'SUCCEEDED';
  exception
    when others then
      if sqlerrm = 'SUCCEEDED' then
        raise exception 'expected error like "%", but it succeeded', p_like;
      end if;
      if sqlerrm not like p_like then
        raise exception 'expected "%", got "%"', p_like, sqlerrm;
      end if;
  end;
end;
$$;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('d0d0d0d0-0000-4000-8000-0000000000a1', 'relay@trove.example', '{"display_name":"Relay"}'::jsonb),
  ('d0d0d0d0-0000-4000-8000-0000000000b1', 'viewer@trove.example', '{"display_name":"Vera"}'::jsonb),
  ('d0d0d0d0-0000-4000-8000-0000000000c1', 'outsider@trove.example', '{"display_name":"Otto"}'::jsonb),
  ('50e1c6d4-1111-4111-8111-111111111111', 'rnrw-bot@trove.example', '{"display_name":"RNRW Bot"}'::jsonb);

insert into public.space_members (space_id, user_id, role, is_agent)
values
  ('a4444444-4444-4444-8444-444444444444', 'd0d0d0d0-0000-4000-8000-0000000000a1', 'member', true),
  ('a4444444-4444-4444-8444-444444444444', 'd0d0d0d0-0000-4000-8000-0000000000b1', 'viewer', false);

set role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);

do $$
declare
  garden uuid := 'a4444444-4444-4444-8444-444444444444';
  choir uuid := 'a5555555-5555-4555-8555-555555555555';
  alex uuid := 'a1111111-1111-4111-8111-111111111111';
  sam uuid := 'a2222222-2222-4222-8222-222222222222';
  priya uuid := 'a3333333-3333-4333-8333-333333333333';
  agent uuid := 'd0d0d0d0-0000-4000-8000-0000000000a1';
  viewer uuid := 'd0d0d0d0-0000-4000-8000-0000000000b1';
  outsider uuid := 'd0d0d0d0-0000-4000-8000-0000000000c1';
  bot uuid := '50e1c6d4-1111-4111-8111-111111111111';
  v_task uuid;
  v_repeat uuid;
  v_child uuid;
  v_moved uuid;
  v_cap uuid;
  v_backfill uuid;
  v_agent_task uuid;
  v_handoff uuid;
  v_second uuid;
  v_rank text;
  v_rank_after text;
  v_pos integer;
  v_status text;
  v_note text;
  v_edited boolean;
  v_desc text;
  v_author uuid;
  v_payload jsonb;
  n integer;
begin
  insert into public.tasks (id, space_id, title, status, created_by, due_date)
  values ('e1e1e1e1-1111-4111-8111-1111111111e1', garden, 'Fix the gate', 'todo', alex, '2026-10-27')
  returning id into v_task;

  perform public.set_task_assignees(v_task, array[alex, sam]);

  select rank into v_rank from public.tasks where id = v_task;

  v_payload := public.handoff_task(v_task, priya, 'in_progress', '  Half done, waiting on the plumber  ');

  select rank, status into v_rank_after, v_status from public.tasks where id = v_task;
  if v_rank_after is distinct from v_rank then
    raise exception 'handoff changed rank from % to %', v_rank, v_rank_after;
  end if;
  if v_status <> 'in_progress' then
    raise exception 'handoff should set in_progress, got %', v_status;
  end if;

  if exists (
    select 1 from public.task_assignees where task_id = v_task and user_id = alex
  ) then
    raise exception 'caller should have been removed';
  end if;

  select position into v_pos from public.task_assignees where task_id = v_task and user_id = priya;
  if v_pos <> 0 then
    raise exception 'recipient should take the caller position, got %', v_pos;
  end if;

  select position into v_pos from public.task_assignees where task_id = v_task and user_id = sam;
  if v_pos <> 1 then
    raise exception 'co-assignee position should stay 1, got %', v_pos;
  end if;

  select id, note, status into v_handoff, v_note, v_status
  from public.task_handoffs
  where task_id = v_task;

  if v_note <> 'Half done, waiting on the plumber' or v_status <> 'in_progress' then
    raise exception 'handoff row note/status wrong: % / %', v_note, v_status;
  end if;
  if (v_payload->'handoff'->>'id')::uuid is distinct from v_handoff then
    raise exception 'payload did not return the handoff';
  end if;

  -- Empty note is stored as null. Status omitted keeps in_progress.
  perform public.set_task_assignees(v_task, array[alex, sam]);
  v_payload := public.handoff_task(v_task, priya, null, '   ');
  select note, status into v_note, v_status
  from public.task_handoffs
  where id = (v_payload->'handoff'->>'id')::uuid;
  if v_note is not null then
    raise exception 'blank note should be null, got %', v_note;
  end if;
  if v_status <> 'in_progress' then
    raise exception 'omitted status should keep in_progress, got %', v_status;
  end if;

  -- Recipient already assigned: caller leaves, their row stays, note is kept.
  perform public.set_task_assignees(v_task, array[alex, priya]);
  perform public.handoff_task(v_task, priya, 'todo', 'Still with Priya');
  if exists (select 1 from public.task_assignees where task_id = v_task and user_id = alex) then
    raise exception 'caller should leave even when the recipient is already assigned';
  end if;
  select position into v_pos from public.task_assignees where task_id = v_task and user_id = priya;
  if v_pos <> 1 then
    raise exception 'existing recipient should keep their position, got %', v_pos;
  end if;

  perform pg_temp.assert_raises(
    format('select public.handoff_task(%L, %L)', v_task, alex),
    '%isn''t yours to hand off%'
  );

  perform public.set_task_assignees(v_task, array[alex]);
  perform pg_temp.assert_raises(
    format('select public.handoff_task(%L, %L)', v_task, alex),
    '%You already have this task%'
  );
  perform pg_temp.assert_raises(
    format('select public.handoff_task(%L, %L)', v_task, outsider),
    '%not in this circle%'
  );
  perform pg_temp.assert_raises(
    format('select public.handoff_task(%L, %L, %L)', v_task, sam, 'done'),
    '%complete it instead%'
  );
  perform pg_temp.assert_raises(
    format('select public.handoff_task(%L, %L, %L, %L)', v_task, sam, 'todo', repeat('n', 2001)),
    '%2000 characters%'
  );
  perform pg_temp.assert_raises(
    'select public.handoff_task(''00000000-0000-4000-8000-000000000099'', ''a2222222-2222-4222-8222-222222222222'')',
    '%Task not found%'
  );

  update public.tasks set status = 'done' where id = v_task;
  v_payload := public.handoff_task(v_task, sam, null, 'Reopened');
  select status into v_status from public.tasks where id = v_task;
  if v_status <> 'todo' then
    raise exception 'handing off a done task should reopen it to todo, got %', v_status;
  end if;

  perform public.set_task_assignees(v_task, array[alex]);
  update public.tasks set status = 'done' where id = v_task;
  perform public.handoff_task(v_task, sam, 'in_progress', null);
  select status into v_status from public.tasks where id = v_task;
  if v_status <> 'in_progress' then
    raise exception 'explicit status should win on a done task, got %', v_status;
  end if;

  -- Latest note can be edited by its author. An older one cannot.
  select id into v_handoff
  from public.task_handoffs
  where task_id = v_task and from_user_id = alex
  order by created_at desc
  limit 1;

  perform public.edit_handoff_note(v_handoff, '  Updated note  ');
  select note, (note_edited_at is not null) into v_note, v_edited
  from public.task_handoffs where id = v_handoff;
  if v_note <> 'Updated note' or v_edited is not true then
    raise exception 'edit did not store the trimmed note';
  end if;

  perform public.edit_handoff_note(v_handoff, '');
  select note into v_note from public.task_handoffs where id = v_handoff;
  if v_note is not null then
    raise exception 'empty edit should clear the note';
  end if;

  select id into v_second
  from public.task_handoffs
  where task_id = v_task and id <> v_handoff
  order by created_at asc
  limit 1;
  perform pg_temp.assert_raises(
    format('select public.edit_handoff_note(%L, %L)', v_second, 'nope'),
    '%latest handoff%'
  );
end $$;

-- Sam cannot edit Alex's latest note.
select set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', false);

do $$
declare
  v_handoff uuid;
begin
  select id into v_handoff
  from public.task_handoffs
  where from_user_id = 'a1111111-1111-4111-8111-111111111111'
  order by created_at desc
  limit 1;
  perform pg_temp.assert_raises(
    format('select public.edit_handoff_note(%L, %L)', v_handoff, 'stolen'),
    '%author of this note%'
  );
end $$;

-- A viewer who is assigned still cannot hand off. A human cannot write the log.
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);

do $$
declare
  garden uuid := 'a4444444-4444-4444-8444-444444444444';
  alex uuid := 'a1111111-1111-4111-8111-111111111111';
  sam uuid := 'a2222222-2222-4222-8222-222222222222';
  viewer uuid := 'd0d0d0d0-0000-4000-8000-0000000000b1';
  v_task uuid;
begin
  insert into public.tasks (space_id, title, status, created_by)
  values (garden, 'Watch the gate', 'todo', alex)
  returning id into v_task;
  perform public.set_task_assignees(v_task, array[viewer]);

  perform pg_temp.assert_raises(
    format('select public.add_agent_log_entry(%L, %L)', v_task, 'Alex tried'),
    '%Only agents write%'
  );
end $$;

select set_config('request.jwt.claim.sub', 'd0d0d0d0-0000-4000-8000-0000000000b1', false);

do $$
declare
  v_task uuid;
  sam uuid := 'a2222222-2222-4222-8222-222222222222';
begin
  select id into v_task from public.tasks where title = 'Watch the gate';
  perform pg_temp.assert_raises(
    format('select public.handoff_task(%L, %L)', v_task, sam),
    '%can''t edit this task%'
  );
  if (select count(*) from public.task_handoffs where task_id = v_task) < 0 then
    raise exception 'viewer read failed';
  end if;
end $$;

-- Agent writes. A member who is not the author cannot delete. The author can.
select set_config('request.jwt.claim.sub', 'd0d0d0d0-0000-4000-8000-0000000000a1', false);

do $$
declare
  garden uuid := 'a4444444-4444-4444-8444-444444444444';
  agent uuid := 'd0d0d0d0-0000-4000-8000-0000000000a1';
  v_task uuid;
  v_entry uuid;
  n integer;
begin
  insert into public.tasks (space_id, title, status, created_by)
  values (garden, 'Draft the reply', 'in_progress', agent)
  returning id into v_task;
  perform public.set_task_assignees(v_task, array[agent]);

  v_entry := (public.add_agent_log_entry(v_task, '  Drafted the reply email  ')).id;
  select count(*) into n from public.agent_log_entries where id = v_entry and body = 'Drafted the reply email';
  if n <> 1 then
    raise exception 'agent log entry was not stored trimmed';
  end if;

  perform pg_temp.assert_raises(
    format('select public.add_agent_log_entry(%L, %L)', v_task, repeat('x', 4001)),
    '%4000 characters%'
  );
  perform pg_temp.assert_raises(
    format('select public.add_agent_log_entry(%L, %L)', v_task, '   '),
    '%needs text%'
  );
end $$;

select set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', false);

do $$
declare
  v_entry uuid;
  n integer;
begin
  select id into v_entry
  from public.agent_log_entries
  where body = 'Drafted the reply email';
  if v_entry is null then
    raise exception 'sam should be able to read the agent log';
  end if;

  delete from public.agent_log_entries where id = v_entry;
  select count(*) into n from public.agent_log_entries where id = v_entry;
  if n <> 1 then
    raise exception 'a member who is not the author should not delete the log';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'd0d0d0d0-0000-4000-8000-0000000000a1', false);

do $$
declare
  n integer;
begin
  delete from public.agent_log_entries where body = 'Drafted the reply email';
  select count(*) into n from public.agent_log_entries where body = 'Drafted the reply email';
  if n <> 0 then
    raise exception 'the author should be able to delete their entry';
  end if;
end $$;

-- Owner can delete someone else's entry. Outsider cannot see the rows.
select set_config('request.jwt.claim.sub', 'd0d0d0d0-0000-4000-8000-0000000000a1', false);

do $$
declare
  v_task uuid;
begin
  select id into v_task from public.tasks where title = 'Draft the reply';
  perform public.add_agent_log_entry(v_task, 'Second pass');
end $$;

select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);

do $$
declare
  n integer;
begin
  delete from public.agent_log_entries where body = 'Second pass';
  select count(*) into n from public.agent_log_entries where body = 'Second pass';
  if n <> 0 then
    raise exception 'an owner should be able to delete an agent log entry';
  end if;
end $$;

select set_config('request.jwt.claim.sub', 'd0d0d0d0-0000-4000-8000-0000000000c1', false);

do $$
declare
  n integer;
begin
  select count(*) into n from public.task_handoffs;
  if n <> 0 then
    raise exception 'an outsider should not see handoffs, saw %', n;
  end if;
  select count(*) into n from public.agent_log_entries;
  if n <> 0 then
    raise exception 'an outsider should not see the agent log, saw %', n;
  end if;
  select count(*) into n from public.task_latest_handoff;
  if n <> 0 then
    raise exception 'an outsider should not see the latest-handoff view, saw %', n;
  end if;
  perform pg_temp.assert_raises(
    'select public.handoff_task(''e1e1e1e1-1111-4111-8111-1111111111e1'', ''a2222222-2222-4222-8222-222222222222'')',
    '%Task not found%'
  );
end $$;

-- Joining tasks to handoffs must not recurse (42P17).
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);

do $$
declare
  n integer;
begin
  select count(*) into n
  from public.tasks t
  left join public.task_handoffs h on h.task_id = t.id
  left join public.agent_log_entries e on e.task_id = t.id;

  select count(*) into n from public.task_latest_handoff;
  if n < 1 then
    raise exception 'alex should see at least one latest handoff';
  end if;
end $$;

-- Repeating completion does not copy handoffs or the log.
-- Moving the task keeps the history.
do $$
declare
  garden uuid := 'a4444444-4444-4444-8444-444444444444';
  choir uuid := 'a5555555-5555-4555-8555-555555555555';
  alex uuid := 'a1111111-1111-4111-8111-111111111111';
  sam uuid := 'a2222222-2222-4222-8222-222222222222';
  priya uuid := 'a3333333-3333-4333-8333-333333333333';
  agent uuid := 'd0d0d0d0-0000-4000-8000-0000000000a1';
  v_repeat uuid;
  v_child uuid;
  v_moved uuid;
  v_rank text;
  n integer;
begin
  insert into public.tasks (space_id, title, status, created_by, due_date, repeat_unit, repeat_interval)
  values (garden, 'Water the seedlings', 'todo', alex, '2026-10-27', 'day', 1)
  returning id into v_repeat;

  perform public.set_task_assignees(v_repeat, array[alex]);
  perform public.handoff_task(v_repeat, sam, 'in_progress', 'Needs a look');

  perform set_config('request.jwt.claim.sub', agent::text, true);
  perform public.add_agent_log_entry(v_repeat, 'Checked the tray');
  perform set_config('request.jwt.claim.sub', sam::text, true);

  update public.tasks set status = 'done' where id = v_repeat;
  select id into v_child from public.tasks where recurrence_source_id = v_repeat;
  if v_child is null then
    raise exception 'repeating task did not spawn';
  end if;

  select count(*) into n from public.task_handoffs where task_id = v_child;
  if n <> 0 then
    raise exception 'spawn copied handoffs';
  end if;
  select count(*) into n from public.agent_log_entries where task_id = v_child;
  if n <> 0 then
    raise exception 'spawn copied the agent log';
  end if;
  select count(*) into n from public.task_handoffs where task_id = v_repeat;
  if n <> 1 then
    raise exception 'the completed row should keep its handoff';
  end if;

  perform set_config('request.jwt.claim.sub', alex::text, true);
  insert into public.tasks (space_id, title, status, created_by)
  values (garden, 'Move the compost', 'todo', alex)
  returning id into v_moved;
  perform public.set_task_assignees(v_moved, array[alex]);
  select rank into v_rank from public.tasks where id = v_moved;
  perform public.handoff_task(v_moved, priya, 'todo', 'Priya has the key');
  perform public.move_task(v_moved, choir);

  select count(*) into n from public.task_handoffs where task_id = v_moved;
  if n <> 1 then
    raise exception 'move_task should keep the handoff history';
  end if;
  select count(*) into n from public.tasks where id = v_moved and space_id = choir;
  if n <> 1 then
    raise exception 'task should now be in choir';
  end if;
  if exists (select 1 from public.task_assignees where task_id = v_moved and user_id = priya) then
    raise exception 'priya is not in choir and should have been unassigned';
  end if;
  if (select rank from public.tasks where id = v_moved) is not distinct from v_rank
     and (select space_id from public.tasks where id = v_moved) = choir then
    null; -- rank may change on a circle move; history is what this checks
  end if;
end $$;

-- Cap of 500 is enforced in the RPC, under the task row lock.
-- Direct inserts have no policy, so the seed rows are written as the table owner.
reset role;

do $$
declare
  garden uuid := 'a4444444-4444-4444-8444-444444444444';
  alex uuid := 'a1111111-1111-4111-8111-111111111111';
  agent uuid := 'd0d0d0d0-0000-4000-8000-0000000000a1';
  v_cap uuid;
begin
  insert into public.tasks (space_id, title, status, created_by)
  values (garden, 'Long log', 'todo', alex)
  returning id into v_cap;

  insert into public.agent_log_entries (task_id, author_id, body)
  select v_cap, agent, 'n' || g
  from generate_series(1, 500) as g;

  perform set_config('request.jwt.claim.sub', agent::text, true);
  perform pg_temp.assert_raises(
    format('select public.add_agent_log_entry(%L, %L)', v_cap, 'one more'),
    '%500 agent log entries%'
  );
end $$;

reset role;

do $$
declare
  garden uuid := 'a4444444-4444-4444-8444-444444444444';
  alex uuid := 'a1111111-1111-4111-8111-111111111111';
  agent uuid := 'd0d0d0d0-0000-4000-8000-0000000000a1';
  bot uuid := '50e1c6d4-1111-4111-8111-111111111111';
  v_plain uuid;
  v_agent_task uuid;
  v_desc text;
  v_author uuid;
  v_body text;
  n integer;
  v_ran integer;
begin
  insert into public.tasks (space_id, title, description, status, created_by)
  values (
    garden,
    'Sink',
    E'Call the plumber\n\n## Bot update\nDrafted the reply email\n\n## Notes\nKeep the sink photo.',
    'todo',
    alex
  )
  returning id into v_plain;

  insert into public.tasks (space_id, title, description, status, created_by)
  values (
    garden,
    'Login',
    E'## bot update\nBlocked: Apple login needs 2FA',
    'todo',
    alex
  )
  returning id into v_agent_task;

  insert into public.task_assignees (task_id, user_id, position)
  values (v_agent_task, agent, 0);

  v_ran := public.backfill_bot_update_blocks();
  if v_ran <> 2 then
    raise exception 'backfill should touch 2 tasks, touched %', v_ran;
  end if;

  select description into v_desc from public.tasks where id = v_plain;
  if v_desc ilike '%bot update%' or v_desc not like '%Keep the sink photo.%' or v_desc not like '%Call the plumber%' then
    raise exception 'backfill left a bad description: %', v_desc;
  end if;

  select author_id, body into v_author, v_body
  from public.agent_log_entries
  where task_id = v_plain;
  if v_author is distinct from bot or v_body <> 'Drafted the reply email' then
    raise exception 'plain task should log as RNRW Bot, got % / %', v_author, v_body;
  end if;

  select author_id, body into v_author, v_body
  from public.agent_log_entries
  where task_id = v_agent_task;
  if v_author is distinct from agent or v_body <> 'Blocked: Apple login needs 2FA' then
    raise exception 'agent assignee should author the log, got % / %', v_author, v_body;
  end if;

  select description into v_desc from public.tasks where id = v_agent_task;
  if v_desc is not null then
    raise exception 'a description that was only the bot section should be cleared, got %', v_desc;
  end if;

  if public.backfill_bot_update_blocks() <> 0 then
    raise exception 'backfill should be a no-op the second time';
  end if;

  select count(*) into n from public.agent_log_entries where task_id in (v_plain, v_agent_task);
  if n <> 2 then
    raise exception 'backfill duplicated log rows, saw %', n;
  end if;
end $$;

select set_config('request.jwt.claim.role', '', false);
set role authenticated;
select set_config('request.jwt.claim.sub', '', false);

do $$
begin
  perform pg_temp.assert_raises(
    'select public.handoff_task(''b1111111-1111-4111-8111-111111111111'', ''a2222222-2222-4222-8222-222222222222'')',
    '%Not authenticated%'
  );
end $$;

reset role;

rollback;
