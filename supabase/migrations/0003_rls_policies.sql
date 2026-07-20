-- Row Level Security: the core of Trove's visibility model. You can see or
-- change a task only if you are a member of its space.

-- profiles
alter table public.profiles enable row level security;
create policy "read profiles" on public.profiles for select to authenticated using (true);
create policy "insert own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "update own profile" on public.profiles for update to authenticated using (id = auth.uid());

-- spaces
alter table public.spaces enable row level security;
create policy "members read spaces" on public.spaces for select to authenticated using (is_space_member(id));
create policy "create space" on public.spaces for insert to authenticated with check (owner_id = auth.uid());
create policy "owners update space" on public.spaces for update to authenticated using (owner_id = auth.uid());
create policy "owners delete non-default space" on public.spaces for delete to authenticated using (owner_id = auth.uid() and is_default = false);

-- space_members
alter table public.space_members enable row level security;
create policy "members read roster" on public.space_members for select to authenticated using (is_space_member(space_id));
create policy "admins add members" on public.space_members for insert to authenticated with check (current_space_role(space_id) in ('owner','admin'));
create policy "admins update members" on public.space_members for update to authenticated using (current_space_role(space_id) in ('owner','admin'));
create policy "admins or self remove member" on public.space_members for delete to authenticated using (current_space_role(space_id) in ('owner','admin') or user_id = auth.uid());

-- tasks (viewer read-only; owner/admin/member write)
alter table public.tasks enable row level security;
create policy "members read tasks" on public.tasks for select to authenticated using (is_space_member(space_id));
create policy "writers insert tasks" on public.tasks for insert to authenticated with check (current_space_role(space_id) in ('owner','admin','member'));
create policy "writers update tasks" on public.tasks for update to authenticated using (current_space_role(space_id) in ('owner','admin','member')) with check (current_space_role(space_id) in ('owner','admin','member'));
create policy "writers delete tasks" on public.tasks for delete to authenticated using (current_space_role(space_id) in ('owner','admin','member'));

-- labels
alter table public.labels enable row level security;
create policy "members read labels" on public.labels for select to authenticated using (is_space_member(space_id));
create policy "writers manage labels" on public.labels for all to authenticated
  using (current_space_role(space_id) in ('owner','admin','member'))
  with check (current_space_role(space_id) in ('owner','admin','member'));

-- task_labels (scoped via the parent task's space)
alter table public.task_labels enable row level security;
create policy "members read task_labels" on public.task_labels for select to authenticated using (
  exists (select 1 from public.tasks t where t.id = task_id and is_space_member(t.space_id))
);
create policy "writers manage task_labels" on public.task_labels for all to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id and current_space_role(t.space_id) in ('owner','admin','member')))
  with check (exists (select 1 from public.tasks t where t.id = task_id and current_space_role(t.space_id) in ('owner','admin','member')));

-- invites (only space admins/owners manage; invitees join via the accept_invite RPC,
-- so pending invite tokens are never readable by ordinary members)
alter table public.invites enable row level security;
create policy "admins read invites" on public.invites for select to authenticated using (current_space_role(space_id) in ('owner','admin'));
create policy "admins create invites" on public.invites for insert to authenticated with check (current_space_role(space_id) in ('owner','admin') and invited_by = auth.uid());
create policy "admins update invites" on public.invites for update to authenticated using (current_space_role(space_id) in ('owner','admin'));
create policy "admins delete invites" on public.invites for delete to authenticated using (current_space_role(space_id) in ('owner','admin'));
