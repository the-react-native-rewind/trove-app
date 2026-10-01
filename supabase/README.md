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
9. `supabase/migrations/0009_account_deletion_via_storage_api.sql`
10. `supabase/migrations/0010_advisor_rls_and_indexes.sql`
11. `supabase/migrations/0011_api_tokens_and_move_task.sql`

On the hosted project, migrations 0001–0010 are already applied. Apply `0011_api_tokens_and_move_task.sql` on its own (SQL editor or `supabase db push` against that project). Do not re-run earlier migrations, and do not run `supabase/seed.sql` or `supabase/tests/bootstrap.sql` there.

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

## Edge functions

`supabase/functions/delete-account` deletes the signed-in account. `verify_jwt` is **true** (`supabase/config.toml`). Deploy it after migration 0009:

```bash
supabase functions deploy delete-account
```

`SUPABASE_SERVICE_ROLE_KEY` is provided on hosted Supabase. The function removes the caller's `avatars` and `task-media` files through the Storage API, calls `public.delete_account_data` as the service role, then `auth.admin.deleteUser`. Do not grant `delete_account_data` to `authenticated`. A SQL `DELETE FROM storage.objects` fails on the hosted project even when it matches zero rows (`storage.protect_delete`).

`supabase/functions/enrich-task` polishes a captured task when `OPENAI_API_KEY` is set. `verify_jwt` is true. The app still saves the task if the function is missing or the key is unset.

`supabase/functions/mcp` is the remote MCP server (Streamable HTTP). `verify_jwt` is **false**: callers send a personal access token (`trove_…`), not a Supabase JWT. The function hashes the token, then queries as that user so row level security still applies. Deploy it only after migration 0011:

```bash
supabase functions deploy mcp --no-verify-jwt
```

The `--no-verify-jwt` flag is required even though `config.toml` sets `verify_jwt = false`. If the gateway answers `Invalid JWT` or `Missing authorization` before the function logs anything, verification is still on.

Hosted Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. No new secret belongs in the repo. If `SUPABASE_JWT_SECRET` is set, the function signs a short-lived user JWT. If that secret is missing or PostgREST rejects the signature, the function mints a magic-link session for the token's user and caches it in the isolate for about an hour.

Server URL: `https://pxjqqogxemsmufopmlsv.supabase.co/functions/v1/mcp`

People create tokens in the app under Account → Connect an AI assistant. See `docs/MCP.md`. Do not put the service role key in any client config.
