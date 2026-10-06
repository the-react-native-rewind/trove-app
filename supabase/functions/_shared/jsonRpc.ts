/** JSON-RPC 2.0 error used when the MCP server fails before a tool result. */

import { ServerMisconfiguredError } from './userJwt.ts';

export const JSON_RPC_INTERNAL_ERROR = -32603;

export const MCP_MISCONFIGURED_MESSAGE =
  'Trove could not sign in this personal token. The server signing key is missing or rejected. Set TROVE_JWT_SIGNING_KEY on the mcp function and deploy it again.';

export const MCP_UNEXPECTED_MESSAGE =
  'Trove could not complete this request. Try again in a moment. If it keeps failing, reconnect the assistant or create a new personal token.';

export function readJsonRpcId(body: string): string | number | null {
  try {
    const parsed = JSON.parse(body) as { id?: unknown };
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (typeof parsed.id === 'string' || typeof parsed.id === 'number') return parsed.id;
  } catch {
    return null;
  }
  return null;
}

export function jsonRpcErrorBody(
  id: string | number | null,
  message: string,
  data?: { reason: string },
): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    error: data
      ? { code: JSON_RPC_INTERNAL_ERROR, message, data }
      : { code: JSON_RPC_INTERNAL_ERROR, message },
  });
}

export function mcpTransportError(error: unknown): { message: string; reason: string } {
  if (error instanceof ServerMisconfiguredError || (error instanceof Error && error.name === 'ServerMisconfiguredError')) {
    return { message: MCP_MISCONFIGURED_MESSAGE, reason: 'server_misconfigured' };
  }
  return { message: MCP_UNEXPECTED_MESSAGE, reason: 'internal_error' };
}

function isGenericInternalMessage(message: string): boolean {
  return message === 'Internal error' || message === 'Internal server error' || message === 'server_misconfigured';
}

/**
 * Turn a bare HTTP 500 into a JSON-RPC error a client can show.
 * A JSON-RPC body that already has a specific message is left alone.
 * The SDK's own "Internal server error" is rewritten too.
 * Returns null when the response should pass through unchanged.
 */
export function rewriteInternalErrorBody(
  status: number,
  body: string,
  id: string | number | null,
): string | null {
  if (status < 500) return null;
  let message = '';
  let alreadyRpc = false;
  try {
    const parsed = JSON.parse(body) as { jsonrpc?: string; error?: { message?: string; data?: { reason?: string } } };
    if (parsed && typeof parsed === 'object' && parsed.jsonrpc === '2.0' && parsed.error) {
      alreadyRpc = true;
      message = parsed.error.message ?? '';
      if (message && !isGenericInternalMessage(message)) return null;
    }
  } catch {
    message = body.trim();
  }
  if (!alreadyRpc && message && !isGenericInternalMessage(message)) {
    return jsonRpcErrorBody(id, MCP_UNEXPECTED_MESSAGE, { reason: 'internal_error' });
  }
  if (message === 'server_misconfigured') {
    return jsonRpcErrorBody(id, MCP_MISCONFIGURED_MESSAGE, { reason: 'server_misconfigured' });
  }
  return jsonRpcErrorBody(id, MCP_UNEXPECTED_MESSAGE, { reason: 'internal_error' });
}
