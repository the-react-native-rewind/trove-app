import assert from 'node:assert/strict';
import { test } from 'node:test';

import { JSON_RPC_INTERNAL_ERROR, jsonRpcErrorBody, readJsonRpcId } from '../../supabase/functions/_shared/jsonRpc';

test('server failures keep the request id and use JSON-RPC -32603', () => {
  assert.equal(readJsonRpcId('{"jsonrpc":"2.0","id":7,"method":"tools/call"}'), 7);
  assert.equal(readJsonRpcId('{"jsonrpc":"2.0","id":"abc","method":"initialize"}'), 'abc');
  assert.equal(readJsonRpcId('[{"jsonrpc":"2.0","id":1}]'), null);
  assert.equal(readJsonRpcId('not json'), null);

  const body = JSON.parse(jsonRpcErrorBody(7, 'server_misconfigured'));
  assert.equal(body.jsonrpc, '2.0');
  assert.equal(body.id, 7);
  assert.deepEqual(body.error, { code: JSON_RPC_INTERNAL_ERROR, message: 'server_misconfigured' });
  assert.equal(JSON.parse(jsonRpcErrorBody(null, 'Internal error')).error.code, -32603);
});
