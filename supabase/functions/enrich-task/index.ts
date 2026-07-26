// enrich-task: turn a raw task capture into { title, description, due_date }.
// Auth: Supabase verifies the caller's JWT before this runs (verify_jwt on).
// Secret: OPENAI_API_KEY (Dashboard -> Edge Functions -> Secrets).

type EnrichRequest = {
  raw_text?: string;
  today?: string; // YYYY-MM-DD in the user's timezone
  timezone?: string; // IANA name, e.g. Europe/Madrid
  inferred_due_date?: string | null; // client-side chrono guess, may be null
};

type EnrichResponse = {
  title: string;
  description: string;
  due_date: string | null;
};

const MODEL = 'gpt-4o-mini';

const RESPONSE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'task_enrichment',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: {
          type: 'string',
          description: 'Short imperative task title, max 60 characters, sentence case.',
        },
        description: {
          type: 'string',
          description:
            'The capture cleaned up: fix dictation artifacts, punctuation, casing. Keep the meaning and wording; do not add new information. Empty string if the capture is fully covered by the title.',
        },
        due_date: {
          type: ['string', 'null'],
          description: 'Due date as YYYY-MM-DD if the text implies one, else null.',
        },
      },
      required: ['title', 'description', 'due_date'],
    },
  },
} as const;

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const headers = { ...cors, 'Content-Type': 'application/json' };

  try {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY is not configured' }), {
        status: 503,
        headers,
      });
    }

    const body = (await req.json()) as EnrichRequest;
    const rawText = (body.raw_text ?? '').trim();
    if (!rawText) {
      return new Response(JSON.stringify({ error: 'raw_text is required' }), {
        status: 400,
        headers,
      });
    }
    if (rawText.length > 4000) {
      return new Response(JSON.stringify({ error: 'raw_text too long' }), {
        status: 400,
        headers,
      });
    }

    const today = body.today ?? new Date().toISOString().slice(0, 10);
    const timezone = body.timezone ?? 'UTC';

    const system = [
      'You turn one informal task capture (typed or dictated) into a clean task.',
      `Today is ${today} in the ${timezone} timezone; resolve relative dates against it.`,
      'Title: short, imperative, max 60 chars, sentence case, no trailing period.',
      'Description: the same capture lightly polished (dictation artifacts, punctuation, casing fixed). Never invent details. If the title already carries everything, return an empty description.',
      body.inferred_due_date
        ? `A rule-based parser read the due date as ${body.inferred_due_date}; keep it unless the text clearly says otherwise.`
        : 'Only set due_date when the text implies one; otherwise null.',
    ].join('\n');

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: rawText },
        ],
        response_format: RESPONSE_SCHEMA,
        max_tokens: 500,
      }),
    });

    if (!openaiRes.ok) {
      const detail = await openaiRes.text();
      console.error('openai error', openaiRes.status, detail.slice(0, 500));
      return new Response(JSON.stringify({ error: 'enrichment_failed' }), {
        status: 502,
        headers,
      });
    }

    const completion = await openaiRes.json();
    const content = completion.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content) as EnrichResponse;

    // Belt and braces: never trust model output shape blindly.
    const result: EnrichResponse = {
      title: String(parsed.title ?? '').slice(0, 80) || rawText.slice(0, 60),
      description: String(parsed.description ?? ''),
      due_date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.due_date ?? '') ? parsed.due_date : null,
    };

    return new Response(JSON.stringify(result), { status: 200, headers });
  } catch (e) {
    console.error('enrich-task failed', e);
    return new Response(JSON.stringify({ error: 'enrichment_failed' }), {
      status: 500,
      headers,
    });
  }
});
