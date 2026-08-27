# 03 — Data Model

Two tables. Neon Postgres. Hand-written SQL, no ORM, no migration framework —
`schema.sql` is applied once and edited in place while the project is pre-launch.

---

## 1. `schema.sql`

```sql
-- ── admins ────────────────────────────────────────────────────────────
-- Role is table-driven, never inferred from email domain. An @openhouse.in
-- address that is not in here is an ordinary candidate.
create table if not exists admins (
  email       text primary key,
  added_at    timestamptz not null default now()
);

-- ── submissions ───────────────────────────────────────────────────────
create table if not exists submissions (
  id             uuid primary key default gen_random_uuid(),
  email          text        not null,
  name           text,                       -- from the Google profile
  audio_key      text        not null,   -- R2 object key. Never a public URL
  audio_type     text,                    -- content type as uploaded
  audio_bytes    bigint,
  duration_s     numeric(8,2),               -- from Scribe, authoritative

  status         text        not null default 'queued',
      -- queued | processing | scored | failed | voided

  transcript     text,
  metrics        jsonb,                      -- see §3
  scores         jsonb,                      -- see §4
  rubric_version text,                       -- sha256(rubric.md)[:12]
  model          text,                       -- e.g. 'claude-opus-5'
  stt_model      text,                       -- e.g. 'scribe_v2'
  error          text,                       -- populated when status='failed'

  created_at     timestamptz not null default now(),
  scored_at      timestamptz,
  voided_at      timestamptz,
  voided_by      text
);

-- One live submission per candidate. 'voided' rows are excluded, which is the
-- entire retry mechanism: void the row, the candidate can upload again.
-- This index is what makes a double-clicked submit impossible at the database
-- level rather than the application level.
create unique index if not exists submissions_one_live
  on submissions (email)
  where status <> 'voided';

-- Admin list view: newest first.
create index if not exists submissions_created_idx
  on submissions (created_at desc);
```

> **The partial unique index is doing real work.** It enforces "one attempt" in
> the database rather than in application code, so a double-clicked submit button
> or two browser tabs cannot produce two rows. The API catches the unique
> violation and returns `409`.

## 2. Seeding admins

```sql
insert into admins (email) values
  ('support@openhouse.in')
on conflict (email) do nothing;
```

Run once against Neon. Adding an admin later is one more `insert`. There is
deliberately no admin-management UI — see [01-spec.md §7](01-spec.md).

## 3. `metrics` jsonb

Derived from Scribe's word timestamps by `api/metrics.py`. Pure function of the
transcript payload, so it is unit-testable without any network call.

```jsonc
{
  "duration_s":        184.3,   // total audio length
  "speech_s":          161.0,   // duration minus silence
  "speech_ratio":      0.874,   // speech_s / duration_s — low = lots of dead air
  "word_count":        412,
  "wpm":               153.5,   // words / (speech_s / 60) — pace
  "pause_count_2s":    4,       // silences longer than 2s
  "longest_pause_s":   5.2,
  "mean_pause_s":      0.61,
  "filler_count":      11,      // um, uh, like, you know, basically, actually, I mean, sort of, kind of
  "fillers_per_min":   3.6,
  "audio_events":      { "laughter": 1 },   // Scribe's non-speech tags
  "speaker_count":     1         // >1 means it isn't a solo pitch — flag it
}
```

Interpretation bands live in [05-scoring.md §4](05-scoring.md) and are passed to
Claude as a glossary, so the model reads `wpm: 153` as "brisk but clear" rather
than guessing.

## 4. `scores` jsonb

Written by Claude under a strict output schema — see [05-scoring.md §5](05-scoring.md).

```jsonc
{
  "pitch":   { "stars": 4, "reasoning": "Opens with a concrete pain point..." },
  "tone":    { "stars": 3, "reasoning": "Steady 153 wpm but 3.6 fillers/min..." },
  "company": { "stars": 2, "reasoning": "Calls OpenHouse a 'listing site'..." },
  "sales":   { "stars": 4, "reasoning": "Qualifies budget early, handles..." },
  "overall": { "stars": 3, "reasoning": "Strong seller, weak on the company." },
  "flags":   ["multiple_speakers"],          // optional, may be empty
  "summary": "Two-line verdict an admin reads first."
}
```

**`overall` is a judgement, not an average.** A 5 on pitch with a 1 on company
representation should not average to a 3 — the rubric decides, and the reasoning
has to say why.

## 5. Query set

The complete list. Anything not here doesn't exist yet.

```sql
-- role resolution, on every auth
select 1 from admins where email = %s;

-- can this candidate upload?
select id, status, created_at from submissions
 where email = %s and status <> 'voided';

-- claim the slot before scheduling the background task (fails loudly on a double submit)
insert into submissions (email, name, audio_key, audio_type, audio_bytes)
values (%s, %s, %s, %s, %s) returning id;

-- background task takes ownership
update submissions set status='processing' where id=%s;

-- polled by the dashboard; owner or admin only
select id, email, status from submissions where id = %s;

-- startup sweep: anything still in flight after a restart is dead
update submissions
   set status='failed', error=%s
 where status in ('queued','processing') and created_at < now() - %s::interval;

-- after scoring
update submissions
   set status='scored', transcript=%s, metrics=%s, scores=%s,
       duration_s=%s, rubric_version=%s, model=%s, stt_model=%s, scored_at=now()
 where id=%s;

-- on failure — keep the row, keep the audio, record why
update submissions set status='failed', error=%s where id=%s;

-- admin list (no transcript, no scores payload — keep it light)
select id, email, name, status, duration_s, created_at, rubric_version,
       (scores->'overall'->>'stars')::int as overall
  from submissions order by created_at desc limit %s offset %s;

-- admin detail
select * from submissions where id = %s;

-- admin void → grants a retry
update submissions
   set status='voided', voided_at=now(), voided_by=%s
 where id=%s and status <> 'voided';
```

## 6. What is deliberately absent

| Not here | Why |
|---|---|
| `users` table | Identity is the verified Google email. Nothing else about a candidate is needed |
| `attempts` table | `status='voided'` plus a partial unique index covers it |
| `roles` table | Two roles, one of which is a membership test |
| Migration framework | Pre-launch. `schema.sql` is edited in place. Add `alembic` the day real candidate data must survive a schema change |
| A jobs/queue table | One always-on Render instance running FastAPI `BackgroundTasks`. The startup sweep in [02-architecture.md §6](02-architecture.md) covers the one real failure mode |
| Soft-delete columns | Nothing is deleted |
