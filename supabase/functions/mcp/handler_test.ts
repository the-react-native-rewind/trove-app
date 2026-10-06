/**
 * HTTP shell of the MCP function, with the auth and database swapped out.
 * Run: deno test --allow-net supabase/functions/mcp/handler_test.ts
 */
import { assert, assertEquals } from 'jsr:@std/assert@1';

import { handleMcpRequest, type McpDeps } from './index.ts';
import { ServerMisconfiguredError } from '../_shared/userJwt.ts';
import type { TroveStore } from '../_shared/mcpTools.ts';

const RESOURCE = 'https://mcp.example.com';
const USER = '11111111-1111-4111-8111-111111111111';
const PERSONAL = 'trove_abcdefghijklmnopqrstuvwxyz';

function deps(overrides: Partial<McpDeps> = {}): McpDeps {
  return {
    resourceUrl: RESOURCE,
    authorizationServerUrl: 'https://example.supabase.co/auth/v1',
    siteUrl: 'https://trove-website-sooty.vercel.app',
    documentationUrl: 'https://trove-website-sooty.vercel.app/docs/mcp',
    authenticatePersonal: async () => ({
      userId: USER,
      accessToken: 'minted-user-jwt',
      clientId: USER,
      scopes: ['trove'],
    }),
    authenticateOauth: async () => null,
    openStore: async () => stubStore(),
    ...overrides,
  };
}

function stubStore(): TroveStore {
  const unused = async () => {
    throw new Error('not used');
  };
  return {
    userId: USER,
    listCircles: async () => [],
    listMembers: unused,
    listTasks: unused,
    getTask: unused,
    findByExternalId: unused,
    insertTask: unused,
    updateTask: unused,
    moveTask: unused,
    createInvite: unused,
    countRecentInvites: async () => 0,
    createCircle: unused,
    addTaskAttachment: unused,
  } as TroveStore;
}

function rpc(method: string, token?: string, id: number = 1): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(`${RESOURCE}/`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id, method }),
  });
}

async function readBody(response: Response): Promise<{ json: Record<string, unknown>; text: string }> {
  const text = await response.text();
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return { json: JSON.parse(trimmed), text };
  const data = trimmed
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter((line) => line.length > 0 && line !== '[DONE]');
  const last = data.at(-1);
  if (!last) throw new Error(`No JSON in ${response.status} body: ${text.slice(0, 500)}`);
  return { json: JSON.parse(last), text };
}

Deno.test('protected resource metadata is served and 401 points at it', async () => {
  const metadata = await handleMcpRequest(
    new Request(`${RESOURCE}/.well-known/oauth-protected-resource`, { method: 'GET' }),
    deps(),
  );
  assertEquals(metadata.status, 200);
  const body = await metadata.json();
  assertEquals(body.resource, RESOURCE);
  assertEquals(body.authorization_servers, ['https://example.supabase.co/auth/v1']);
  assertEquals(body.resource_name, 'Trove');

  const missing = await handleMcpRequest(rpc('tools/list'), deps());
  assertEquals(missing.status, 401);
  const challenge = missing.headers.get('www-authenticate') ?? '';
  assert(challenge.includes(`resource_metadata="${RESOURCE}/.well-known/oauth-protected-resource"`), challenge);
  assert(!challenge.includes('error='), challenge);

  const rejected = await handleMcpRequest(rpc('tools/list', 'not-a-token'), deps());
  assertEquals(rejected.status, 401);
  const rejectedChallenge = rejected.headers.get('www-authenticate') ?? '';
  assert(rejectedChallenge.includes(`resource_metadata="${RESOURCE}/.well-known/oauth-protected-resource"`), rejectedChallenge);
  assert(rejectedChallenge.includes('error="invalid_token"'), rejectedChallenge);

  const wrongMethod = await handleMcpRequest(
    new Request(`${RESOURCE}/.well-known/oauth-protected-resource`, { method: 'POST' }),
    deps(),
  );
  assertEquals(wrongMethod.status, 405);
});

