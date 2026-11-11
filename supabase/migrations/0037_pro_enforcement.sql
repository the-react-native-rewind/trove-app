-- Trove Pro, enforced in the database as well as the app.
--
-- 1. Only the billing webhook (service role) may change profiles.is_pro.
--    A signed-in person can still update their own name/avatar, but any attempt
--    to flip is_pro from the client is silently ignored.
-- 2. A free person can own at most 3 circles on top of Personal. Circles they
--    are invited into never count. Creating a 4th raises 'trove_pro_required'
--    so the app can show the paywall.

create or replace function public.protect_profile_is_pro()
returns trigger
language plpgsql
security definer
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

drop trigger if exists protect_profile_is_pro on public.profiles;
create trigger protect_profile_is_pro
  before insert or update on public.profiles
  for each row execute function public.protect_profile_is_pro();

create or replace function public.enforce_free_circle_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owned int;
  pro boolean;
begin
  if new.is_default then
    return new;
  end if;
  select coalesce(is_pro, false) into pro from public.profiles where id = new.owner_id;
  if coalesce(pro, false) then
    return new;
  end if;
  select count(*) into owned
    from public.spaces
   where owner_id = new.owner_id and not is_default;
  if owned >= 3 then
    raise exception 'trove_pro_required'
      using errcode = 'P0001',
            hint = 'Free Trove includes 3 circles plus Personal. Trove Pro adds as many as you like.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_free_circle_limit on public.spaces;
create trigger enforce_free_circle_limit
  before insert on public.spaces
  for each row execute function public.enforce_free_circle_limit();
