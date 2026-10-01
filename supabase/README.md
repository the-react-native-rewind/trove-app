# Supabase setup

Apply these files, in this order, to an empty project (the `auth` and `storage` schemas already exist). Do not run `supabase/tests/bootstrap.sql` on a hosted project. That file is a plain-Postgres stand-in for local checks only.

1. `supabase/migrations/0001_core_schema.sql`
2. `supabase/migrations/0002_functions_triggers.sql`
3. `supabase/migrations/0003_rls_policies.sql`
4. `supabase/migrations/0004_function_hardening.sql`
5. `supabase/migrations/0005_task_attachments.sql`
6. `supabase/migrations/0006_avatars.sql`
7. `supabase/migrations/0007_user_task_week_plans.sql`
8. `supabase/migrations/0008_account_privacy_and_grants.sql`

`supabase/seed.sql` loads demo people with a known password. Use it only on a local database. Do not run it on the production project.

The app talks to the project with the public anon key (`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`). Preview and production EAS builds read those from `eas.json`. Local runs read a gitignored `.env`. `.env.example` stays placeholders.

## Auth dashboard

Email and password only. Sign in with Apple is not used, so leave that provider off.

- Enable email sign-up.
- Minimum password length: 6.
- Confirm email can stay on. If it is on, sign-up finishes only after the person opens the confirmation link, then signs in. The app already handles a sign-up that returns no session.
- Site URL: `trove://` while there is no hosted web origin. Add the production web origin here when you have one.
- Additional redirect URLs:
  - `trove://`
  - `trove://reset-password`
  - `trove://**`
  - `http://localhost:8081/**`
  - the production web origin, with `/**`, when you have one
- Password recovery uses `Linking.createURL('/reset-password')`, which is `trove://reset-password` in the native app and the web origin plus `/reset-password` in the browser.
- Email confirmation uses `Linking.createURL('/')`.
- Keep `{{ .ConfirmationURL }}` in the confirmation and recovery email templates. The default templates are enough. Do not strip the token from the link.

The deep link scheme is `trove`, from `app.json`.

## Optional

`supabase/functions/enrich-task` polishes a captured task when `OPENAI_API_KEY` is set. The app still saves the task if the function is missing or the key is unset.