Deno.test('tools/list advertises a title and hints, and a personal token still authenticates', async () => {
  let personal = 0;
  let oauth = 0;
  const response = await handleMcpRequest(
    rpc('tools/list', PERSONAL),
    deps({
      authenticatePersonal: async (token) => {
        personal += 1;
        assertEquals(token, PERSONAL);
        return { userId: USER, accessToken: 'minted-user-jwt', clientId: USER, scopes: ['trove'] };
      },
      authenticateOauth: async () => {
        oauth += 1;
        return null;
      },
    }),
  );
  assertEquals(response.status, 200);
  const { json } = await readBody(response);
  const result = json.result as { tools?: Array<Record<string, unknown>> };
  const tools = result.tools ?? [];
  assertEquals(tools.length, 14);
  const invite = tools.find((tool) => tool.name === 'invite_to_circle');
  assert(invite, 'invite_to_circle missing');
  assertEquals(invite.title, 'Invite to a circle');
  const annotations = invite.annotations as Record<string, unknown>;
  assertEquals(annotations.readOnlyHint, false);
  assertEquals(annotations.destructiveHint, false);
  assertEquals(annotations.openWorldHint, true);
  assertEquals(annotations.idempotentHint, false);
  assert(String(invite.description).includes('email'), String(invite.description));

  const complete = tools.find((tool) => tool.name === 'complete_task');
  const completeAnnotations = complete?.annotations as Record<string, unknown>;
  assertEquals(completeAnnotations.destructiveHint, false);
  assertEquals(completeAnnotations.idempotentHint, true);

  const listed = tools.find((tool) => tool.name === 'list_circles');
  const listedAnnotations = listed?.annotations as Record<string, unknown>;
  assertEquals(listedAnnotations.readOnlyHint, true);
  assertEquals(listedAnnotations.destructiveHint, false);
  assertEquals(personal, 1);
  assertEquals(oauth, 0);
});

Deno.test('an OAuth-shaped bearer is checked as an access token, not as a personal token', async () => {
  let kind = '';
  const token = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature';
  const response = await handleMcpRequest(
    rpc('tools/list', token),
    deps({
      authenticatePersonal: async () => {
        kind = 'personal';
        return null;
      },
      authenticateOauth: async (received) => {
        kind = 'oauth';
        assertEquals(received, token);
        return { userId: USER, accessToken: token, clientId: 'client-1', scopes: ['openid'], expiresAt: 1_700_003_600 };
      },
    }),
  );
  assertEquals(response.status, 200);
  assertEquals(kind, 'oauth');
});

Deno.test('initialize returns the server card', async () => {
  const response = await handleMcpRequest(
    new Request(`${RESOURCE}/`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${PERSONAL}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'handler-test', version: '0' },
        },
      }),
    }),
    deps(),
  );
  assertEquals(response.status, 200);
  const { json } = await readBody(response);
  const result = json.result as { serverInfo?: Record<string, unknown> };
  assertEquals(result.serverInfo?.title, 'Trove');
  assertEquals(result.serverInfo?.websiteUrl, 'https://trove-website-sooty.vercel.app');
  const icons = result.serverInfo?.icons as Array<{ src?: string }> | undefined;
  assert(icons && icons.length >= 1, JSON.stringify(result.serverInfo));
  assert(String(icons[0]?.src).includes('apple-touch-icon.png'));
});

Deno.test('a missing signing key is an actionable JSON-RPC error', async () => {
  const response = await handleMcpRequest(
    rpc('tools/list', PERSONAL, 9),
    deps({
      authenticatePersonal: async () => {
        throw new ServerMisconfiguredError();
      },
    }),
  );
  assertEquals(response.status, 500);
  const { json } = await readBody(response);
  const error = json.error as { message?: string; data?: { reason?: string } };
  assert(String(error.message).includes('TROVE_JWT_SIGNING_KEY'), String(error.message));
  assertEquals(error.data?.reason, 'server_misconfigured');
  assert(!String(error.message).includes('Internal error'));
});
