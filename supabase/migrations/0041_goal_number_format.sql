-- How a counted goal's figures are written out.
--
-- The number alone is rarely the whole story: 4000 could be pounds, kilos or
-- sign-ups, and each reads differently. The format decides how the pair is
-- rendered, and `unit` carries the wording it needs:
--
--   'plain'    -> unit is a trailing word:  "40 of 100 paying users"
--   'currency' -> unit is the symbol:       "£40 of £100"
--   'percent'  -> unit is unused:           "40% of 100%"
--
-- Weight, distance and anything else countable is 'plain' with the unit named,
-- so this stays a formatting choice rather than a list of every measure.

alter table public.goals
  add column if not exists number_format text not null default 'plain';

alter table public.goals
  drop constraint if exists goals_number_format_ok;

alter table public.goals
  add constraint goals_number_format_ok
  check (number_format in ('plain', 'currency', 'percent'));

comment on column public.goals.number_format is
  'How a counted goal reads: ''plain'' (unit as a trailing word), ''currency'' (unit as the symbol), or ''percent''.';
