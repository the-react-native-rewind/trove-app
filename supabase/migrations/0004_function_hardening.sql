-- Function hardening: trigger-only functions must not be callable as RPC, and
-- RLS helpers are limited to authenticated policy evaluation.

-- Trigger-only functions (triggers still fire; Postgres does not check EXECUTE
-- for trigger invocation)
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.add_creator_as_owner() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- RLS helpers: needed by authenticated policy evaluation only
revoke execute on function public.is_space_member(uuid) from public, anon;
revoke execute on function public.current_space_role(uuid) from public, anon;

-- accept_invite: signed-in users only
revoke execute on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;
