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
12. `supabase/migrations/0012_api_token_limits.sql`
13. `supabase/migrations/0013_transactional_emails.sql`
14. `supabase/migrations/0014_task_recurrence.sql`

On the hosted project, migrations 0001–0011 are already applied. Apply `0012_api_token_limits.sql` on its own (SQL editor or `supabase db push` against that project). Do not re-run earlier migrations, and do not run `supabase/seed.sql` or `supabase/tests/bootstrap.sql` there.

`0014_task_recurrence.sql` adds repeating tasks. It is applied on the hosted project. Completing a repeating task inserts the next occurrence in the database, including when it is completed through the MCP server. The MCP tool arguments are unchanged.

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
- Keep `{{ .ConfirmationURL }}` in the confirmation and recovery email templates. Do not strip the token from the link. The branded templates live in `supabase/templates/` (see Email below).

The deep link scheme is `trove`, from `app.json`.

## Edge functions

`supabase/functions/delete-account` deletes the signed-in account. `verify_jwt` is **true** (`supabase/config.toml`). Deploy it after migration 0009:

```bash
supabase functions deploy delete-account
```

`SUPABASE_SERVICE_ROLE_KEY` is provided on hosted Supabase. The function removes the caller's `avatars` and `task-media` files through the Storage API, calls `public.delete_account_data` as the service role, then `auth.admin.deleteUser`. Do not grant `delete_account_data` to `authenticated`. A SQL `DELETE FROM storage.objects` fails on the hosted project even when it matches zero rows (`storage.protect_delete`).

`supabase/functions/enrich-task` polishes a captured task when `OPENAI_API_KEY` is set. `verify_jwt` is true. The app still saves the task if the function is missing or the key is unset.

`supabase/functions/mcp` is the remote MCP server (Streamable HTTP). `verify_jwt` is **false**: callers send a personal access token (`trove_…`), not a Supabase JWT. The function hashes the token, signs a short-lived user JWT, and queries as that user so row level security still applies. It does not create an Auth session. Deploy it only after migration 0012.

Hosted Supabase rejects function secrets whose names start with `SUPABASE_`. Set `TROVE_JWT_SIGNING_KEY` to the private JWK of the active ES256 signing key (the one you imported; `kid` must match). The legacy HS256 secret is `previously_used` and still verifies, so `TROVE_JWT_SECRET` is the alternative. Do not commit either value. `SUPABASE_JWT_SECRET` and `SUPABASE_JWT_SIGNING_KEY` are read only when the `TROVE_` name is unset, for local dev.

```bash
supabase secrets set TROVE_JWT_SIGNING_KEY='{"kty":"EC","kid":"…","crv":"P-256","x":"…","y":"…","d":"…"}'
supabase functions deploy mcp --no-verify-jwt
```

The `--no-verify-jwt` flag is required even though `config.toml` sets `verify_jwt = false`. If the gateway answers `Invalid JWT` or `Missing authorization` before the function logs anything, verification is still on.

Hosted Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. If neither Trove secret is set, the function returns `server_misconfigured`. See `docs/MCP.md`.

Server URL: `https://pxjqqogxemsmufopmlsv.supabase.co/functions/v1/mcp`

People create tokens in the app under Account → Connect an AI assistant. Do not put the service role key in any client config.

## Email

Trove sends through Resend from its own domain, kept apart from The React Native Rewind newsletter (separate Resend domain and a sending-only API key restricted to it). The sender is `hello@trove.thereactnativerewind.com` (DNS in the thereactnativerewind.com Cloudflare zone). Welcome and invite emails set Reply-To `luke@thereactnativerewind.com` (`TROVE_EMAIL_REPLY_TO`). Supabase Auth SMTP has no Reply-To setting, so auth emails carry none.

**Auth emails** (confirm sign-up, password reset, magic link, email change, invite, reauthentication) go through Supabase Auth's custom SMTP:

- Host `smtp.resend.com`, port `465`, user `resend`, password = the Trove-only Resend API key (sending access, restricted to the Trove domain).
- Sender `hello@trove.thereactnativerewind.com`, name `Trove`.
- Email rate limit raised to 30 per hour (the default mailer allows 2).
- Templates and subjects: `supabase/templates/*.html`, generated from `supabase/functions/_shared/emailCopy.ts` by `deno run --allow-write supabase/templates/build.ts`. `config.toml` points at them.

Confirm email stays on. The App Review demo account is already confirmed.

**Welcome and circle invite emails** come from the `send-email` edge function:

- Migration 0013 adds triggers: `on_auth_user_confirmed` (email_confirmed_at goes from null to set) and `on_auth_user_created_confirmed` (account created already confirmed) send `{ type: "welcome", user_id }`; `invites_send_email` sends `{ type: "invite", invite_id }` for each new pending invite. They post through `pg_net` with the `x-trove-hook-secret` header.
- The function reads the address, names and token with the service role, so the trigger payload cannot choose a recipient. Invite emails are capped at 25 per inviter per 24 hours. Resend idempotency keys stop duplicates.
- Links use the `open` function (`/functions/v1/open?to=invite/<token>` → `trove://invite/<token>`), because email clients drop `trove://` links.

Set once per project (values never committed):

```bash
supabase secrets set RESEND_API_KEY=re_... TROVE_EMAIL_HOOK_SECRET=<random hex>
supabase functions deploy send-email --no-verify-jwt
supabase functions deploy open --no-verify-jwt
```

```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-email', 'trove_email_hook_url');
select vault.create_secret('<same TROVE_EMAIL_HOOK_SECRET>', 'trove_email_hook_secret');
```

Optional function secrets: `TROVE_EMAIL_FROM`, `TROVE_EMAIL_REPLY_TO`, `TROVE_SITE_URL` (defaults to the Vercel site until trove.thereactnativerewind.com is attached).
