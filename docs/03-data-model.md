# 03 — Data Model

Three tables in Neon Postgres. Hand-written SQL, no ORM, no migration framework —
`schema.sql` is applied once and edited in place while the project is pre-launch.

---

## 1. The split

The tables divide along the axis that actually scales — **who a person is** versus
**what one assessment recorded about them**:

| Table | Scope | Grows with |
|---|---|---|
| `oh_users` | OpenHouse staff | Headcount |
| `candidates` | People being assessed | Applicants |
| `sales_insight_submissions` | One assessment type | Submissions to *this* assessment |

The first two are **assessment-agnostic**. A second assessment type adds exactly
one table and touches neither of them, and migrates no existing data.

```
  oh_users                    candidates
      │                            │
      │ voided_by                  │ candidate_id
      └──────────┐      ┌──────────┘
                 ▼      ▼
        sales_insight_submissions
                 ▲
                 │  ← a future marketing_pitch_submissions attaches here,
                 │    to the same candidates table, independently
```

> **The cost of this shape, named.** Table-per-assessment-type means an
> "everything across all assessments" admin view needs a `UNION ALL` over the
> per-type tables rather than one filtered query. That is the right trade while
> assessments genuinely differ in what they store — an audio assessment has
> `duration_s` and a written one does not. If they ever converge on an identical
> shape, collapse them into one table with an `assessment_type` column.

## 2. `oh_users`

```sql
create table if not exists oh_users (
  id          uuid primary key default gen_random_uuid(),
  email       text        not null unique,
  name        text,
  role        text        not null default 'admin',   -- admin | reviewer
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),

  constraint oh_users_role_valid check (role in ('admin', 'reviewer'))
);
```

Membership here is what grants elevated access. It is **never** inferred from an
email domain — an `@openhouse.in` address that is not in this table is an
ordinary candidate.

`role` exists now because it costs one column and adding it later means a
migration on live data. Today the application treats every `oh_users` row as an
admin; `'reviewer'` becomes meaningful when there is more than one assessment to
scope a reviewer *to*.

Deactivation is `is_active = false`, not a delete, so a name stays resolvable on
submissions that person voided.

## 3. `candidates`

```sql
create table if not exists candidates (
  id             uuid primary key default gen_random_uuid(),
  email          text        not null unique,
  name           text,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now()
);
```

One row per person for their **whole relationship** with OpenHouse, not per
assessment. A candidate who later takes a second assessment reuses this row —
which is the entire reason this is a separate table rather than columns on the
submission.

Upserted on every sign-in:

```sql
insert into candidates (email, name) values (%s, %s)
on conflict (email) do update set
  name = coalesce(excluded.name, candidates.name),
  last_seen_at = now()
returning id;
```

**Staff get a candidate row too.** It costs nothing and it is what lets an admin
walk the candidate flow end to end. Role comes from `oh_users` membership, never
from the presence of a row here.

## 4. `sales_insight_submissions`

```sql
create table if not exists sales_insight_submissions (
  -- Supplied by the application, not defaulted: the R2 object key and the row
  -- id are deliberately the same value.
  id             uuid        primary key,
  candidate_id   uuid        not null references candidates(id) on delete cascade,

  audio_key      text        not null,   -- R2 object key. Never a public URL
  audio_type     text,
  audio_bytes    bigint,
  duration_s     numeric(8,2),           -- from Scribe, authoritative

  status         text        not null default 'queued',

  transcript     text,
  metrics        jsonb,
  scores         jsonb,
  rubric_version text,                   -- sha256(rubric.md)[:12]
  model          text,
  stt_model      text,
  error          text,

  created_at     timestamptz not null default now(),
  scored_at      timestamptz,
  voided_at      timestamptz,
  voided_by      uuid        references oh_users(id),

  constraint sales_insight_status_valid
    check (status in ('queued', 'processing', 'scored', 'failed', 'voided'))
);
```

`scores` is jsonb because the axes belong to **this assessment's rubric**, not to
the database. A different assessment scores different things, and a schema
change per rubric edit would be intolerable.

### The one-live index

```sql
create unique index if not exists sales_insight_one_live
  on sales_insight_submissions (candidate_id)
  where status <> 'voided';
```

**Scoped to this table**, so a candidate who takes a future assessment type is
unaffected by this one. Voided rows are excluded, which is the whole retry
mechanism: void the row and the candidate can upload again.

This is what makes a double-clicked submit impossible at the *database* level
rather than the application level. The API catches the unique violation and
returns `409`.

### Status

`queued → processing → scored | failed`, plus `voided` from any state.

A candidate never sees `failed` — [04-api.md](04-api.md) collapses it to
`submitted`. Only admins learn a run errored.

## 5. `metrics` jsonb

Derived from Scribe's word timestamps by `backend/app/metrics.py` — a pure
function, so it is unit-testable with no network call.

