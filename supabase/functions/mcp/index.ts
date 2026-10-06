// Trove MCP server (Streamable HTTP, stateless).
//
// Callers send either a personal access token (trove_…) or a Supabase Auth
// OAuth access token. verify_jwt is false so the gateway lets the OAuth
// discovery request through. Deploy with:
//   supabase functions deploy mcp --no-verify-jwt
//
// Queries run as that person, so row level security still applies. Personal
// tokens are exchanged for a one-hour user JWT. OAuth tokens are already
// user JWTs and are used as-is after signature, issuer, audience, and
// client_id checks.

import { createMcpHandler, McpServer } from 'npm:@modelcontextprotocol/server@2.2.0';
import { z } from 'npm:zod@4.6.5';

import { loadSupabaseJwks, verifySupabaseAccessJwt } from '../_shared/accessJwt.ts';
import { readMcpAuthorization } from '../_shared/apiToken.ts';
import { jsonRpcErrorBody, mcpTransportError, readJsonRpcId, rewriteInternalErrorBody } from '../_shared/jsonRpc.ts';
import { SERVER_VERSION, mcpImplementation, toolMetadata, type ToolMetadata } from '../_shared/mcpMeta.ts';
import {
  authorizationServerIssuer,
  canonicalMcpResourceUrl,
  isProtectedResourceMetadataPath,
  protectedResourceMetadata,
  resourceMetadataUrl,
  wwwAuthenticate,
} from '../_shared/oauthResource.ts';
import { DEFAULT_SITE_URL } from '../_shared/site.ts';
import {
  addTaskAttachment,
  assignTask,
  completeTask,
  createCircle,
  createTask,
  createTasksBulk,
  getCircle,
  inviteToCircle,
  listCircleTasks,
  listCircles,
  listMembers,
  listMyTasks,
  moveTask,
  toolDescriptions,
  type TaskMediaContentType,
  updateTask,
  type ToolResult,
  type TroveStore,
} from '../_shared/mcpTools.ts';
import { authenticate } from './auth.ts';
import { supabaseStore } from './store.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'mcp-session-id, www-authenticate',
};

const UNAUTHORIZED_DESCRIPTION =
  'Send Authorization: Bearer with a Trove personal token (trove_...) or a Supabase OAuth access token. Create a personal token in the app under Account, Connect an AI assistant, or approve the connection at the OAuth consent page.';

export type McpCaller = {
  userId: string;
  accessToken: string;
  clientId: string;
  scopes: string[];
  expiresAt?: number;
};

export type McpDeps = {
  resourceUrl: string;
  authorizationServerUrl: string;
  siteUrl: string;
  documentationUrl: string;
  authenticatePersonal: (token: string) => Promise<McpCaller | null>;
  authenticateOauth: (token: string) => Promise<McpCaller | null>;
  openStore: (userId: string, accessToken: string) => Promise<TroveStore>;
};

const circleTarget = {
  circle_id: z.string().uuid().optional().describe('Circle id from list_circles.'),
  circle_name: z
    .string()
    .optional()
    .describe('Circle name. Case-insensitive. Must match one circle you belong to. "Mine" is not a circle.'),
  personal: z.boolean().optional().describe('Use your private personal circle.'),
};

const dueFields = {
  due_on: z.string().optional().describe('Only tasks due on this date (YYYY-MM-DD).'),
  due_before: z.string().optional().describe('Only tasks due on or before this date (YYYY-MM-DD).'),
  due_after: z.string().optional().describe('Only tasks due on or after this date (YYYY-MM-DD).'),
};

const statusField = z
  .enum(['todo', 'done'])
  .optional()
  .describe('todo or done. Doing is no longer a status.');

const assigneeFields = {
  assignee: z
    .string()
    .nullable()
    .optional()
    .describe('One member id, display name, "me", or null. Replaces the whole set. Pass assignee or assignees, not both.'),
  assignees: z
    .array(z.string())
    .nullable()
    .optional()
    .describe('Member ids, display names, or "me". Replaces the whole set. An empty list unassigns. Pass assignee or assignees, not both.'),
};

