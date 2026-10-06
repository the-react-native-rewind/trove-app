/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728) for the Trove MCP server.
 *
 * The canonical resource URL is configuration, not a supabase.co host baked
 * into the code. A future mcp.<domain> proxy should forward both the MCP
 * endpoint and /.well-known/oauth-protected-resource to this function.
 *
 * Supabase Auth does not yet copy the RFC 8707 resource parameter into the
 * access token audience (supabase/auth#2610). The metadata still names the
 * resource so clients send it. Token checks accept aud "authenticated" until
 * that ships, and also accept the resource URL for when it does.
 */

export const MCP_SCOPES = ['openid', 'email', 'profile'] as const;
export const MCP_SCOPE_CHALLENGE = MCP_SCOPES.join(' ');

const WELL_KNOWN = '/.well-known/oauth-protected-resource';

export function canonicalMcpResourceUrl(input: {
  resourceUrl?: string | null;
  supabaseUrl: string;
}): string {
  const explicit = input.resourceUrl?.trim();
  if (explicit) return stripSlash(explicit);
  const base = stripSlash(input.supabaseUrl.trim());
  if (!base) throw new Error('SUPABASE_URL is not configured');
  return `${base}/functions/v1/mcp`;
}

export function authorizationServerIssuer(supabaseUrl: string): string {
  const base = stripSlash(supabaseUrl.trim());
  if (!base) throw new Error('SUPABASE_URL is not configured');
  return `${base}/auth/v1`;
}

/**
 * URL to put in WWW-Authenticate resource_metadata.
 * An origin resource (https://mcp.example.com) uses the RFC 9728 root path.
 * A resource with a path (the Supabase function URL) keeps the document under
 * that path, because the function cannot answer a well-known URL on the
 * project origin.
 */
export function resourceMetadataUrl(resourceUrl: string): string {
  const url = new URL(resourceUrl);
  const path = url.pathname.replace(/\/+$/, '');
  if (path === '') return `${url.origin}${WELL_KNOWN}`;
  return `${url.origin}${path}${WELL_KNOWN}`;
}

export function isProtectedResourceMetadataPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return path === WELL_KNOWN || path.endsWith(WELL_KNOWN);
}

export type ProtectedResourceMetadata = {
  resource: string;
  authorization_servers: string[];
  bearer_methods_supported: ['header'];
  scopes_supported: string[];
  resource_name: string;
  resource_documentation?: string;
};

export function protectedResourceMetadata(input: {
  resourceUrl: string;
  authorizationServerUrl: string;
  documentationUrl?: string;
}): ProtectedResourceMetadata {
  const document: ProtectedResourceMetadata = {
    resource: stripSlash(input.resourceUrl),
    authorization_servers: [stripSlash(input.authorizationServerUrl)],
    bearer_methods_supported: ['header'],
    scopes_supported: [...MCP_SCOPES],
    resource_name: 'Trove',
  };
  if (input.documentationUrl) document.resource_documentation = input.documentationUrl;
  return document;
}

/** RFC 9728 challenge. Personal tokens and OAuth tokens both get this on 401. */
export function wwwAuthenticate(input: {
  resourceMetadataUrl: string;
  error?: 'invalid_token' | 'invalid_request';
  description?: string;
}): string {
  const parts = [
    'Bearer realm="trove"',
    `resource_metadata="${headerToken(input.resourceMetadataUrl)}"`,
    `scope="${headerToken(MCP_SCOPE_CHALLENGE)}"`,
  ];
  if (input.error) parts.push(`error="${headerToken(input.error)}"`);
  if (input.description) parts.push(`error_description="${escapeChallenge(input.description)}"`);
  return parts.join(', ');
}

/** HTTP header values are ByteStrings. Drop anything outside visible ASCII. */
function headerToken(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, '');
}

function escapeChallenge(value: string): string {
  return headerToken(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function stripSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
