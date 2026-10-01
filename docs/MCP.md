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
4. You can keep up to 20 active tokens. Revoke one you no longer use. Revoking takes effect immediately and cannot be undone.

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
| `list_my_tasks` | Tasks assigned to you (Mine), across circles. Filter by circle, status, or due date. |
| `list_circle_tasks` | Every task in one circle, including ones assigned to other people. |
| `create_task` | Create a task. Omit the circle and it goes in your personal circle, assigned to you. |
| `create_tasks_bulk` | Create up to 100 tasks. Safe to retry when each item has an `external_id`. |
| `update_task` | Change title, notes, status, priority, due date, assignee, or tags. Does not change the circle. |
| `complete_task` | Mark a task done. |
| `assign_task` | Set or clear the assignee. The person must already be in that circle. |
| `move_task` | Move a task to another circle, including from your personal circle into a shared one. |
| `list_members` | People in a circle: user id, display name, and role. No email addresses. |
| `invite_to_circle` | Invite someone by email. Owners and admins only. Returns a `trove://invite/…` link. |

Circle arguments are `circle_id`, `circle_name` (case-insensitive, must match one of yours), or `personal: true`. The name **Mine** is not a circle. Ask for `list_my_tasks`, or set `personal: true` for the private circle.

Statuses are `todo`, `in_progress`, and `done`. Priority is `low`, `medium`, or `high`. Due filters are `due_on`, `due_before`, and `due_after` as `YYYY-MM-DD`. Lists return 50 tasks unless you set `limit` (maximum 200).

Assignee is a member id, a display name (unique in that circle, case-insensitive), `"me"`, or `null`.

Tags are labels that belong to one circle. Naming a tag creates it if needed. On `update_task`, `tags` replaces the whole set. An empty array clears them.

`external_id` is a stable id from the source, such as a Notion page id or a Trello card id (1–200 characters). If you already created a task with that id, a later call returns that task and does not change it.

`invite_to_circle` takes `email` and an optional `role` of `admin`, `member`, or `viewer` (default `member`). You cannot invite someone as owner. One pending invite per email per circle. The link expires in 14 days.

## Moving a task

`move_task` is the only way to change a task's circle. `update_task` will not do it, and a direct edit of the circle is rejected.

You must be able to edit the task where it is now (owner, admin, or member). A viewer of the source circle cannot move it. You must belong to the destination. A viewer of the destination can still receive a task.

If the assignee is not a member of the destination, they are **unassigned**. They are not reassigned to you. If you move your own task into a circle you belong to, you stay assigned.

Tags from the old circle are removed. Photos and videos stay behind: they remain stored under the original circle and people who cannot see that circle cannot open them.

## Example prompts

- "What circles am I in?"
- "Show my Mine list that is due this week."
- "Add 'Call the plumber' to my personal circle, due Friday, assigned to me."
- "Move everything in my Notion house list into my House circle. Use each Notion page id as external_id so we can run this twice."
- "Move 'Sketch the spring menu' from my personal circle into Household, and assign it to Sam."
- "Invite sam@example.com to House as a member."

A bulk import that sends more than 100 tasks fails the whole call and inserts nothing. Split the list. If one item in a batch fails, earlier items in that batch are kept and the failure is reported.

## Security

- The token is hashed with SHA-256 before it is stored. Trove cannot show it again.
- Requests run as you. Row level security still applies. The server does not use a service role to skip membership checks.
- Revoke a token from Account → Connect an AI assistant. The next request with that token is rejected.
- Someone with your token can create, edit, complete, assign, and move tasks, and can invite people to circles you administer. They cannot see tokens, email addresses of members, or circles you do not belong to.
- OAuth is not available yet. Until it is, a personal access token is the only way in.

## Deploying the function

This is for the person who operates the Supabase project. It is not part of connecting an assistant.

1. Apply `supabase/migrations/0011_api_tokens_and_move_task.sql` to the hosted project. Migrations 0001–0010 are already applied. Do not run the seed or `supabase/tests/bootstrap.sql` on that project.
2. Deploy the function with JWT verification off:

```bash
supabase functions deploy mcp --no-verify-jwt
```

3. No new secrets are required. Hosted Supabase injects the project URL, anon key, and service role key. If `SUPABASE_JWT_SECRET` is present it is used to mint a user JWT; otherwise the function creates a short-lived session for the token's user.
4. Confirm the URL above returns 401, with no body, when called without a token. A response of `Invalid JWT` means the gateway is still verifying JWTs. Redeploy with `--no-verify-jwt`.
