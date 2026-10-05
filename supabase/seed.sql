-- Local/demo seed. Safe to re-run. Do not run this against production.
--
-- Demo sign-in (local Supabase only, after `supabase db reset`):
--   alex@trove.example   / trove-local-demo
--   sam@trove.example    / trove-local-demo
--   priya@trove.example  / trove-local-demo
--
-- Alex belongs to Garden crew, Choir, and Household. Mine shows only the
-- tasks assigned to Alex. Garden crew's board shows the whole shared list.

create or replace function pg_temp.insert_demo_user(uid uuid, user_email text, display text)
returns void
language plpgsql
as $$
declare
  col_list text := 'id, email, raw_user_meta_data';
  val_list text := format(
    '%L, %L, %L::jsonb',
    uid,
    user_email,
    jsonb_build_object('display_name', display)::text
  );
  token_col text;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'aud'
  ) then
    col_list := col_list || ', aud, role';
    val_list := val_list || ', ''authenticated'', ''authenticated''';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'instance_id'
  ) then
    col_list := col_list || ', instance_id';
    val_list := val_list || ', ''00000000-0000-0000-0000-000000000000''';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'raw_app_meta_data'
  ) then
    col_list := col_list || ', raw_app_meta_data';
    val_list := val_list || ', ''{"provider":"email","providers":["email"]}''::jsonb';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password'
  ) then
    col_list := col_list || ', encrypted_password';
    val_list := val_list || format(', %L', crypt('trove-local-demo', gen_salt('bf')));
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'email_confirmed_at'
  ) then
    col_list := col_list || ', email_confirmed_at';
    val_list := val_list || ', now()';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'created_at'
  ) then
    col_list := col_list || ', created_at';
    val_list := val_list || ', now()';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'updated_at'
  ) then
    col_list := col_list || ', updated_at';
    val_list := val_list || ', now()';
  end if;

  foreach token_col in array array[
    'confirmation_token',
    'recovery_token',
    'email_change_token_new',
    'email_change',
    'email_change_token_current',
    'phone_change',
    'phone_change_token',
    'reauthentication_token'
  ]
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = token_col
    ) then
      col_list := col_list || format(', %I', token_col);
      val_list := val_list || ', ''''';
    end if;
  end loop;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'is_sso_user'
  ) then
    col_list := col_list || ', is_sso_user';
    val_list := val_list || ', false';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'is_anonymous'
  ) then
    col_list := col_list || ', is_anonymous';
    val_list := val_list || ', false';
  end if;

  execute format(
    'insert into auth.users (%s) values (%s) on conflict (id) do nothing',
    col_list,
    val_list
  );
end;
$$;

select pg_temp.insert_demo_user(
  'a1111111-1111-4111-8111-111111111111',
  'alex@trove.example',
  'Alex Rivera'
);
select pg_temp.insert_demo_user(
  'a2222222-2222-4222-8222-222222222222',
  'sam@trove.example',
  'Sam Okonkwo'
);
select pg_temp.insert_demo_user(
  'a3333333-3333-4333-8333-333333333333',
  'priya@trove.example',
  'Priya Shah'
);

-- Email identities, when this auth schema has that table (hosted / CLI Supabase).
do $$
declare
  person record;
begin
  if to_regclass('auth.identities') is null then
    return;
  end if;

  for person in
    select *
    from (values
      ('a1111111-1111-4111-8111-111111111111'::uuid, 'alex@trove.example'),
      ('a2222222-2222-4222-8222-222222222222'::uuid, 'sam@trove.example'),
      ('a3333333-3333-4333-8333-333333333333'::uuid, 'priya@trove.example')
    ) as t(id, email)
  loop
    begin
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id'
      ) then
        execute
          'insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
           values ($1, $1, $2, ''email'', $3, now(), now(), now())
           on conflict do nothing'
        using
          person.id,
          jsonb_build_object('sub', person.id::text, 'email', person.email),
          person.id::text;
      else
        execute
          'insert into auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
           values ($1, $1, $2, ''email'', now(), now(), now())
           on conflict do nothing'
        using
          person.id,
          jsonb_build_object('sub', person.id::text, 'email', person.email);
      end if;
    exception when others then
      raise notice 'skipped auth.identities for %: %', person.email, sqlerrm;
    end;
  end loop;
end $$;

insert into public.spaces (id, name, color, owner_id, is_default)
values
  ('a4444444-4444-4444-8444-444444444444', 'Garden crew', 'moss', 'a1111111-1111-4111-8111-111111111111', false),
  ('a5555555-5555-4555-8555-555555555555', 'Choir', 'dusk', 'a1111111-1111-4111-8111-111111111111', false),
  ('a6666666-6666-4666-8666-666666666666', 'Household', 'terracotta', 'a1111111-1111-4111-8111-111111111111', false)
on conflict (id) do nothing;

insert into public.space_members (space_id, user_id, role)
values
  ('a4444444-4444-4444-8444-444444444444', 'a2222222-2222-4222-8222-222222222222', 'member'),
  ('a4444444-4444-4444-8444-444444444444', 'a3333333-3333-4333-8333-333333333333', 'member'),
  ('a5555555-5555-4555-8555-555555555555', 'a2222222-2222-4222-8222-222222222222', 'member')
on conflict (space_id, user_id) do nothing;

insert into public.tasks (
  id, space_id, title, description, status, position, priority, due_date, created_by
)
values
  (
    'b1111111-1111-4111-8111-111111111111',
    'a4444444-4444-4444-8444-444444444444',
    'Water the greenhouse',
    'The seedlings dry out by mid-morning.',
    'todo', 1,
    'high', current_date + 1,
    'a1111111-1111-4111-8111-111111111111'
  ),
  (
    'b2222222-2222-4222-8222-222222222222',
    'a4444444-4444-4444-8444-444444444444',
    'Turn the compost',
    'Back bed, after the rain.',
    'todo', 2,
    'medium', current_date + 2,
    'a1111111-1111-4111-8111-111111111111'
  ),
  (
    'b3333333-3333-4333-8333-333333333333',
    'a4444444-4444-4444-8444-444444444444',
    'Order seed potatoes',
    'Charlotte and Pink Fir. Shared job, not on anyone''s personal list yet.',
    'todo', 3,
    'low', current_date + 10,
    'a3333333-3333-4333-8333-333333333333'
  ),
  (
    'b4444444-4444-4444-8444-444444444444',
    'a4444444-4444-4444-8444-444444444444',
    'Fix the gate latch',
    null,
    'done', 4,
    null, current_date - 1,
    'a3333333-3333-4333-8333-333333333333'
  ),
  (
    'b5555555-5555-4555-8555-555555555555',
    'a4444444-4444-4444-8444-444444444444',
    'Label the seedlings',
    'Tomatoes and basil.',
    'todo', 5,
    'medium', current_date + 3,
    'a1111111-1111-4111-8111-111111111111'
  ),
  (
    'b6666666-6666-4666-8666-666666666666',
    'a5555555-5555-4555-8555-555555555555',
    'Print the programmes',
    'Saturday concert. 80 copies.',
    'todo', 1,
    'high', current_date + 4,
    'a1111111-1111-4111-8111-111111111111'
  ),
  (
    'b7777777-7777-4777-8777-777777777777',
    'a5555555-5555-4555-8555-555555555555',
    'Confirm the soloist',
    null,
    'todo', 2,
    'medium', current_date + 6,
    'a2222222-2222-4222-8222-222222222222'
  ),
  (
    'b8888888-8888-4888-8888-888888888888',
    'a6666666-6666-4666-8666-666666666666',
    'Book the boiler service',
    'The engineer only comes on Thursdays.',
    'todo', 1,
    'high', current_date - 2,
    'a1111111-1111-4111-8111-111111111111'
  )
on conflict (id) do nothing;

-- Private tasks live in each person's default Personal space.
insert into public.tasks (
  id, space_id, title, description, status, position, created_by
)
select
  'b9999999-9999-4999-8999-999999999999',
  s.id,
  'Sketch the spring menu',
  'Only Alex can see this. It is in Personal.',
  'todo', 1,
  'a1111111-1111-4111-8111-111111111111'
from public.spaces s
where s.owner_id = 'a1111111-1111-4111-8111-111111111111' and s.is_default
on conflict (id) do nothing;

insert into public.tasks (
  id, space_id, title, status, position, created_by
)
select
  'baaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  s.id,
  'Call mum',
  'todo', 1,
  'a2222222-2222-4222-8222-222222222222'
from public.spaces s
where s.owner_id = 'a2222222-2222-4222-8222-222222222222' and s.is_default
on conflict (id) do nothing;

-- Greenhouse is shared by Alex and Sam. The rest keep a single assignee.
insert into public.task_assignees (task_id, user_id, position)
values
  ('b1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 0),
  ('b1111111-1111-4111-8111-111111111111', 'a2222222-2222-4222-8222-222222222222', 1),
  ('b2222222-2222-4222-8222-222222222222', 'a2222222-2222-4222-8222-222222222222', 0),
  ('b4444444-4444-4444-8444-444444444444', 'a3333333-3333-4333-8333-333333333333', 0),
  ('b5555555-5555-4555-8555-555555555555', 'a1111111-1111-4111-8111-111111111111', 0),
  ('b6666666-6666-4666-8666-666666666666', 'a1111111-1111-4111-8111-111111111111', 0),
  ('b7777777-7777-4777-8777-777777777777', 'a2222222-2222-4222-8222-222222222222', 0),
  ('b8888888-8888-4888-8888-888888888888', 'a1111111-1111-4111-8111-111111111111', 0),
  ('b9999999-9999-4999-8999-999999999999', 'a1111111-1111-4111-8111-111111111111', 0),
  ('baaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a2222222-2222-4222-8222-222222222222', 0)
on conflict (task_id, user_id) do nothing;
