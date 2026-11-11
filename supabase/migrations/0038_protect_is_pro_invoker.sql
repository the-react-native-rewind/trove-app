-- 0037's is_pro guard ran as SECURITY DEFINER, so current_user was always the
-- function owner and the guard never fired. Run it as the caller instead:
-- signed-in people are 'authenticated' (blocked); the billing webhook is
-- 'service_role' and migrations/admin SQL are 'postgres' (allowed).
create or replace function public.protect_profile_is_pro()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_pro := false;
  elsif new.is_pro is distinct from old.is_pro then
    new.is_pro := old.is_pro;
  end if;
  return new;
end;
$$;
