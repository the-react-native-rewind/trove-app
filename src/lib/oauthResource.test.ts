import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { MCP_TOOL_NAMES } from '../../supabase/functions/_shared/mcpTools';
import { SERVER_VERSION, mcpImplementation, toolMetadata } from '../../supabase/functions/_shared/mcpMeta';
import {
  authorizationServerIssuer,
  canonicalMcpResourceUrl,
  isProtectedResourceMetadataPath,
  protectedResourceMetadata,
  resourceMetadataUrl,
  wwwAuthenticate,
} from '../../supabase/functions/_shared/oauthResource';

test('every tool has a title and explicit behaviour hints', () => {
  for (const name of MCP_TOOL_NAMES) {
    const meta = toolMetadata[name];
    assert.equal(typeof meta.title, 'string');
    assert.ok(meta.title.length > 0, name);
    assert.equal(typeof meta.readOnlyHint, 'boolean', name);
    assert.equal(typeof meta.destructiveHint, 'boolean', name);
    assert.equal(typeof meta.idempotentHint, 'boolean', name);
    assert.equal(typeof meta.openWorldHint, 'boolean', name);
  }
  assert.equal(toolMetadata.complete_task.destructiveHint, false);
  assert.equal(toolMetadata.invite_to_circle.openWorldHint, true);
  assert.equal(toolMetadata.add_task_attachment.openWorldHint, true);
  assert.equal(toolMetadata.move_task.destructiveHint, true);
  assert.equal(toolMetadata.list_circles.readOnlyHint, true);
  assert.equal(toolMetadata.list_circles.destructiveHint, false);
});

test('the canonical MCP URL comes from config, not a baked-in host', () => {
  assert.equal(
    canonicalMcpResourceUrl({
      resourceUrl: 'https://mcp.example.com/',
      supabaseUrl: 'https://pxjqqogxemsmufopmlsv.supabase.co',
    }),
    'https://mcp.example.com',
  );
  assert.equal(
    canonicalMcpResourceUrl({ supabaseUrl: 'https://pxjqqogxemsmufopmlsv.supabase.co/' }),
    'https://pxjqqogxemsmufopmlsv.supabase.co/functions/v1/mcp',
  );
  assert.equal(
    authorizationServerIssuer('https://pxjqqogxemsmufopmlsv.supabase.co'),
    'https://pxjqqogxemsmufopmlsv.supabase.co/auth/v1',
  );
});

test('protected resource metadata points at the Supabase authorization server', () => {
  const resource = 'https://mcp.example.com';
  const metadata = protectedResourceMetadata({
    resourceUrl: resource,
    authorizationServerUrl: 'https://pxjqqogxemsmufopmlsv.supabase.co/auth/v1',
    documentationUrl: 'https://troving.app/docs/mcp',
  });
  assert.equal(metadata.resource, resource);
  assert.deepEqual(metadata.authorization_servers, ['https://pxjqqogxemsmufopmlsv.supabase.co/auth/v1']);
  assert.deepEqual(metadata.bearer_methods_supported, ['header']);
  assert.ok(metadata.scopes_supported.includes('openid'));
  assert.equal(resourceMetadataUrl(resource), 'https://mcp.example.com/.well-known/oauth-protected-resource');
  assert.equal(
    resourceMetadataUrl('https://pxjqqogxemsmufopmlsv.supabase.co/functions/v1/mcp'),
    'https://pxjqqogxemsmufopmlsv.supabase.co/functions/v1/mcp/.well-known/oauth-protected-resource',
  );
  assert.equal(isProtectedResourceMetadataPath('/.well-known/oauth-protected-resource'), true);
  assert.equal(
    isProtectedResourceMetadataPath('/functions/v1/mcp/.well-known/oauth-protected-resource'),
    true,
  );
  assert.equal(isProtectedResourceMetadataPath('/functions/v1/mcp'), false);

  const challenge = wwwAuthenticate({
    resourceMetadataUrl: resourceMetadataUrl(resource),
    error: 'invalid_token',
    description: 'Send a token.',
  });
  assert.equal(/resource_metadata="https:\/\/mcp\.example\.com\/\.well-known\/oauth-protected-resource"/.test(challenge), true);
  assert.equal(/error="invalid_token"/.test(challenge), true);
  assert.equal(/scope="openid email profile"/.test(challenge), true);
  const cleaned = wwwAuthenticate({
    resourceMetadataUrl: resourceMetadataUrl(resource),
    description: 'token trove_\u2026',
  });
  assert.equal(/[^\x20-\x7E]/.test(cleaned), false);
});

test('server info carries the website and icons', () => {
  const info = mcpImplementation('https://troving.app/');
  assert.equal(info.title, 'Trove');
  assert.equal(info.version, SERVER_VERSION);
  assert.equal(info.version, '1.1.1');
  assert.equal(info.websiteUrl, 'https://troving.app');
  assert.equal(info.icons[0]?.src, 'https://troving.app/apple-touch-icon.png');
  assert.deepEqual(info.icons[0]?.sizes, ['180x180']);
  assert.equal(info.icons[1]?.src, 'https://troving.app/mark.png');
  assert.deepEqual(info.icons[1]?.sizes, ['160x160']);
  assert.equal(info.icons[1]?.mimeType, 'image/png');
  const registry = JSON.parse(readFileSync(new URL('../../server.json', import.meta.url), 'utf8')) as {
    version: string;
    websiteUrl: string;
    icons: Array<{ src: string }>;
  };
  assert.equal(registry.version, SERVER_VERSION);
  assert.equal(registry.websiteUrl, 'https://troving.app');
  assert.equal(registry.icons[0]?.src, 'https://troving.app/apple-touch-icon.png');
  assert.equal(registry.icons[1]?.src, 'https://troving.app/mark.png');
});
