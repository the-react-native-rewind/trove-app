import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  JSON_RPC_INTERNAL_ERROR,
  MCP_MISCONFIGURED_MESSAGE,
  MCP_UNEXPECTED_MESSAGE,
  jsonRpcErrorBody,
  mcpTransportError,
  readJsonRpcId,
  rewriteInternalErrorBody,
} from '../../supabase/functions/_shared/jsonRpc';
import { ServerMisconfiguredError } from '../../supabase/functions/_shared/userJwt';

test('server failures keep the request id and use JSON-RPC -32603', () => {
  assert.equal(readJsonRpcId('{"jsonrpc":"2.0","id":7,"method":"tools/call"}'), 7);
  assert.equal(readJsonRpcId('{"jsonrpc":"2.0","id":"abc","method":"initialize"}'), 'abc');
  assert.equal(readJsonRpcId('[{"jsonrpc":"2.0","id":1}]'), null);
  assert.equal(readJsonRpcId('not json'), null);

  const body = JSON.parse(jsonRpcErrorBody(7, MCP_MISCONFIGURED_MESSAGE, { reason: 'server_misconfigured' }));
  assert.equal(body.jsonrpc, '2.0');
  assert.equal(body.id, 7);
  assert.equal(body.error.code, JSON_RPC_INTERNAL_ERROR);
  assert.equal(body.error.message, MCP_MISCONFIGURED_MESSAGE);
  assert.equal(body.error.data.reason, 'server_misconfigured');
  assert.equal(JSON.parse(jsonRpcErrorBody(null, 'Internal error')).error.code, -32603);
});

test('unexpected server failures become an actionable JSON-RPC error', () => {
  const failure = mcpTransportError(new ServerMisconfiguredError());
  assert.equal(failure.reason, 'server_misconfigured');
  assert.equal(/TROVE_JWT_SIGNING_KEY/.test(failure.message), true);
  assert.equal(mcpTransportError(new Error('relation "secrets" does not exist')).reason, 'internal_error');

  const bare = rewriteInternalErrorBody(500, 'Internal error', 4);
  const sdk = rewriteInternalErrorBody(500, JSON.stringify({
    jsonrpc: '2.0',
    id: 4,
    error: { code: -32603, message: 'Internal server error' },
  }), 4);
  assert.ok(bare);
  const parsed = JSON.parse(bare!);
  assert.equal(parsed.id, 4);
  assert.equal(parsed.error.message, MCP_UNEXPECTED_MESSAGE);
  assert.equal(parsed.error.data.reason, 'internal_error');
  assert.equal(parsed.error.message.includes('relation'), false);
  assert.ok(sdk);
  assert.equal(JSON.parse(sdk!).error.message, MCP_UNEXPECTED_MESSAGE);

  const legacy = rewriteInternalErrorBody(500, JSON.stringify({
    jsonrpc: '2.0',
    id: 4,
    error: { code: -32603, message: 'server_misconfigured' },
  }), 4);
  assert.ok(legacy);
  assert.equal(JSON.parse(legacy!).error.data.reason, 'server_misconfigured');

  const kept = rewriteInternalErrorBody(500, JSON.stringify({
    jsonrpc: '2.0',
    id: 4,
    error: { code: -32603, message: 'Tool input failed validation', data: { reason: 'invalid_params' } },
  }), 4);
  assert.equal(kept, null);
  assert.equal(rewriteInternalErrorBody(200, 'ok', 1), null);
});
