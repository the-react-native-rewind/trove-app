// Trove MCP server (Streamable HTTP).
//
// Auth is a personal access token created in the app (Account → Connect an
// AI assistant). verify_jwt is false: those tokens are not Supabase JWTs.
// Deploy with: supabase functions deploy mcp --no-verify-jwt
//
// Queries run as the token's user, so row level security still applies.

import { createMcpHandler, McpServer } from 'npm:@modelcontextprotocol/server@2.2.0';
import { z } from 'npm:zod@4.6.5';

import { readBearerToken } from '../_shared/apiToken.ts';
import { jsonRpcErrorBody, readJsonRpcId } from '../_shared/jsonRpc.ts';
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
import { ServerMisconfiguredError } from '../_shared/userJwt.ts';
import { authenticate } from './auth.ts';
import { supabaseStore } from './store.ts';

const SERVER_VERSION = '1.0.0';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'mcp-session-id',
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

const statusField = z.enum(['todo', 'in_progress', 'done']).optional().describe('todo, in_progress, or done.');

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
  assignee: z
    .string()
    .nullable()
    .optional()
    .describe('A member id, a display name, "me", or null. Defaults to you on create.'),
  due_date: z.string().nullable().optional().describe('Due date as YYYY-MM-DD, or null.'),
  tags: z.array(z.string()).optional().describe('Label names in this circle. Created if they do not exist yet.'),
  status: statusField,
  priority: z.enum(['low', 'medium', 'high']).nullable().optional().describe('low, medium, high, or null.'),
  external_id: z
    .string()
    .optional()
    .describe('Stable id from the source (a Notion page id or Trello card id). Repeating it will not create a duplicate.'),
  ...repeatFields,
});

const handler = createMcpHandler((ctx) => {
  const store = ctx.authInfo?.extra?.store;
  if (!isStore(store)) throw new Error('Not authenticated');
  return buildServer(store);
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  const rpcId = await requestRpcId(req);
  const token = readBearerToken(req.headers.get('Authorization'));
  if (!token) return unauthorized();

  try {
    const caller = await authenticate(token);
    if (!caller) return unauthorized();
    const store = await supabaseStore(caller.userId, caller.accessToken);
    const response = await handler.fetch(req, {
      authInfo: {
        token: token.slice(0, 12),
        clientId: caller.userId,
        scopes: ['trove'],
        extra: { store },
      },
    });
    return withCors(response);
  } catch (error) {
    console.error('mcp request failed', error instanceof Error ? error.message : error);
    const message = error instanceof ServerMisconfiguredError ? 'server_misconfigured' : 'Internal error';
    return withCors(jsonRpcError(rpcId, message));
  }
});

function buildServer(store: TroveStore): McpServer {
  const server = new McpServer({ name: 'trove', version: SERVER_VERSION, title: 'Trove' });

  server.registerTool(
    'list_circles',
    { description: toolDescriptions.list_circles, annotations: { readOnlyHint: true } },
    async () => asTool(await listCircles(store)),
  );

  server.registerTool(
    'get_circle',
    {
      description: toolDescriptions.get_circle,
      annotations: { readOnlyHint: true },
      inputSchema: z.object(circleTarget),
    },
    async (args) => asTool(await getCircle(store, args)),
  );

  server.registerTool(
    'create_circle',
    {
      description: toolDescriptions.create_circle,
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
      description: toolDescriptions.list_my_tasks,
      annotations: { readOnlyHint: true },
      inputSchema: z.object({ ...circleTarget, status: statusField, ...dueFields, limit: limitField }),
    },
    async (args) => asTool(await listMyTasks(store, args)),
  );

  server.registerTool(
    'list_circle_tasks',
    {
      description: toolDescriptions.list_circle_tasks,
      annotations: { readOnlyHint: true },
      inputSchema: z.object({ ...circleTarget, status: statusField, ...dueFields, limit: limitField }),
    },
    async (args) => asTool(await listCircleTasks(store, args)),
  );

  server.registerTool(
    'create_task',
    { description: toolDescriptions.create_task, inputSchema: taskInput },
    async (args) => asTool(await createTask(store, args)),
  );

  server.registerTool(
    'create_tasks_bulk',
    {
      description: toolDescriptions.create_tasks_bulk,
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
      description: toolDescriptions.update_task,
      inputSchema: z.object({
        task_id: z.string().uuid(),
        title: z.string().optional(),
        notes: z.string().nullable().optional(),
        status: statusField,
        priority: z.enum(['low', 'medium', 'high']).nullable().optional(),
        due_date: z.string().nullable().optional(),
        assignee: z.string().nullable().optional().describe('Member id, display name, "me", or null.'),
        tags: z.array(z.string()).optional().describe('Replaces the task\'s tags. An empty array clears them.'),
        ...repeatFields,
      }),
    },
    async (args) => asTool(await updateTask(store, args)),
  );

  server.registerTool(
    'complete_task',
    {
      description: toolDescriptions.complete_task,
      inputSchema: z.object({ task_id: z.string().uuid() }),
    },
    async (args) => asTool(await completeTask(store, args)),
  );

  server.registerTool(
    'assign_task',
    {
      description: toolDescriptions.assign_task,
      inputSchema: z.object({
        task_id: z.string().uuid(),
        assignee: z.string().nullable().describe('Member id, display name, "me", or null to unassign.'),
      }),
    },
    async (args) => asTool(await assignTask(store, args)),
  );

  server.registerTool(
    'move_task',
    {
      description: toolDescriptions.move_task,
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
      description: toolDescriptions.add_task_attachment,
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
      description: toolDescriptions.list_members,
      annotations: { readOnlyHint: true },
      inputSchema: z.object(circleTarget),
    },
    async (args) => asTool(await listMembers(store, args)),
  );

  server.registerTool(
    'invite_to_circle',
    {
      description: toolDescriptions.invite_to_circle,
      inputSchema: z.object({
        ...circleTarget,
        email: z.string().describe('Email address to invite.'),
        role: z.enum(['admin', 'member', 'viewer']).optional().describe('Defaults to member.'),
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

function unauthorized(): Response {
  return new Response(
    JSON.stringify({
      error: 'invalid_token',
      error_description:
        'Send a Trove personal access token as Authorization: Bearer trove_… Create one in the app under Account → Connect an AI assistant.',
    }),
    {
      status: 401,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer realm="trove", error="invalid_token"',
      },
    },
  );
}

function jsonRpcError(id: string | number | null, message: string): Response {
  return new Response(jsonRpcErrorBody(id, message), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
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
