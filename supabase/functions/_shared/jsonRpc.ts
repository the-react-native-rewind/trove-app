/** JSON-RPC 2.0 error used when the MCP server fails before a tool result. */

export const JSON_RPC_INTERNAL_ERROR = -32603;

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

export function jsonRpcErrorBody(id: string | number | null, message: string): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    error: { code: JSON_RPC_INTERNAL_ERROR, message },
  });
}
