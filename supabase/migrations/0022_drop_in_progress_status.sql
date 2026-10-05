-- Doing / in_progress is not a list. Assignment already means the task is in
-- play. Open work is todo; closed work is done. Fold any Doing rows into To do
-- before the check constraint rejects that status.

update public.tasks
set status = 'todo'
where status = 'in_progress';

alter table public.tasks drop constraint tasks_status_check;

alter table public.tasks
  add constraint tasks_status_check
  check (status in ('todo', 'done'));