const repeatFields = {
  repeat_unit: z
    .enum(['day', 'week', 'month', 'never'])
    .nullable()
    .optional()
    .describe('day, week, month, never, or null. never and null clear the rule. Omit it on update to leave the rule unchanged.'),
  repeat_interval: z
    .number()
    .int()
    .min(1)
    .max(99)
    .optional()
    .describe('How many days, weeks, or months between occurrences. 1 to 99. Defaults to 1.'),
  repeat_weekday: z
    .number()
    .int()
    .min(0)
    .max(6)
    .nullable()
    .optional()
    .describe('0 = Sunday through 6 = Saturday. Used when repeat_unit is week. Omit it and the due date, or today (UTC), is used.'),
};

const taskInput = z.object({
  title: z.string().describe('What needs doing.'),
  notes: z.string().nullable().optional().describe('Longer notes. Stored as the task description.'),
  ...circleTarget,
  ...assigneeFields,
  due_date: z.string().nullable().optional().describe('Due date as YYYY-MM-DD, or null.'),
  tags: z.array(z.string()).optional().describe('Label names in this circle. Created if they do not exist yet.'),
  status: statusField,
  priority: z
    .enum(['low', 'medium', 'high'])
    .nullable()
    .optional()
    .describe('Places rank in the circle\'s overall order: high above the top, medium in the middle, low or null at the bottom.'),
  external_id: z
    .string()
    .optional()
    .describe('Stable id from the source (a Notion page id or Trello card id). Repeating it will not create a duplicate.'),
  ...repeatFields,
});

const handler = createMcpHandler((ctx) => {
  const store = ctx.authInfo?.extra?.store;
  const siteUrl = ctx.authInfo?.extra?.siteUrl;
  if (!isStore(store)) throw new Error('Not authenticated');
  return buildServer(store, typeof siteUrl === 'string' ? siteUrl : DEFAULT_SITE_URL);
});

export async function handleMcpRequest(req: Request, deps?: McpDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  let resolved: McpDeps;
  try {
    resolved = deps ?? productionDeps();
  } catch (error) {
    console.error('mcp is not configured', error instanceof Error ? error.message : error);
    const failure = mcpTransportError(error);
    return withCors(jsonRpcError(await requestRpcId(req), failure.message, failure.reason));
  }
  return dispatchMcp(req, resolved);
}

async function dispatchMcp(req: Request, deps: McpDeps): Promise<Response> {

  const url = new URL(req.url);
  if (isProtectedResourceMetadataPath(url.pathname)) {
    if (req.method !== 'GET') {
      return withCors(new Response(null, { status: 405, headers: { allow: 'GET, OPTIONS' } }));
    }
    return withCors(metadataResponse(deps));
  }

  const rpcId = await requestRpcId(req);
  const credential = readMcpAuthorization(req.headers.get('Authorization'));
  if (!credential) return unauthorized(deps);

  try {
    const caller = credential.kind === 'personal'
      ? await deps.authenticatePersonal(credential.token)
      : await deps.authenticateOauth(credential.token);
    if (!caller) return unauthorized(deps);
    const store = await deps.openStore(caller.userId, caller.accessToken);
    const response = await handler.fetch(req, {
      authInfo: {
        token: credential.token.slice(0, 12),
        clientId: caller.clientId,
        scopes: caller.scopes,
        expiresAt: caller.expiresAt,
        extra: { store, siteUrl: deps.siteUrl },
      },
    });
    return withCors(await actionable(response, rpcId));
  } catch (error) {
    console.error('mcp request failed', error instanceof Error ? error.message : error);
    const failure = mcpTransportError(error);
    return withCors(jsonRpcError(rpcId, failure.message, failure.reason));
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleMcpRequest(req));
}

