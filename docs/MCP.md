# Trove MCP server

Trove has a remote [MCP](https://modelcontextprotocol.io) server so Claude, ChatGPT, Cursor, Claude Code, Grok, and other assistants can create and manage tasks in your circles. The assistant can do what you can do in the app, and nothing more.

A **circle** is a shared place for tasks: a house, a side business, a personal list, a community. In the database these are still called spaces. **Mine** is not a circle. It is every task assigned to you, across every circle you belong to. Your private list is the personal circle created when you signed up (usually named Personal).

There are two ways to connect:

1. **OAuth.** The assistant sends you to Trove to sign in and approve it. This is what Claude, ChatGPT, Cursor, and other directory connectors use. You can disconnect it later under Account → Connect an AI assistant.
2. **A personal access token** (`trove_…`). Use this when a client can send an `Authorization` header and cannot do OAuth.

Server URL:

```text
https://mcp.troving.app/mcp
```

The server speaks Streamable HTTP and does not keep a session between requests. That URL is a Cloudflare Worker in front of the Supabase function. The app shows it under Account → Connect an AI assistant. Set `EXPO_PUBLIC_MCP_RESOURCE_URL` only to override it.

## Connect with OAuth

The assistant discovers how to sign in from the server. You do not paste a token.

1. Add the server URL in the assistant.
2. When it asks you to sign in, the browser opens Trove at `/oauth/consent` on the web app (`https://trove-app-one.vercel.app/oauth/consent`).
3. Sign in if you are not already.
4. Read the assistant's name and what it is asking to see. Allow, or don't.
5. The browser returns to the assistant. It can then use your circles.

Disconnect it under **Account → Connect an AI assistant → Connected apps → Revoke**. That signs that assistant out. Your personal tokens are separate.

OAuth access is the same as yours. Row level security still applies. Approving an assistant does not give it anyone else's circles.

### Claude

In Claude's connectors directory, or in a custom connector, add the server URL. Claude uses OAuth. Do not put a personal token in the connector if the form is asking you to sign in.

### ChatGPT

Add a custom connector (or the app entry, once Trove is listed) with the server URL. ChatGPT requires OAuth. The consent page is the sign-in it is asking for.

### Cursor

In Cursor's MCP settings, add the server URL and leave the header empty so Cursor can sign you in. A personal token still works if you set the header instead:

```json
{
  "mcpServers": {
    "trove": {
      "url": "https://mcp.troving.app/mcp"
    }
  }
}
```

### Claude Code

```bash
claude mcp add --transport http trove \
  https://mcp.troving.app/mcp
```

Leave off the `Authorization` header. Claude Code follows the `401` and opens the consent page. To use a personal token instead, add `--header "Authorization: Bearer trove_…"`.

### Grok

Add a custom connector with the server URL. When Grok asks to sign in, approve Trove on the consent page. If that form only has a header field, use a personal token.

## Connect with a personal token

Replace `trove_…` with the token you create below. Send it on every request:

```text
Authorization: Bearer trove_…
```

### Create a token

1. Open Trove and go to **Account → Connect an AI assistant** (API tokens).
2. Name the token after the app that will use it, for example `Claude` or `Cursor`.
3. Create it. The full token is shown once. Copy it then. Trove stores only a hash.
4. You can keep up to **10** active tokens. The database enforces that cap (`0012_api_token_limits.sql` and `ACTIVE_TOKEN_LIMIT`). Revoke one you no longer use. Revoking takes effect on the next request and cannot be undone.

A token looks like `trove_` followed by a random string. Treat it like a password. Do not commit it, paste it into a shared chat, or send it to anyone else.

### Claude Code

```bash
claude mcp add --transport http trove \
  https://mcp.troving.app/mcp \
  --header "Authorization: Bearer trove_…"
```

### Cursor

Add this to `~/.cursor/mcp.json` (or the project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "trove": {
      "url": "https://mcp.troving.app/mcp",
      "headers": {
        "Authorization": "Bearer trove_…"
      }
    }
  }
}
```

### Claude Desktop

```json
{
  "mcpServers": {
    "trove": {
      "type": "http",
      "url": "https://mcp.troving.app/mcp",
      "headers": {
        "Authorization": "Bearer trove_…"
      }
    }
  }
}
```

If that build only speaks stdio, use `mcp-remote`. The header form has no space after the colon:

```json
{
  "mcpServers": {
    "trove": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.troving.app/mcp",
        "--header",
        "Authorization:Bearer trove_…"
      ]
    }
  }
}
```

### Codex

```toml
[mcp_servers.trove]
url = "https://mcp.troving.app/mcp"
http_headers = { Authorization = "Bearer trove_…" }
```

### Headers

Send the OAuth access token, or `Authorization: Bearer trove_…`. The public host does not need a Supabase `apikey` header. Do not send the service role key.

## Tools

| Tool | What it does |
| --- | --- |
| `list_circles` | Circles you belong to, your role, whether one is your personal circle, and how many tasks are not done. |
| `get_circle` | One circle by id or name. |
| `create_circle` | Create a circle you own. Optional accent colour. Returns the circle id. |
| `list_my_tasks` | Tasks assigned to you (Mine), across circles. Filter by circle, status, or due date. |
| `list_circle_tasks` | Every task in one circle, including ones assigned to other people. |
| `create_task` | Create a task. Omit the circle and it goes in your personal circle, assigned to you. Optional repeat rule. |
| `create_tasks_bulk` | Create up to 100 tasks. Safe to retry when each item has an `external_id`. Each item can repeat. |
| `update_task` | Change title, notes, status, priority, due date, assignees, tags, or the repeat rule. An owner or admin's priority also sets the task's rank. A member can set priority but cannot change rank. Can clear notes, tags, or assignees. Does not change the circle. |
| `complete_task` | Mark a task done. You can set it back to to do. A repeating task stays done, and the database adds the next occurrence. |
| `assign_task` | Replace the people assigned to a task. Passing null or an empty list clears everyone. Each person must already be in that circle. |
| `move_task` | Move a task to another circle. Tags from the old circle are removed, and people who are not in the new circle are unassigned. |
| `add_task_attachment` | Attach an image or video to a task you can edit. A URL is downloaded by the server. Returns the attachment id. |
| `list_members` | People in a circle: user id, display name, role, and whether they joined as an agent. No email addresses. |
| `invite_to_circle` | Invite someone by email. Owners and admins only. **This sends an email** to that address. Limited to 25 invites in 24 hours. Optional `agent` marks the invite as a bot. |

Each tool has a human title and explicit `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint` values. Reads are not destructive. Completing a task is not destructive, because it can be undone. Updating, assigning, and moving can remove data, so those are marked destructive. Inviting someone and attaching a file from a URL reach outside Trove, so those are marked open-world.

Circle arguments are `circle_id`, `circle_name` (case-insensitive, must match one of yours), or `personal: true`. The name **Mine** is not a circle. Ask for `list_my_tasks`, or set `personal: true` for the private circle.

Statuses are `todo` and `done`. Doing is not a status. Priority is `low`, `medium`, or `high`. For an owner or admin it chooses a rank in that circle's overall order: `high` places the task above the current top, `medium` between the two central tasks, and `low` or `null` at the bottom. A member can set the label but cannot move an existing task. New tasks with no priority start at the bottom. Lists return `rank`, a fractional index string. A larger rank sorts first. Order is rank (higher first), then due date (earliest first, no date last), then position and creation time. Due filters are `due_on`, `due_before`, and `due_after` as `YYYY-MM-DD`. Lists return 50 tasks unless you set `limit` (maximum 200).

A task can have several assignees. `assignee` is one member id, a display name (unique in that circle, case-insensitive), `"me"`, or `null`. `assignees` is a list of those same values. Either field replaces the whole set. Pass one of them, not both. An empty `assignees` list, or `assignee: null`, clears everyone. Omitting both on create assigns you. Omitting both on update leaves the current people. Results include `assignees` in position order, and `assignee_id` / `assignee_name` for the first person so older clients still see one assignee. Mine includes a task when you are any assignee.

Tags are labels that belong to one circle. Naming a tag creates it if needed. On `update_task`, `tags` replaces the whole set. An empty array clears them.

`external_id` is a stable id from the source, such as a Notion page id or a Trello card id (1–200 characters). If you already created a task with that id, a later call returns that task and does not change it.

## Repeating tasks

`create_task`, `create_tasks_bulk`, and `update_task` take an optional repeat rule:

| Field | Values |
| --- | --- |
| `repeat_unit` | `day`, `week`, `month`, `never`, or `null`. Omit it on create and the task does not repeat. On update, omit it to leave the rule unchanged. `never` and `null` clear it. |
| `repeat_interval` | Integer from 1 to 99. How many of that unit between occurrences. Defaults to 1. |
| `repeat_weekday` | Integer from 0 (Sunday) to 6 (Saturday). Stored only when `repeat_unit` is `week`. |

A week with no weekday uses the due date's weekday. With no due date, it uses today's weekday in UTC. That is the same rule the app and the database use. A weekday on a daily or monthly task is rejected.

Task results from list, create, update, complete, assign, and move include `repeat_unit`, `repeat_interval`, `repeat_weekday`, and `recurrence_series_id`. The series id is shared by each occurrence of one repeating task. It is the first task's id. `recurrence_source_id` is not returned and cannot be set. The database uses it so completing the same occurrence twice does not insert two successors.

`complete_task`, or `update_task` with `status: done`, marks that row done. If it repeats, the database inserts the next To do occurrence with the same title, notes, priority, tags, circle, assignees, and rule. The new occurrence starts at the bottom of its due-date group, so it does not keep the completed row's rank. The tool result is the completed row, not the new one. List the circle again to see the next occurrence. Photos stay attached to both, because the new row points at the same file. `external_id` stays on the original row only.

`invite_to_circle` takes `email`, an optional `role` of `admin`, `member`, or `viewer` (default `member`), and an optional `agent` boolean (default false). Creating the invite sends an email to that address (database trigger `invites_send_email`). You can create 25 invites in 24 hours. Over that, the invite is not created and no email is sent. `agent: true` marks the invite as a bot. When that invite is accepted, the new membership is stored as an agent. An existing member is not changed. You cannot invite someone as owner. One pending invite per email per circle. The link expires in 14 days. `list_members` includes `is_agent` for each person.

## Creating a circle

`create_circle` takes `name` and an optional `color`. The name is trimmed and must be 1–80 characters. `color` is an accent name (`sage`, `brand`, `moss`, `teal`, `dusk`, `lilac`, `plum`, `rose`, `terracotta`, `clay`, `ochre`, `honey`) or a `#rrggbb` hex, the same values the app's colour picker stores. It defaults to `sage`.

