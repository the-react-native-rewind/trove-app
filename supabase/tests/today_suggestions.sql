-- Suggestions are the top of Mine, in Mine's order. Rolls back.
-- Alex owns Garden crew. A high rank with a far due date must beat an
-- overdue action with a lower rank. In progress does not jump the queue.

\set ON_ERROR_STOP on

begin;

set role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', false);

do $$
declare
  garden uuid := 'a4444444-4444-4444-8444-444444444444';
  alex uuid := 'a1111111-1111-4111-8111-111111111111';
  day date := current_date;
  top_id uuid := 'c1111111-1111-4111-8111-111111111111';
  doing_id uuid := 'c2222222-2222-4222-8222-222222222222';
  overdue_id uuid := 'c3333333-3333-4333-8333-333333333333';
  spare_id uuid := 'c4444444-4444-4444-8444-444444444444';
  result_sig text;
  titles text[];
begin
  result_sig := pg_get_function_result('public.list_today_suggestions(date, date)'::regprocedure);
  if result_sig !~ 'slot' then
    raise exception 'list_today_suggestions should return slot, got %', result_sig;
  end if;
  if result_sig ~ '(^|[^a-z_])position([^a-z_]|$)' then
    raise exception 'list_today_suggestions must not return a position column, got %', result_sig;
  end if;

  insert into public.tasks (id, space_id, title, status, "position", due_date, rank, created_by)
  values
    (top_id, garden, 'Top of Mine', 'todo', 9, day + 30, 'z9', alex),
    (doing_id, garden, 'In progress lower', 'in_progress', 1, null, 'm0', alex),
    (overdue_id, garden, 'Overdue lower', 'todo', 1, day - 10, 'a1', alex),
    (spare_id, garden, 'Fourth', 'todo', 1, day - 1, 'a0', alex);

  insert into public.task_assignees (task_id, user_id, "position")
  values
    (top_id, alex, 0),
    (doing_id, alex, 0),
    (overdue_id, alex, 0),
    (spare_id, alex, 0);

  select array_agg(title order by slot) into titles
  from public.list_today_suggestions(day, day);

  if titles[1] <> 'Top of Mine' or titles[2] <> 'In progress lower' or titles[3] <> 'Overdue lower' then
    raise exception 'suggestions should follow Mine order, got %', titles;
  end if;
  if array_length(titles, 1) <> 3 then
    raise exception 'suggestions should stop at 3, got %', titles;
  end if;

  perform public.dismiss_today_suggestion(day, top_id);

  select array_agg(title order by slot) into titles
  from public.list_today_suggestions(day, day);
  if titles <> array['In progress lower', 'Overdue lower']::text[] then
    raise exception 'dismissing one should not backfill, got %', titles;
  end if;

  select array_agg(title) into titles
  from public.list_today_suggestions(day + 1, day);
  if titles is not null then
    raise exception 'tomorrow should have no suggestions, got %', titles;
  end if;
end $$;

rollback;