function buildServer(store: TroveStore, siteUrl: string): McpServer {
  const server = new McpServer(mcpImplementation(siteUrl, SERVER_VERSION));

  server.registerTool(
    'list_circles',
    described('list_circles'),
    async () => asTool(await listCircles(store)),
  );

  server.registerTool(
    'get_circle',
    {
      ...described('get_circle'),
      inputSchema: z.object(circleTarget),
    },
    async (args) => asTool(await getCircle(store, args)),
  );

  server.registerTool(
    'create_circle',
    {
      ...described('create_circle'),
      inputSchema: z.object({
        name: z.string().describe('Circle name, such as Home or Garden.'),
        color: z
          .string()
          .optional()
          .describe(
            'Accent colour: sage, brand, moss, teal, dusk, lilac, plum, rose, terracotta, clay, ochre, honey, or #rrggbb. Defaults to sage.',
          ),
      }),
    },
    async (args) => asTool(await createCircle(store, args)),
  );

  server.registerTool(
    'list_my_tasks',
    {
      ...described('list_my_tasks'),
      inputSchema: z.object({ ...circleTarget, status: statusField, ...dueFields, limit: limitField }),
    },
    async (args) => asTool(await listMyTasks(store, args)),
  );

  server.registerTool(
    'list_circle_tasks',
    {
      ...described('list_circle_tasks'),
      inputSchema: z.object({ ...circleTarget, status: statusField, ...dueFields, limit: limitField }),
    },
    async (args) => asTool(await listCircleTasks(store, args)),
  );

  server.registerTool(
    'create_task',
    { ...described('create_task'), inputSchema: taskInput },
    async (args) => asTool(await createTask(store, args)),
  );

  server.registerTool(
    'create_tasks_bulk',
    {
      ...described('create_tasks_bulk'),
      inputSchema: z.object({
        ...circleTarget,
        tasks: z.array(taskInput).min(1).max(100).describe('Up to 100 tasks. A circle on this call is the default.'),
      }),
    },
    async (args) => asTool(await createTasksBulk(store, args)),
  );

  server.registerTool(
    'update_task',
    {
      ...described('update_task'),
      inputSchema: z.object({
        task_id: z.string().uuid(),
        title: z.string().optional(),
        notes: z.string().nullable().optional(),
        status: statusField,
        priority: z
          .enum(['low', 'medium', 'high'])
          .nullable()
          .optional()
          .describe('For an owner or admin, sets rank in the circle\'s overall order: high above the current top, medium in the middle, low or null at the bottom. A member can set this label but cannot change rank.'),
        due_date: z.string().nullable().optional(),
        ...assigneeFields,
        tags: z.array(z.string()).optional().describe('Replaces the task\'s tags. An empty array clears them.'),
        ...repeatFields,
      }),
    },
    async (args) => asTool(await updateTask(store, args)),
  );

  server.registerTool(
    'complete_task',
    {
      ...described('complete_task'),
      inputSchema: z.object({ task_id: z.string().uuid() }),
    },
    async (args) => asTool(await completeTask(store, args)),
  );

  server.registerTool(
    'assign_task',
    {
      ...described('assign_task'),
      inputSchema: z.object({
        task_id: z.string().uuid(),
        assignee: assigneeFields.assignee.describe('Member id, display name, "me", or null. Replaces the whole set.'),
        assignees: assigneeFields.assignees,
      }),
    },
    async (args) => asTool(await assignTask(store, args)),
  );

  server.registerTool(
    'move_task',
    {
      ...described('move_task'),
      inputSchema: z.object({
        task_id: z.string().uuid(),
        ...circleTarget,
      }),
    },
    async (args) => asTool(await moveTask(store, args)),
  );

  server.registerTool(
    'add_task_attachment',
    {
      ...described('add_task_attachment'),
      inputSchema: z.object({
        task_id: z.string().uuid().describe('Task to attach the file to.'),
        url: z
          .string()
          .optional()
          .describe('Public or signed https URL. The server downloads it. Pass this or data_base64, not both.'),
        data_base64: z
          .string()
          .optional()
          .describe('Raw base64 file bytes. Do not include a data: URL prefix.'),
        content_type: z.enum(mediaContentTypes).describe('MIME type. Must match the file bytes.'),
        filename: z
          .string()
          .optional()
          .describe('Original filename. Only a matching extension is kept; the stored name is a random id.'),
      }),
    },
    async (args) => asTool(await addTaskAttachment(store, args)),
  );

  server.registerTool(
    'list_members',
    {
      ...described('list_members'),
      inputSchema: z.object(circleTarget),
    },
    async (args) => asTool(await listMembers(store, args)),
  );

  server.registerTool(
    'invite_to_circle',
    {
      ...described('invite_to_circle'),
      inputSchema: z.object({
        ...circleTarget,
        email: z.string().describe('Email address to invite.'),
        role: z.enum(['admin', 'member', 'viewer']).optional().describe('Defaults to member.'),
        agent: z
          .boolean()
          .optional()
          .describe('Mark this invite as an agent (a bot). Defaults to false, a human invite. Copied onto the membership when they join.'),
      }),
    },
    async (args) => asTool(await inviteToCircle(store, args)),
  );

  return server;
}

const mediaContentTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const satisfies readonly TaskMediaContentType[];

const limitField = z
  .number()
  .int()
  .min(1)
  .max(200)
  .optional()
  .describe('How many tasks to return. Default 50, maximum 200.');

function asTool(result: ToolResult<unknown>) {
  if (!result.ok) {
    return { isError: true as const, content: [{ type: 'text' as const, text: result.error }] };
  }
  return { content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }] };
}

function isStore(value: unknown): value is TroveStore {
  return value != null && typeof value === 'object' && 'listCircles' in value && 'userId' in value;
}

function described(name: keyof typeof toolMetadata) {
  const meta: ToolMetadata = toolMetadata[name];
  return {
    title: meta.title,
    description: toolDescriptions[name],
    annotations: {
      title: meta.title,
      readOnlyHint: meta.readOnlyHint,
      destructiveHint: meta.destructiveHint,
      idempotentHint: meta.idempotentHint,
      openWorldHint: meta.openWorldHint,
    },
  };
}

function productionDeps(): McpDeps {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const siteUrl = (Deno.env.get('TROVE_SITE_URL') ?? DEFAULT_SITE_URL).replace(/\/$/, '');
  const resourceUrl = canonicalMcpResourceUrl({
    resourceUrl: Deno.env.get('TROVE_MCP_RESOURCE_URL'),
    supabaseUrl,
  });
  return {
    resourceUrl,
    authorizationServerUrl: authorizationServerIssuer(supabaseUrl),
    siteUrl,
    documentationUrl: `${siteUrl}/docs/mcp`,
    authenticatePersonal: async (token) => {
      const caller = await authenticate(token);
      if (!caller) return null;
      return { userId: caller.userId, accessToken: caller.accessToken, clientId: caller.userId, scopes: ['trove'] };
    },
    authenticateOauth: async (token) => {
      const jwks = await loadSupabaseJwks(supabaseUrl);
      const verified = await verifySupabaseAccessJwt(token, { supabaseUrl, resource: resourceUrl, jwks });
      if (!verified.ok) return null;
      return {
        userId: verified.userId,
        accessToken: token,
        clientId: verified.clientId,
        scopes: verified.scopes,
        expiresAt: verified.expiresAt,
      };
    },
    openStore: (userId, accessToken) => supabaseStore(userId, accessToken),
  };
}

function metadataResponse(deps: McpDeps): Response {
  const body = protectedResourceMetadata({
    resourceUrl: deps.resourceUrl,
    authorizationServerUrl: deps.authorizationServerUrl,
    documentationUrl: deps.documentationUrl,
  });
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
  });
}

function unauthorized(deps: McpDeps): Response {
  return new Response(
    JSON.stringify({ error: 'invalid_token', error_description: UNAUTHORIZED_DESCRIPTION }),
    {
      status: 401,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'WWW-Authenticate': wwwAuthenticate({
          resourceMetadataUrl: resourceMetadataUrl(deps.resourceUrl),
          error: 'invalid_token',
          description: UNAUTHORIZED_DESCRIPTION,
        }),
      },
    },
  );
}

function jsonRpcError(id: string | number | null, message: string, reason: string): Response {
  return new Response(jsonRpcErrorBody(id, message, { reason }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function actionable(response: Response, rpcId: string | number | null): Promise<Response> {
  if (response.status < 500) return response;
  const body = await response.text();
  const rewritten = rewriteInternalErrorBody(response.status, body, rpcId);
  if (!rewritten) {
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  return new Response(rewritten, { status: 500, headers: { 'Content-Type': 'application/json' } });
}

async function requestRpcId(req: Request): Promise<string | number | null> {
  if (req.method !== 'POST') return null;
  try {
    return readJsonRpcId(await req.clone().text());
  } catch {
    return null;
  }
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