Circles do not have an emoji or a description. Those fields are not stored.

This uses the same insert as creating a circle in the app: a `spaces` row with you as `owner_id`. The database trigger adds you as the owner member. The new circle is not your personal circle (`is_default` stays false). The result includes the circle `id`.

## Photos and videos

`add_task_attachment` adds a file to a task so it shows in the app's media gallery, in the order it was added. A task can have more than one.

You must be able to edit the task (owner, admin, or member of its circle). A viewer cannot attach files. The server checks that before it downloads or stores anything. The upload uses your user credentials, so storage and row level security still apply. It does not use the service role to skip those checks.

Pass `task_id`, `content_type`, and one of:

- `url`: a public or signed `https` URL. The server downloads it. Private, local, and link-local addresses are rejected, including redirects to those addresses.
- `data_base64`: raw base64 bytes. Do not send a `data:` URL.

`filename` is optional. Only an extension that matches `content_type` is kept. The stored object name is a random id, at `{circle id}/{task id}/{file id}.{ext}`, which is the same path shape the app uses.

Allowed `content_type` values, matching the `task-media` bucket:

`image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/heic`, `image/heif`, `video/mp4`, `video/quicktime`, `video/webm`.

The bytes must actually be that type. The maximum size is 50 MB, the bucket limit. The result includes the attachment `id`.

