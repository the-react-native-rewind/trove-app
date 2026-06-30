-- Defense-in-depth: an owner can always read their own space (also makes an
-- insert-with-returning succeed before the AFTER trigger adds the membership).
create policy "owners read own spaces" on public.spaces
  for select to authenticated using (owner_id = auth.uid());

-- Task attachments (images / videos), membership-scoped like everything else.
create table public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  space_id uuid not null references public.spaces(id) on delete cascade,
  path text not null,
  media_type text not null check (media_type in ('image','video')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index task_attachments_task_idx on public.task_attachments(task_id);

alter table public.task_attachments enable row level security;
create policy "members read attachments" on public.task_attachments
  for select to authenticated using (is_space_member(space_id));
create policy "writers add attachments" on public.task_attachments
  for insert to authenticated
  with check (current_space_role(space_id) in ('owner','admin','member') and created_by = auth.uid());
create policy "writers delete attachments" on public.task_attachments
  for delete to authenticated using (current_space_role(space_id) in ('owner','admin','member'));

-- Private storage bucket. Object paths are <space_id>/<task_id>/<file>, so we can
-- gate every object on membership of the space in the first path segment.
insert into storage.buckets (id, name, public) values ('task-media', 'task-media', false)
  on conflict (id) do nothing;

create policy "members read task-media" on storage.objects
  for select to authenticated
  using (bucket_id = 'task-media' and is_space_member(((storage.foldername(name))[1])::uuid));
create policy "writers upload task-media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'task-media' and current_space_role(((storage.foldername(name))[1])::uuid) in ('owner','admin','member'));
create policy "writers delete task-media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'task-media' and current_space_role(((storage.foldername(name))[1])::uuid) in ('owner','admin','member'));
