// onboarding-structure: turn a spoken brain-dump into a calm starting point —
// circles (projects / areas of life), each with actions and routines, plus a
// "personal" bucket for loose items.
// Auth: Supabase verifies the caller's JWT before this runs (verify_jwt on).
// Secret: OPENAI_API_KEY (shared with enrich-task).

type StructureRequest = {
  transcript?: string;
  today?: string; // YYYY-MM-DD in the user's timezone
  timezone?: string; // IANA name, e.g. Europe/Madrid
};

const MODEL = 'gpt-4o-mini';

// Circle colours must come from the app's accent palette (src/theme/tokens.ts).
const COLORS = [
  'sage',
  'brand',
  'moss',
  'teal',
  'dusk',
  'lilac',
  'plum',
  'rose',
  'terracotta',
  'clay',
  'ochre',
  'honey',
] as const;

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

const ACTION_ITEM = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: {
      type: 'string',
      description: 'Short imperative action, max 60 chars, sentence case, no trailing full stop.',
    },
    today: {
      type: 'boolean',
      description: 'True only if this clearly needs doing today or was said as urgent. Keep these few.',
    },
    due_date: {
      type: ['string', 'null'],
      description: 'YYYY-MM-DD if a date is clearly implied, resolved against today; else null.',
    },
  },
  required: ['title', 'today', 'due_date'],
} as const;

const ROUTINE_ITEM = {
  type: 'object',
  additionalProperties: false,
  properties: {
    text: {
      type: 'string',
      description: 'Short recurring thing, e.g. "Water the plants". Sentence case, no full stop.',
    },
    days: {
      type: 'array',
      description: 'Weekdays it recurs on. "Every day"/"every morning" = all seven.',
      items: { type: 'string', enum: WEEKDAYS },
    },
  },
  required: ['text', 'days'],
} as const;

const RESPONSE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'onboarding_structure',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        circles: {
          type: 'array',
          description: 'Projects, areas of life, or groups of people mentioned in the dump.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: {
                type: 'string',
                description: 'Short human name, 1–3 words, sentence case, e.g. "Finca", "Newsletter".',
              },
              color: { type: 'string', enum: COLORS },
              actions: { type: 'array', items: ACTION_ITEM },
              routines: { type: 'array', items: ROUTINE_ITEM },
            },
            required: ['name', 'color', 'actions', 'routines'],
          },
        },
        personal: {
          type: 'object',
          additionalProperties: false,
          description: 'Loose items that do not belong to any clear circle.',
          properties: {
            actions: { type: 'array', items: ACTION_ITEM },
            routines: { type: 'array', items: ROUTINE_ITEM },
          },
          required: ['actions', 'routines'],
        },
      },
      required: ['circles', 'personal'],
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

    const body = (await req.json()) as StructureRequest;
    const transcript = (body.transcript ?? '').trim();
    if (!transcript) {
      return new Response(JSON.stringify({ error: 'transcript is required' }), {
        status: 400,
        headers,
      });
    }
    if (transcript.length > 8000) {
      return new Response(JSON.stringify({ error: 'transcript too long' }), {
        status: 400,
        headers,
      });
    }

    const today = body.today ?? new Date().toISOString().slice(0, 10);
    const timezone = body.timezone ?? 'UTC';

    const system = [
      'You help a busy, often-overwhelmed founder get everything out of their head.',
      'Turn their spoken brain-dump into a calm, organised starting point. UK English.',
      `Today is ${today} in the ${timezone} timezone; resolve relative dates against it.`,
      '',
      'Group related things into CIRCLES. A circle is a project, an area of life, or a',
      'group of people — e.g. "Finca", "Newsletter", "Home". Give each a short human',
      'name (1–3 words, sentence case).',
      'Each circle has ACTIONS (concrete things to do; short imperative titles) and',
      'ROUTINES (recurring things like "Water the plants", with the weekdays they recur).',
      'Mark an action today:true only when it clearly needs doing today or was said as',
      'urgent — keep those to a handful. Set due_date only when a date is clearly implied.',
      'For routines, "every day" or "every morning" means all seven weekdays.',
      'Anything that does not belong to a clear circle goes under "personal".',
      '',
      'Never invent tasks, circles, dates or people that were not mentioned. Do not add',
      'reminders, timers or widgets. Be calm and plain — no guilt, no hustle language.',
      'If the dump is short or vague, return few items rather than padding it out.',
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
          { role: 'user', content: transcript },
        ],
        response_format: RESPONSE_SCHEMA,
        max_tokens: 2000,
      }),
    });

    if (!openaiRes.ok) {
      const detail = await openaiRes.text();
      console.error('openai error', openaiRes.status, detail.slice(0, 500));
      return new Response(JSON.stringify({ error: 'structuring_failed' }), {
        status: 502,
        headers,
      });
    }

    const completion = await openaiRes.json();
    const content = completion.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);

    return new Response(JSON.stringify(parsed), { status: 200, headers });
  } catch (e) {
    console.error('onboarding-structure failed', e);
    return new Response(JSON.stringify({ error: 'structuring_failed' }), {
      status: 500,
      headers,
    });
  }
});
