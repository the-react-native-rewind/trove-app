// delete-account: remove a caller's files, hand on or delete their groups,
// then delete the auth user.
//
// verify_jwt: true (supabase/config.toml [functions.delete-account]).
// The gateway rejects a missing or invalid JWT before this runs. The user id
// still comes from that JWT, never from the request body.
//
// SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are provided
// on hosted Supabase. File removal uses the Storage API. public.delete_account_data
// does the SQL cleanup and is executable only by service_role. Direct
// DELETE FROM storage.objects is rejected by storage.protect_delete.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type StorageEntry = { name: string; id: string | null };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const headers = { ...cors, 'Content-Type': 'application/json' };
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json({ error: 'Supabase environment is not configured' }, 500);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Not authenticated' }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    const userId = userData.user?.id;
    if (userError || !userId) return json({ error: 'Not authenticated' }, 401);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const avatarPaths = await listPaths(admin, 'avatars', userId);
    const mediaPaths = await taskMediaPaths(admin, userId);
    await removePaths(admin, 'avatars', avatarPaths);
    await removePaths(admin, 'task-media', mediaPaths);

    const { error: cleanupError } = await admin.rpc('delete_account_data', {
      p_user_id: userId,
    });
    if (cleanupError) return json({ error: cleanupError.message }, 500);

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) return json({ error: deleteError.message }, 500);

    return json({ ok: true }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not delete account';
    return json({ error: message }, 500);
  }
});

async function taskMediaPaths(admin: SupabaseClient, userId: string): Promise<string[]> {
  const { data: spaces, error: spaceError } = await admin
    .from('spaces')
    .select('id, is_default')
    .eq('owner_id', userId);
  if (spaceError) throw new Error(spaceError.message);

  const owned = spaces ?? [];
  const ownedIds = owned.map((space) => space.id as string);
  const otherMembers = new Set<string>();
  if (ownedIds.length > 0) {
    const { data: members, error: memberError } = await admin
      .from('space_members')
      .select('space_id, user_id')
      .in('space_id', ownedIds)
      .neq('user_id', userId);
    if (memberError) throw new Error(memberError.message);
    for (const member of members ?? []) otherMembers.add(member.space_id as string);
  }

  const paths = new Set<string>();
  for (const space of owned) {
    const id = space.id as string;
    const solelyOwned = space.is_default === true || !otherMembers.has(id);
    if (!solelyOwned) continue;
    for (const path of await listPaths(admin, 'task-media', id)) paths.add(path);
  }

  const { data: uploads, error: uploadError } = await admin
    .from('task_attachments')
    .select('path')
    .eq('created_by', userId);
  if (uploadError) throw new Error(uploadError.message);
  for (const row of uploads ?? []) {
    if (row.path) paths.add(row.path as string);
  }
  return [...paths];
}

async function listPaths(admin: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  const pending = [prefix];
  while (pending.length > 0) {
    const folder = pending.pop() as string;
    let offset = 0;
    for (;;) {
      const { data, error } = await admin.storage.from(bucket).list(folder, {
        limit: 100,
        offset,
      });
      if (error) throw new Error(error.message);
      const entries = (data ?? []) as StorageEntry[];
      for (const entry of entries) {
        if (!entry.name) continue;
        const path = `${folder}/${entry.name}`;
        if (entry.id === null) pending.push(path);
        else paths.push(path);
      }
      if (entries.length < 100) break;
      offset += entries.length;
    }
  }
  return paths;
}

async function removePaths(admin: SupabaseClient, bucket: string, paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const { error } = await admin.storage.from(bucket).remove(chunk);
    if (error) throw new Error(error.message);
  }
}
