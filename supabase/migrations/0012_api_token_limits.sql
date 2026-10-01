-- Cap active personal access tokens, let the table owner stamp last_used_at
-- from the SQL editor, and count open tasks without loading every row.
--
-- 0011 is already applied in production. This file only adds the follow-ups.
-- ACTIVE_TOKEN_LIMIT in supabase/functions/_shared/apiToken.ts is the same cap.

-- ---------------------------------------------------------------------------
-- last_used_at. service_role stamps it from the MCP function. postgres and
-- the table owner (the SQL editor) may set it too. authenticated may not.
-- ---------------------------------------------------------------------------

create or replace function public.api_tokens_guard_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_owner text;
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

  if new.last_used_at is distinct from old.last_used_at then
    select pg_get_userbyid(c.relowner) into v_owner
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'api_tokens';

    if current_user not in ('service_role', 'postgres')
       and current_user::text is distinct from v_owner
    then
      raise exception 'last_used_at is maintained by the server';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.api_tokens_guard_update() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- At most 10 active tokens per user. Revoked rows do not count. The advisory
-- lock stops two concurrent inserts from both passing the count.
-- ---------------------------------------------------------------------------

create or replace function public.api_tokens_limit_active()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  active_count integer;
begin
  if new.revoked_at is not null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('api_tokens:' || new.user_id::text));

  select count(*) into active_count
  from public.api_tokens
  where user_id = new.user_id
    and revoked_at is null;

  if active_count >= 10 then
    raise exception 'You can have 10 active tokens. Revoke one first.';
  end if;

  return new;
end;
$$;

revoke all on function public.api_tokens_limit_active() from public, anon, authenticated;

create trigger api_tokens_limit_active
  before insert on public.api_tokens
  for each row execute function public.api_tokens_limit_active();

-- ---------------------------------------------------------------------------
-- Open-task counts for list_circles / get_circle. security invoker so RLS
-- still hides tasks the caller cannot see. Circles with zero open tasks are
-- absent; the caller treats a missing row as zero.
-- ---------------------------------------------------------------------------

create or replace function public.open_task_counts()
returns table (space_id uuid, open_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select t.space_id, count(*)::bigint
  from public.tasks t
  where t.status <> 'done'
  group by t.space_id;
$$;

revoke all on function public.open_task_counts() from public, anon;
grant execute on function public.open_task_counts() to authenticated;
