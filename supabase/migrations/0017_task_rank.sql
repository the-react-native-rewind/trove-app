-- Ordering rank for tap-to-prioritise.
--
-- Each task has a lexicographic fractional-index key (the same scheme as
-- fractional-indexing / Figma / Linear). A larger key sorts first within a
-- due date. Inserting between two tasks writes one new key and never
-- renumbers the rest, so there is no rebalance job.
--
-- Keys use ASCII byte order. The column collation is "C" so min(rank) and
-- ORDER BY rank match the app, which compares the strings as JavaScript does.
--
-- rank_key_by_index(n) is generateNKeysBetween(null, null)[n]: 0 = a0,
-- 61 = az, 62 = b00. rank_before(key) is generateKeyBetween(null, key).

create or replace function public.rank_integer_length(head text)
returns integer
language plpgsql
immutable
set search_path = public
as $$
begin
  if head >= 'a' collate "C" and head <= 'z' collate "C" then
    return ascii(head) - ascii('a') + 2;
  elsif head >= 'A' collate "C" and head <= 'Z' collate "C" then
    return ascii('Z') - ascii(head) + 2;
  else
    raise exception 'invalid order key head: %', head;
  end if;
end;
$$;

create or replace function public.rank_increment_integer(x text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  digits constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  head text := substr(x, 1, 1);
  digs text[] := '{}';
  i integer;
  pos integer;
  carry boolean := true;
  h text;
begin
  if length(x) <> public.rank_integer_length(head) then
    raise exception 'invalid integer part of order key: %', x;
  end if;
  for i in 2..length(x) loop
    digs := digs || substr(x, i, 1);
  end loop;

  for i in reverse coalesce(array_length(digs, 1), 0)..1 loop
    exit when not carry;
    pos := strpos(digits, digs[i]);
    if pos = length(digits) then
      digs[i] := substr(digits, 1, 1);
    elsif pos > 0 then
      digs[i] := substr(digits, pos + 1, 1);
      carry := false;
    else
      raise exception 'invalid order key digit: %', digs[i];
    end if;
  end loop;

  if not carry then
    return head || array_to_string(digs, '');
  end if;
  if head = 'Z' collate "C" then
    return 'a' || substr(digits, 1, 1);
  end if;
  if head = 'z' collate "C" then
    return null;
  end if;
  h := chr(ascii(head) + 1);
  if h > 'a' collate "C" then
    digs := digs || substr(digits, 1, 1);
  else
    digs := digs[1:array_length(digs, 1) - 1];
  end if;
  return h || array_to_string(digs, '');
end;
$$;

create or replace function public.rank_decrement_integer(x text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  digits constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  head text := substr(x, 1, 1);
  digs text[] := '{}';
  i integer;
  pos integer;
  borrow boolean := true;
  h text;
  last_digit text;
begin
  if length(x) <> public.rank_integer_length(head) then
    raise exception 'invalid integer part of order key: %', x;
  end if;
  last_digit := substr(digits, length(digits), 1);
  for i in 2..length(x) loop
    digs := digs || substr(x, i, 1);
  end loop;

  for i in reverse coalesce(array_length(digs, 1), 0)..1 loop
    exit when not borrow;
    pos := strpos(digits, digs[i]);
    if pos = 1 then
      digs[i] := last_digit;
    elsif pos > 1 then
      digs[i] := substr(digits, pos - 1, 1);
      borrow := false;
    else
      raise exception 'invalid order key digit: %', digs[i];
    end if;
  end loop;

  if not borrow then
    return head || array_to_string(digs, '');
  end if;
  if head = 'a' collate "C" then
    return 'Z' || last_digit;
  end if;
  if head = 'A' collate "C" then
    return null;
  end if;
  h := chr(ascii(head) - 1);
  if h < 'Z' collate "C" then
    digs := digs || last_digit;
  else
    digs := digs[1:array_length(digs, 1) - 1];
  end if;
  return h || array_to_string(digs, '');
end;
$$;

-- The key immediately below `key`. Null or blank starts a group at a0.
create or replace function public.rank_before(key text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  ib text;
  ib_len integer;
begin
  if key is null or key = '' then
    return 'a0';
  end if;
  ib_len := public.rank_integer_length(substr(key, 1, 1));
  if ib_len > length(key) then
    raise exception 'invalid order key: %', key;
  end if;
  ib := substr(key, 1, ib_len);
  if ib < key collate "C" then
    return ib;
  end if;
  return public.rank_decrement_integer(ib);
end;
$$;

create or replace function public.rank_key_by_index(p_index integer)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  key text := 'a0';
  i integer := 0;
begin
  if p_index is null or p_index < 0 then
    raise exception 'rank index must be >= 0';
  end if;
  while i < p_index loop
    key := public.rank_increment_integer(key);
    i := i + 1;
  end loop;
  return key;
end;
$$;

revoke all on function public.rank_integer_length(text) from public, anon, authenticated;
revoke all on function public.rank_increment_integer(text) from public, anon, authenticated;
revoke all on function public.rank_decrement_integer(text) from public, anon, authenticated;
revoke all on function public.rank_before(text) from public, anon, authenticated;
revoke all on function public.rank_key_by_index(integer) from public, anon, authenticated;

alter table public.tasks
  add column rank text collate "C";

-- Preserve today's order inside each circle and due date: high, medium, low,
-- then none, then position, created_at, and id. The first row gets the
-- largest key so it stays at the top.
with ordered as (
  select
    id,
    row_number() over (
      partition by space_id, due_date
      order by
        case priority
          when 'high' then 0
          when 'medium' then 1
          when 'low' then 2
          else 3
        end,
        position,
        created_at,
        id
    ) as pos,
    count(*) over (partition by space_id, due_date) as n
  from public.tasks
)
update public.tasks as task
set rank = public.rank_key_by_index((ordered.n - ordered.pos)::integer)
from ordered
where task.id = ordered.id;

alter table public.tasks
  alter column rank set not null;

alter table public.tasks
  add constraint tasks_rank_not_blank check (length(rank) > 0);

create index tasks_space_due_rank_idx
  on public.tasks (space_id, due_date, rank);

comment on column public.tasks.rank is
  'Fractional index within this circle and due date. Larger keys sort first. Shared with every member of the circle.';

-- Lowest key in a circle's due-date group, or a0 when the group is empty.
-- Null due dates form one group (is not distinct from).
create or replace function public.rank_bottom(p_space_id uuid, p_due date)
returns text
language sql
stable
set search_path = public
as $$
  select public.rank_before((
    select min(t.rank) from public.tasks t
    where t.space_id = p_space_id
      and t.due_date is not distinct from p_due
  ));
$$;

revoke all on function public.rank_bottom(uuid, date) from public, anon, authenticated;

-- Fill a missing rank on insert (new captures, seeded rows, spawned
-- occurrences). When a task changes due date or circle without an explicit
-- new rank, place it at the bottom of the destination group.
create or replace function public.tasks_set_rank()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.rank is null or new.rank = '' then
      new.rank := public.rank_bottom(new.space_id, new.due_date);
    end if;
    return new;
  end if;

  if (new.due_date is distinct from old.due_date or new.space_id is distinct from old.space_id)
     and new.rank is not distinct from old.rank then
    new.rank := public.rank_bottom(new.space_id, new.due_date);
  end if;
  return new;
end;
$$;

revoke all on function public.tasks_set_rank() from public, anon, authenticated;

create trigger tasks_set_rank
  before insert or update of due_date, space_id, rank on public.tasks
  for each row execute function public.tasks_set_rank();
