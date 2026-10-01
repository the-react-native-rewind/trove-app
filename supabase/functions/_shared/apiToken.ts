/** Personal access tokens for the Trove MCP server. Only the SHA-256 digest is stored. */

export const API_TOKEN_PREFIX = 'trove_';
export const API_TOKEN_PREFIX_LENGTH = 12;

/** Active (not revoked) tokens per user. Migration 0012 enforces the same cap. */
export const ACTIVE_TOKEN_LIMIT = 10;
const MIN_TOKEN_LENGTH = 20;
const MAX_TOKEN_LENGTH = 200;

/** How long a successful use can go without another last_used_at write. */
export const TOKEN_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function generateApiToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return API_TOKEN_PREFIX + base64Url(bytes);
}

export function apiTokenPrefix(token: string): string {
  return token.slice(0, API_TOKEN_PREFIX_LENGTH);
}

/** SHA-256 hex of the UTF-8 token. Must match expo-crypto's HEX digest. */
export async function hashApiToken(token: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('SHA-256 is unavailable in this runtime');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Pull a Trove token out of an Authorization header. Anything else is rejected. */
export function readBearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1] ?? '';
  if (!token.startsWith(API_TOKEN_PREFIX)) return null;
  if (token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH) return null;
  return token;
}

export type StoredApiToken = {
  user_id: string;
  revoked_at: string | null;
  last_used_at: string | null;
};

export type TokenAccess =
  | { ok: true; userId: string; touchLastUsed: boolean }
  | { ok: false; reason: 'invalid' | 'revoked' };

/**
 * Decide whether a looked-up token row may call the API.
 * Missing and revoked tokens are distinct here so tests can see both;
 * the HTTP response uses the same 401 either way.
 */
export function tokenAccessDecision(
  row: StoredApiToken | null,
  nowMs: number = Date.now(),
): TokenAccess {
  if (!row) return { ok: false, reason: 'invalid' };
  if (row.revoked_at) return { ok: false, reason: 'revoked' };
  const lastUsed = row.last_used_at ? Date.parse(row.last_used_at) : Number.NaN;
  const touchLastUsed = !Number.isFinite(lastUsed) || nowMs - lastUsed >= TOKEN_TOUCH_INTERVAL_MS;
  return { ok: true, userId: row.user_id, touchLastUsed };
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
