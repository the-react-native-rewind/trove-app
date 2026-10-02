/** Personal access tokens for the Trove MCP server. Only the SHA-256 digest is stored. */

export const API_TOKEN_PREFIX = 'trove_';
export const API_TOKEN_PREFIX_LENGTH = 12;

/** Active (not revoked) tokens per user. Migration 0012 enforces the same cap. */
export const ACTIVE_TOKEN_LIMIT = 10;
const MIN_TOKEN_LENGTH = 20;
const MAX_TOKEN_LENGTH = 200;

/** How long a successful use can go without another last_used_at write. */
export const TOKEN_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

const TOKEN_RANDOM_BYTES = 32;
const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Mint a token from 32 cryptographically random bytes.
 * Hermes has no global Web Crypto, so the app passes bytes from expo-crypto.
 * The default filler is for Deno and Node, which do have `crypto.getRandomValues`.
 */
export function generateApiToken(randomBytes?: Uint8Array): string {
  return formatApiToken(randomBytes ?? webCryptoRandomBytes());
}

/** `trove_` plus the unpadded base64url of 32 random bytes. */
export function formatApiToken(bytes: Uint8Array): string {
  if (bytes.length !== TOKEN_RANDOM_BYTES) {
    throw new Error('API token entropy must be 32 bytes.');
  }
  return API_TOKEN_PREFIX + base64Url(bytes);
}

/**
 * Token plus the SHA-256 hex the MCP server stores.
 * `digestHex` must be the lowercase hex SHA-256 of the UTF-8 token, the same
 * digest `hashApiToken` computes with Web Crypto and expo-crypto returns for
 * `CryptoDigestAlgorithm.SHA256` with `CryptoEncoding.HEX`.
 */
export async function buildApiToken(
  randomBytes: Uint8Array,
  digestHex: (token: string) => Promise<string>,
): Promise<{ token: string; tokenHash: string }> {
  const token = formatApiToken(randomBytes);
  const tokenHash = (await digestHex(token)).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(tokenHash)) {
    throw new Error('Token hash must be a 64-character SHA-256 hex digest.');
  }
  return { token, tokenHash };
}

function webCryptoRandomBytes(): Uint8Array {
  const bytes = new Uint8Array(TOKEN_RANDOM_BYTES);
  crypto.getRandomValues(bytes);
  return bytes;
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

/** Unpadded base64url. Pure JS so Hermes does not need `btoa`. */
function base64Url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i + 3 <= bytes.length) {
    const triple = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += BASE64URL[(triple >>> 18) & 63];
    out += BASE64URL[(triple >>> 12) & 63];
    out += BASE64URL[(triple >>> 6) & 63];
    out += BASE64URL[triple & 63];
    i += 3;
  }
  if (i < bytes.length) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const triple = (a << 16) | (b << 8);
    out += BASE64URL[(triple >>> 18) & 63];
    out += BASE64URL[(triple >>> 12) & 63];
    if (i + 1 < bytes.length) out += BASE64URL[(triple >>> 6) & 63];
  }
  return out;
}
