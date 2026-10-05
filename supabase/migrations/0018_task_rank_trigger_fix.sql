-- Fix: changing a task's due date failed for signed-in users with
-- "permission denied for function rank_bottom" (the rank helpers are only
-- executable by postgres/service_role, and the trigger ran as the caller).
-- Also, since manual order (rank) now leads the list and due date is only a
-- tiebreaker, changing a due date no longer moves the task to the bottom.
-- Rank is still assigned on insert and when a task moves to another circle.
create or replace function public.tasks_set_rank()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    if new.rank is null or new.rank = '' then
      new.rank := public.rank_bottom(new.space_id, new.due_date);
    end if;
    return new;
  end if;

  if new.space_id is distinct from old.space_id
     and new.rank is not distinct from old.rank then
    new.rank := public.rank_bottom(new.space_id, new.due_date);
  end if;
  return new;
end;
$function$;

