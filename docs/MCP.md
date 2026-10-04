# Trove MCP server

Trove has a remote [MCP](https://modelcontextprotocol.io) server so Claude, Cursor, ChatGPT, Codex, and other assistants can create and manage tasks in your circles. You sign in with a personal access token. The assistant can do what you can do in the app, and nothing more.

A **circle** is a shared place for tasks: a house, a side business, a personal list, a community. In the database these are still called spaces. **Mine** is not a circle. It is every task assigned to you, across every circle you belong to. Your private list is the personal circle created when you signed up (usually named Personal).

Server URL:

```text
https://pxjqqogxemsmufopmlsv.supabase.co/functions/v1/mcp
```

The server speaks Streamable HTTP. Send the token on every request:

```text
Authorization: Bearer trove_…
```

## Create a token

1. Open Trove and go to **Account → Connect an AI assistant** (API tokens).
2. Name the token after the app that will use it, for example `Claude` or `Cursor`.
3. Create it. The full token is shown once. Copy it then. Trove stores only a hash.
4. You can keep up to 10 active tokens. Revoke one you no longer use. Revoking takes effect immediately and cannot be undone. The database enforces that cap, not only the app.

A token looks like `trove_` followed by a random string. Treat it like a password. Do not commit it, paste it into a shared chat, or send it to anyone else.

## Connect an assistant

Replace `trove_…` with the token you just copied.

### Claude Code

```bash
claude mcp add --transport http trove \
  https://pxjqqogxemsmufopmlsv.supabase.co/functions/v1/mcp \
  --header "Authorization: Bearer trove_…"
```

### Cursor

Add this to `~/.cursor/mcp.json` (or the project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "trove": {
      "url": "https://pxjqqogxemsmufopmlsv.supabase.co/functions/v1/mcp",
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
      "url": "https://pxjqqogxemsmufopmlsv.supabase.co/functions/v1/mcp",
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
        "https://pxjqqogxemsmufopmlsv.supabase.co/functions/v1/mcp",
        "--header",
        "Authorization:Bearer trove_…"
      ]
    }
  }
}
```

### ChatGPT and Codex

If the connector form has a bearer-token or header field, use the server URL above and `Authorization: Bearer trove_…`.

Codex can send the header directly:

```toml
[mcp_servers.trove]
url = "https://pxjqqogxemsmufopmlsv.supabase.co/functions/v1/mcp"
http_headers = { Authorization = "Bearer trove_…" }
```

ChatGPT custom connectors often require OAuth. Trove does not offer OAuth yet. If the ChatGPT form will not take a bearer token, use Codex, Claude, or Cursor until OAuth ships.

### If the gateway asks for an API key

Some Supabase gateways also want the project's publishable anon key in an `apikey` header, in addition to `Authorization`. That key is already in the app. It is not a secret and it does not sign you in. The Trove token is what identifies you. Do not send the service role key.

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
| `update_task` | Change title, notes, status, priority, due date, assignee, tags, or the repeat rule. Priority sets the task's rank in the circle's overall order. Does not change the circle. |
| `complete_task` | Mark a task done. A repeating task stays done, and the database adds the next occurrence. |
| `assign_task` | Set or clear the assignee. The person must already be in that circle. |
| `move_task` | Move a task to another circle, including from your personal circle into a shared one. |
| `add_task_attachment` | Attach an image or video to a task you can edit. Returns the attachment id. |
| `list_members` | People in a circle: user id, display name, and role. No email addresses. |
| `invite_to_circle` | Invite someone by email. Owners and admins only. Returns a `trove://invite/…` link. |

Circle arguments are `circle_id`, `circle_name` (case-insensitive, must match one of yours), or `personal: true`. The name **Mine** is not a circle. Ask for `list_my_tasks`, or set `personal: true` for the private circle.

Statuses are `todo`, `in_progress`, and `done`. Priority is `low`, `medium`, or `high`. It is not a fixed level on the task: it chooses a rank in that circle's overall order. `high` places the task above the current top, `medium` between the two central tasks, and `low` or `null` at the bottom. New tasks with no priority start at the bottom. Lists return `rank`, a fractional index string. A larger rank sorts first. Order is rank (higher first), then due date (earliest first, no date last), then position and creation time. Due filters are `due_on`, `due_before`, and `due_after` as `YYYY-MM-DD`. Lists return 50 tasks unless you set `limit` (maximum 200).

