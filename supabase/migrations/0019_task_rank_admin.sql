-- Only an owner or admin may change a task's rank.
-- Members can still edit the other columns. Inserts keep working: a new task
-- with no rank is placed by tasks_set_rank, and move_task does not set rank
-- itself (that trigger fills the destination rank without listing the column).
-- A session with no user (migrations, the service role) is left alone.

create or replace function public.tasks_guard_rank()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if tg_op = 'UPDATE'
     and new.rank is distinct from old.rank
     and auth.uid() is not null
     and coalesce(public.current_space_role(old.space_id), '') not in ('owner', 'admin')
  then
    raise exception 'Only an owner or admin can reorder tasks';
  end if;
  return new;
end;
$function$;

revoke all on function public.tasks_guard_rank() from public, anon, authenticated;

create trigger tasks_guard_rank
  before update of rank on public.tasks
  for each row execute function public.tasks_guard_rank();