```jsonc
{
  "duration_s":      184.3,
  "speech_s":        161.0,
  "speech_ratio":    0.874,   // low = lots of dead air
  "word_count":      412,
  "wpm":             153.5,   // over SPEECH time, not wall time
  "pause_count_2s":  4,
  "longest_pause_s": 5.2,
  "mean_pause_s":    0.61,
  "filler_count":    11,
  "fillers_per_min": 3.6,
  "audio_events":    { "laughter": 1 },
  "speaker_count":   1         // >1 means it isn't a solo pitch — flag it
}
```

Interpretation bands are in [05-scoring.md §4](05-scoring.md) and are passed to
Claude as a glossary, so the model reads `wpm: 153` as "brisk but clear" rather
than guessing.

## 6. `scores` jsonb

```jsonc
{
  "pitch":   { "stars": 4, "reasoning": "Opens with a concrete pain point..." },
  "tone":    { "stars": 3, "reasoning": "Steady 153 wpm but 3.6 fillers/min..." },
  "company": { "stars": 2, "reasoning": "Calls OpenHouse a 'listing site'..." },
  "sales":   { "stars": 4, "reasoning": "Qualifies budget early, handles..." },
  "overall": { "stars": 3, "reasoning": "Strong seller, weak on the company." },
  "flags":   ["multiple_speakers"],
  "summary": "Two-line verdict an admin reads first."
}
```

**`overall` is a judgement, not an average.** A 5 on pitch with a 1 on company
representation should not average to a 3 — the rubric decides, and the reasoning
has to say why.

## 7. Query set

The complete list, all in `backend/app/db.py`. Anything not here doesn't exist yet.

```sql
-- role resolution, on every sign-in
select id, email, name, role from oh_users where email = %s and is_active;

-- identity, on every sign-in
insert into candidates (email, name) values (%s, %s)
on conflict (email) do update set
  name = coalesce(excluded.name, candidates.name), last_seen_at = now()
returning id;

-- can this candidate upload?
select s.id, s.status, s.created_at from sales_insight_submissions s
  join candidates c on c.id = s.candidate_id
 where c.email = %s and s.status <> 'voided';

-- claim the slot before scheduling the background task
insert into sales_insight_submissions
  (id, candidate_id, audio_key, audio_type, audio_bytes)
values (%s, %s, %s, %s, %s);

-- background task takes ownership
update sales_insight_submissions set status = 'processing' where id = %s;

-- polled by the dashboard; email drives the ownership check
select s.id, c.email, s.status from sales_insight_submissions s
  join candidates c on c.id = s.candidate_id where s.id = %s;

-- startup sweep: anything still in flight after a restart is dead
update sales_insight_submissions set status = 'failed', error = %s
 where status in ('queued','processing') and created_at < now() - %s::interval;

-- admin board (no transcript, no scores payload — keep it light)
select s.id, c.email, c.name, s.status, s.duration_s, s.created_at,
       s.rubric_version, (s.scores->'overall'->>'stars')::int as overall
  from sales_insight_submissions s
  join candidates c on c.id = s.candidate_id
 order by s.created_at desc limit %s offset %s;

-- admin detail
select s.*, c.email, c.name, v.email as voided_by_email
  from sales_insight_submissions s
  join candidates c on c.id = s.candidate_id
  left join oh_users v on v.id = s.voided_by
 where s.id = %s;

-- admin void → grants a retry
update sales_insight_submissions
   set status = 'voided', voided_at = now(),
       voided_by = (select id from oh_users where email = %s)
 where id = %s and status <> 'voided';
```

Table names are written **literally**, never interpolated. That is deliberate:
parameterised table names look exactly like SQL injection, and a shared
"submissions layer" generic over the columns that differ between assessment
types would be an abstraction serving one implementation.

## 8. Adding an assessment type

1. Copy the `sales_insight_submissions` block in `schema.sql`, rename it, keep
   the three indexes, and change the columns that genuinely differ. A written
   assessment has no `audio_key` and no `duration_s`.
2. Copy the submission functions in `backend/app/db.py` into a new module and
   change the table name.
3. Add its rubric, its routes, and its admin page.

`oh_users` and `candidates` are untouched by all of it. No migration, no
backfill, no downtime.

## 9. What is deliberately absent

| Not here | Why |
|---|---|
| An `assessments` registry table | There is one assessment. A registry that lists one row is a lookup table waiting for a second reader |
| A jobs/queue table | One always-on Render instance running FastAPI `BackgroundTasks`. The startup sweep in [02-architecture.md §6](02-architecture.md) covers the one real failure mode |
| `roles` / permissions tables | Two roles, one of which is a membership test |
| Migration framework | Pre-launch. `schema.sql` is edited in place. Add `alembic` the day real candidate data must survive a schema change |
| Soft-delete columns | Nothing is deleted. `voided` and `is_active` cover the two cases that exist |
