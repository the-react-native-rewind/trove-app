// Render the Supabase Auth email templates to supabase/templates/*.html.
// Run from the repo root: deno run --allow-write supabase/templates/build.ts
// Then push them with `supabase config push` (config.toml points at these files)
// or paste them into Dashboard > Authentication > Email Templates.

import { authTemplates } from '../functions/_shared/emailCopy.ts';

const dir = new URL('.', import.meta.url);
for (const t of authTemplates()) {
  await Deno.writeTextFile(new URL(`${t.key}.html`, dir), t.html + '\n');
  console.log(`${t.key}.html  subject: ${t.subject}`);
}