## Moving a task

`move_task` is the only way to change a task's circle. `update_task` will not do it, and a direct edit of the circle is rejected.

You must be able to edit the task where it is now (owner, admin, or member). A viewer of the source circle cannot move it. You must belong to the destination. A viewer of the destination can still receive a task.

If an assignee is not a member of the destination, they are **unassigned**. They are not reassigned to you. If you move your own task into a circle you belong to, you stay assigned.

Tags from the old circle are removed. Photos and videos stay behind: they remain stored under the original circle and people who cannot see that circle cannot open them.

## Example prompts

- "What circles am I in?"
- "Create a circle called Garden, colour terracotta."
- "Show my Mine list that is due this week."
- "Add 'Call the plumber' to my personal circle, due Friday, assigned to me."
- "Add 'Take the bins out' to House every Wednesday."
- "Attach this photo to the plumber task."
- "Move everything in my Notion house list into my House circle. Use each Notion page id as external_id so we can run this twice."
- "Move 'Sketch the spring menu' from my personal circle into Household, and assign it to Sam."
- "Invite sam@example.com to House as a member."

A bulk import that sends more than 100 tasks fails the whole call and inserts nothing. Split the list. If one item in a batch fails, earlier items in that batch are kept and the failure is reported. Inviting someone emails them. Do not invite a list of people unless the person asked you to.

