-- Personal access tokens for the MCP server, stable import ids on tasks,
-- and move_task: the only supported way to move a task between circles
-- (spaces in the database).
--
-- A circle in the product is a row in public.spaces. "Mine" is not a circle;
-- it is every task assigned to you. The personal circle is the is_default
-- space created at signup.
--
-- move_task rules:
--   * caller must be owner, admin, or member of the task's current circle
--   * caller must be a member of the destination (viewer is enough)
--   * if the assignee is not a member of the destination, assignee_id is cleared
--   * labels that belong to the old circle are detached
--   * photos and videos are not relocated; their storage path stays put
-- Direct updates of tasks.space_id are rejected so these rules cannot be skipped.

-- ---------------------------------------------------------------------------
-- API tokens. Only the SHA-256 hex digest is stored. The raw token is shown
-- once in the app and never written here.
-- ---------------------------------------------------------------------------

create table public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  token_prefix text not null check (char_length(token_prefix) = 12),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create unique index api_tokens_token_hash_key on public.api_tokens (token_hash);
create index api_tokens_user_id_idx on public.api_tokens (user_id);

alter table public.api_tokens enable row level security;

create policy "read own api tokens" on public.api_tokens
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "insert own api tokens" on public.api_tokens
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "update own api tokens" on public.api_tokens
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.api_tokens_guard_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  new.last_used_at := null;
  new.revoked_at := null;
  new.created_at := now();
  return new;
end;
$$;

create or replace function public.api_tokens_guard_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.token_hash is distinct from old.token_hash
     or new.token_prefix is distinct from old.token_prefix
     or new.name is distinct from old.name
     or new.created_at is distinct from old.created_at
  then
    raise exception 'api token identity columns are immutable';
  end if;

  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'a revoked api token cannot be restored';
  end if;

  if new.last_used_at is distinct from old.last_used_at and current_user <> 'service_role' then
    raise exception 'last_used_at is maintained by the server';
  end if;

  return new;
end;
$$;

revoke all on function public.api_tokens_guard_insert() from public, anon, authenticated;
revoke all on function public.api_tokens_guard_update() from public, anon, authenticated;

create trigger api_tokens_guard_insert
  before insert on public.api_tokens
  for each row execute function public.api_tokens_guard_insert();

create trigger api_tokens_guard_update
  before update on public.api_tokens
  for each row execute function public.api_tokens_guard_update();

revoke all on table public.api_tokens from public, anon;
grant select, insert, update on table public.api_tokens to authenticated;
grant all on table public.api_tokens to service_role;

-- ---------------------------------------------------------------------------
-- Idempotent imports. The same external id from the same creator is one task,
-- even if a later import names a different circle.
-- ---------------------------------------------------------------------------

alter table public.tasks
  add column external_id text;

alter table public.tasks
  add constraint tasks_external_id_len
  check (external_id is null or char_length(btrim(external_id)) between 1 and 200);

create unique index tasks_creator_external_id_idx
  on public.tasks (created_by, external_id)
  where external_id is not null and created_by is not null;

-- ---------------------------------------------------------------------------
-- Moving a task. SECURITY DEFINER so a member of the destination can receive
-- the task even when they are only a viewer there (the tasks UPDATE policy
-- would otherwise require a writer role on the new space_id).
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
  v_tags_removed integer := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_task from public.tasks where id = p_task_id;
  if not found then
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

  if v_task.assignee_id is not null and not exists (
    select 1 from public.space_members
    where space_id = p_target_space_id and user_id = v_task.assignee_id
  ) then
    v_assignee_cleared := true;
  end if;

  -- The guard trigger allows this update only while the flag is set.
  -- is_local = true, so the flag dies with this transaction. Reset it
  -- before returning so a later statement in the same transaction cannot
  -- sneak a space_id change through.
  perform set_config('trove.move_task', 'on', true);
  begin
    update public.tasks
    set
      space_id = p_target_space_id,
      assignee_id = case when v_assignee_cleared then null else assignee_id end,
      position = extract(epoch from clock_timestamp()) * 1000
    where id = v_task.id;
    perform set_config('trove.move_task', 'off', true);
  exception
    when others then
      perform set_config('trove.move_task', 'off', true);
      raise;
  end;

  with removed as (
    delete from public.task_labels tl
    using public.labels l
    where tl.task_id = v_task.id
      and tl.label_id = l.id
      and l.space_id is distinct from p_target_space_id
    returning 1
  )
  select count(*)::integer into v_tags_removed from removed;

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

create or replace function public.tasks_require_move_task()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.space_id is distinct from old.space_id
     and coalesce(current_setting('trove.move_task', true), '') is distinct from 'on'
  then
    raise exception 'Use move_task to move a task to another circle';
  end if;
  return new;
end;
$$;

revoke all on function public.tasks_require_move_task() from public, anon, authenticated;

create trigger tasks_require_move_task
  before update of space_id on public.tasks
  for each row execute function public.tasks_require_move_task();