Assignee is a member id, a display name (unique in that circle, case-insensitive), `"me"`, or `null`.

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

`complete_task`, or `update_task` with `status: done`, marks that row done. If it repeats, the database inserts the next To do occurrence with the same title, notes, priority, tags, circle, assignee, and rule. The new occurrence starts at the bottom of its due-date group, so it does not keep the completed row's rank. The tool result is the completed row, not the new one. List the circle again to see the next occurrence. Photos stay attached to both, because the new row points at the same file. `external_id` stays on the original row only.

`invite_to_circle` takes `email` and an optional `role` of `admin`, `member`, or `viewer` (default `member`). You cannot invite someone as owner. One pending invite per email per circle. The link expires in 14 days.

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

If the assignee is not a member of the destination, they are **unassigned**. They are not reassigned to you. If you move your own task into a circle you belong to, you stay assigned.

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

A bulk import that sends more than 100 tasks fails the whole call and inserts nothing. Split the list. If one item in a batch fails, earlier items in that batch are kept and the failure is reported.

## Security

- The token is hashed with SHA-256 before it is stored. Trove cannot show it again.
- Requests run as you. Row level security still applies. The server does not use a service role to skip membership checks.
- Revoke a token from Account → Connect an AI assistant. The next request with that token is rejected.
- Someone with your token can create circles, create, edit, complete, assign, and move tasks, set or clear a repeat rule, attach photos and videos to tasks you can edit, and invite people to circles you administer. Completing a repeating task creates the next occurrence. They cannot see tokens, email addresses of members, or circles you do not belong to. They cannot attach a file to a task they cannot edit, and they cannot set `recurrence_source_id`.
- OAuth is not available yet. Until it is, a personal access token is the only way in.

## Deploying the function

This is for the person who operates the Supabase project. It is not part of connecting an assistant.

Migration `0011_api_tokens_and_move_task.sql` is already applied. Apply `supabase/migrations/0012_api_token_limits.sql` before deploying this version of the function. Do not run the seed or `supabase/tests/bootstrap.sql` on the hosted project.

The function signs a one-hour user JWT locally and does not create an Auth session. It needs a signing secret you set yourself. Hosted Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`, and it rejects any function secret whose name starts with `SUPABASE_` (`Secret name must not start with the SUPABASE_ prefix`). Use the `TROVE_` names below. Do not commit the key.

The project's active Auth signing key is ES256. The legacy HS256 secret is `previously_used` and is still accepted for verification, so a token signed with it still works. The key that matches what Auth uses now is the ES256 private JWK you generated and imported (`kid` must match that key). Supabase will not export a private key it generated itself.

```bash
supabase secrets set TROVE_JWT_SIGNING_KEY='{"kty":"EC","kid":"…","crv":"P-256","x":"…","y":"…","d":"…"}'
supabase functions deploy mcp --no-verify-jwt
```

To sign with the legacy HS256 secret instead (Dashboard → Settings → API → JWT Settings):

```bash
supabase secrets set TROVE_JWT_SECRET="<legacy JWT secret>"
```

`TROVE_JWT_SIGNING_KEY` wins when both are set. Supported signing-key shapes are ES256 (P-256), RS256, and an `oct` HMAC JWK. Local `supabase functions serve` may still inject `SUPABASE_JWT_SECRET` or `SUPABASE_JWT_SIGNING_KEY`; those are read only when the `TROVE_` name is unset. They cannot be set on the hosted project.

`--no-verify-jwt` is required even though `config.toml` sets `verify_jwt = false`. If the gateway answers `Invalid JWT` before the function logs anything, verification is still on.

If none of those secrets is set, or PostgREST rejects the signature, a signed-in token gets HTTP 500 and a JSON-RPC error (`-32603`) whose message is `server_misconfigured`. A request with no Trove token still gets 401.