## Security

- A personal token is hashed with SHA-256 before it is stored. Trove cannot show it again.
- An OAuth access token is a Supabase user JWT. The server checks the signature against the project JWKS, the issuer, expiry, the `authenticated` role, an OAuth `client_id`, and a `session_id`. A first-party session without `client_id` is not accepted. The token is then used as you, so row level security applies.
- Revoking a Connected app deletes that Auth session. The function asks Auth whether the session still exists, and remembers the answer for about a minute, so the old access token stops working within a minute. A personal `trove_` token is still checked against `api_tokens` on each use.
- Supabase Auth does not yet put the MCP resource URL in the token audience. It sets `aud` to `authenticated` and ignores the RFC 8707 `resource` parameter. That gap is [supabase/auth#2610](https://github.com/supabase/auth/issues/2610). Until it ships, Trove accepts `aud` of `authenticated` or of the configured resource URL. It does not accept tokens from another issuer.
- Requests run as you. The server does not use a service role to skip membership checks.
- Revoke a personal token, or an OAuth grant, from Account → Connect an AI assistant.
- Someone with access can create circles, create, edit, complete, assign, and move tasks, set or clear a repeat rule, attach photos and videos to tasks you can edit, and invite people to circles you administer. An invite sends an email. Completing a repeating task creates the next occurrence. They cannot see tokens, email addresses of members, or circles you do not belong to.
- A request with no token gets HTTP 401 and a `WWW-Authenticate` header with `resource_metadata` and no `error` code. A request that sends a token which is missing, rejected, or revoked gets the same header with `error="invalid_token"`. The protected-resource document names the Supabase Auth server (`/auth/v1`) as the authorization server.
- A failure inside the server is a JSON-RPC error (`-32603`) with a message a client can show and `data.reason` of `server_misconfigured` or `internal_error`. It is not a bare `Internal error` body.

## Deploying the function

This is for the person who operates the Supabase project. It is not part of connecting an assistant. Do not flip these switches from a script against production.

### Database

Migration `0012_api_token_limits.sql` caps active personal tokens at 10. Migration `0024_invite_rate_limit.sql` caps invites at 25 per person per 24 hours and adds `recent_invite_count()` for the MCP tool. Apply 0024 in the SQL editor or with `supabase db push`. Do not run the seed or `supabase/tests/bootstrap.sql` on the hosted project.

### Function secrets

Hosted Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`, and it rejects any function secret whose name starts with `SUPABASE_`.

| Secret | Required | Purpose |
| --- | --- | --- |
| `TROVE_JWT_SIGNING_KEY` | Yes, for personal tokens | Private JWK of the active ES256 signing key you imported. `kid` must match. |
| `TROVE_JWT_SECRET` | Only if you are not using the signing key | Legacy HS256 secret. Ignored when the signing key is set. |
| `TROVE_MCP_RESOURCE_URL` | Yes, for the public host | Canonical MCP resource URL, no trailing slash. Production is `https://mcp.troving.app/mcp`. If it is unset, the function falls back to `$SUPABASE_URL/functions/v1/mcp`, which is the upstream, not the URL clients should use. |
| `TROVE_SITE_URL` | No | Product website for the server card and icons. Defaults to `https://trove-website-sooty.vercel.app`. `https://troving.app` is the planned site and is not the default until that host resolves. |

```bash
supabase secrets set TROVE_JWT_SIGNING_KEY='{"kty":"EC","kid":"…","crv":"P-256","x":"…","y":"…","d":"…"}'
supabase functions deploy mcp --no-verify-jwt
```

`--no-verify-jwt` is required even though `config.toml` sets `verify_jwt = false`. The gateway must let the unauthenticated discovery request through. If the gateway answers `Invalid JWT` before the function logs anything, verification is still on.

The public host is already live. A Cloudflare Worker at `https://mcp.troving.app` proxies to the function `https://pxjqqogxemsmufopmlsv.supabase.co/functions/v1/mcp`. `TROVE_MCP_RESOURCE_URL` is `https://mcp.troving.app/mcp`. Keep these paths proxied:

- `https://mcp.troving.app/mcp` (the MCP endpoint)
- `GET https://mcp.troving.app/.well-known/oauth-protected-resource`
- `GET https://mcp.troving.app/.well-known/oauth-protected-resource/mcp` (the URL clients read from `WWW-Authenticate` for a resource that has a path)
- `GET https://mcp.troving.app/mcp/.well-known/oauth-protected-resource`

`server.json` publishes `app.troving/trove` at `https://mcp.troving.app/mcp`. Registry DNS auth is on `troving.app` (the reverse-DNS namespace `app.troving`). The app defaults Account to that same URL. Set `EXPO_PUBLIC_MCP_RESOURCE_URL` only to override it.

Direct calls to the function URL can still need the project's publishable anon key in an `apikey` header. The worker adds that. Clients of `https://mcp.troving.app/mcp` do not.

### Supabase dashboard

Do these by hand. This change does not enable them.

**Authentication → OAuth Server** (the OAuth 2.1 server is still in beta):

- Enable the OAuth 2.1 server.
- Authorization path: `/oauth/consent`.
- Allow dynamic client registration: **on**. Claude, ChatGPT, Cursor, and Claude Code register themselves. Dynamic registration lets any MCP client register. People still have to approve each one on the consent page. Review the registered clients from time to time.
- Leave client authentication as the defaults the clients negotiate. Public clients use `none` (PKCE, no secret). Do not require a client secret for directory clients.

**Authentication → URL configuration:**

- Site URL is what the OAuth server prefixes to the authorization path. It must be the Expo web app, `https://trove-app-one.vercel.app`, so the browser opens `https://trove-app-one.vercel.app/oauth/consent`. A Site URL of `trove://` would send the consent redirect into the custom scheme, which a desktop browser cannot show.
- Keep the existing additional redirect URLs: `trove://`, `trove://reset-password`, `trove://**`, `http://localhost:8081/**`, and add `https://trove-app-one.vercel.app/**` if it is not already there.
- The app already passes `redirectTo` for email confirmation (`Linking.createURL('/')`) and password recovery (`Linking.createURL('/reset-password')`). Those keep going to the app as long as the `trove://` URLs stay on the allow list. Changing the Site URL changes the default only for a flow that does not pass `redirectTo`.

**Signing keys:**

- The project already signs with ES256. OAuth tokens are checked against `.../auth/v1/.well-known/jwks.json`. Do not switch the active key to HS256-only. Legacy HS256 session tokens are not accepted as MCP OAuth tokens. Personal `trove_` tokens still work, because the function signs its own one-hour JWT with `TROVE_JWT_SIGNING_KEY`.

**What this does not do:**

- It does not turn on the OAuth server, dynamic registration, or a new Site URL. Those stay off until you flip them.
- It does not bind the access token audience to the MCP resource. [supabase/auth#2610](https://github.com/supabase/auth/issues/2610) tracks that. Until then, a token minted for this project with `aud: authenticated` and a `client_id` is accepted.
- Supabase OAuth scopes are the standard identity scopes (`openid`, `email`, `profile`, `phone`). They do not narrow which tables the assistant can touch. Row level security does that. There is no per-circle scope.
- The consent page and Connected apps list need the OAuth server enabled before they can load a real grant. The personal-token UI works without it.
