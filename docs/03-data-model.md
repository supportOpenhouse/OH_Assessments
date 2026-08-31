# 03 — Data Model

Five tables in Neon Postgres. Hand-written SQL, no ORM, no migration framework —
`migrations/001_schema.sql` is applied once and edited in place while the
project is pre-launch — see [migrations/README.md](../migrations/README.md).

---

## 1. The split

The tables divide along the axis that actually scales — **who a person is** versus
**what one assessment recorded about them**:

| Table | Scope | Grows with |
|---|---|---|
| `oh_users` | OpenHouse staff | Headcount |
| `candidates` | People being assessed | Applicants |
| **`submissions`** | **Every submission, of every type — the holder** | All submissions |
| `sales_insight_submissions` | What is specific to the audio assessment | Submissions to *this* assessment |
| `activity_logs` | The audit trail | Every action, forever |

```
  oh_users            candidates                 activity_logs
  (staff)                 │                     (append-only,
      │                   │ candidate_id         references nothing)
      │                   ▼
      │             submissions  ◀── THE HOLDER. Every submission,
      │                   │            every assessment type.
      │        shared PK  │
      │      ┌────────────┼────────────┐
      │      ▼            ▼            ▼
      │  sales_       marketing_    (future child tables:
      │  insight_     pitch_         only what is specific
      │  submissions  submissions    to that assessment)
      │
      └──── no relationship to submissions at all ────╳
```

## 1a. Parent and child, not parent and mirror

`submissions` and `sales_insight_submissions` are **one logical row split across
two tables, sharing a primary key**. The parent owns everything true of *any*
assessment; the child owns only what an *audio* assessment needs.

| Lives on the parent | Lives on the child |
|---|---|
| `candidate_id`, `assessment_type` | `audio_key`, `audio_type`, `audio_bytes` |
| `status`, `error` | `duration_s`, `transcript` |
| `overall_stars` (derived) | `metrics`, `scores` |
| `created_at`, `scored_at`, `voided_at` | `rubric_version`, `model`, `stt_model` |

**Nothing appears in both.** That is the entire point, and it is why this is not
a mirror: a duplicated `status` is a `status` that can drift the first time a
sync trigger has a bug. Here there is no second copy to drift.

The payoff: **"every submission across every assessment" is
`select * from submissions`** — no `UNION`, no knowledge of any child's shape.
`db.list_all_submissions()` is that query, and `test_the_holder_query_needs_no_union`
holds the line.

## 1b. The two triggers

The design needs exactly two, and each earns its place.

**1. `sales_insight_parent_guard`** — a child may only attach to a parent of the
matching type.

```sql
before insert or update of id on sales_insight_submissions
```

The foreign key guarantees *a* parent exists; it cannot guarantee the parent is
the right *kind*. Without this a bug could file an audio submission under a
written assessment, and every later query would quietly disagree with every
other one.

**2. `sales_insight_overall_sync`** — mirror the headline score up to the parent.

```sql
after insert or update of scores on sales_insight_submissions
  → update submissions set overall_stars = (new.scores->'overall'->>'stars')::smallint
```

`overall_stars` is the one genuinely derived value: the cross-assessment board
needs a rankable number, and only the child knows the rubric's shape.

**A trigger rather than application code, on purpose.** A score reaching the
child by *any* route — a backfill, a migration, a hand-run `UPDATE` at 2am —
still reaches the parent. `db.finish_submission` deliberately does not write
`overall_stars`, and `test_finish_submission_splits_detail_from_state_in_one_transaction`
asserts it never starts.

> **Applying this to a database that already has tables.** `001_schema.sql` opens
> with a preflight block that refuses to run on a legacy shape. It exists because
> `create table if not exists` does *nothing* when a table of that name exists
> with different columns — it skips silently, and the failure surfaces several
> statements later as an unreadable `column "candidate_id" does not exist`
> (42703). `migrations/inspect.sql` shows what is there (read-only, with row
> counts); `migrations/reset.sql` drops it all (destructive).

> **Verification limit, stated plainly.** `001_schema.sql` parses under libpg_query
> (the real Postgres parser). The **plpgsql function bodies do not**: `parse_sql`
> treats them as opaque strings, and pglast's `parse_plpgsql` is broken in this
> build — it fails on a trivial known-good function, so it proves nothing. The
> two trigger bodies are unverified until the first `psql -f migrations/001_schema.sql`
> against Neon. Run that before trusting them.

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

This table is referenced by **nothing**. It answers one question — "is this
person staff, and at what level" — and staff *actions* are recorded in
`activity_logs`.

`role` exists now because it costs one column and adding it later means a
migration on live data. Today the application treats every `oh_users` row as an
admin; `'reviewer'` becomes meaningful when there is more than one assessment to
scope a reviewer *to*.

Deactivation is `is_active = false`, not a delete, so a name stays resolvable on
submissions that person voided.

## 3. `candidates`

```sql
create table if not exists candidates (
  id               uuid primary key default gen_random_uuid(),
  email            text        not null unique,
  name             text,
  name_set_by_user boolean     not null default false,
  name_updated_at  timestamptz,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  login_count      integer     not null default 0
);
```

**`name_set_by_user` exists because the sign-in upsert refreshes `name` from the
Google profile.** Once a person can edit their own name, that refresh becomes a
bug: they rename themselves, sign in the next day, and are silently reverted. The
upsert branches on the flag:

```sql
name = case when candidates.name_set_by_user then candidates.name
            else coalesce(excluded.name, candidates.name) end
```

A column rather than a comparison against the Google name, because "they changed
it back to exactly what Google says" is a legitimate choice that must also stick.

One row per person for their **whole relationship** with OpenHouse, not per
assessment. **Every submission hangs off this table** — a candidate who later
takes a second assessment reuses this row, which is the entire reason it is
separate rather than columns on the submission.

> **Applicants only.** Staff never get a row here: an `@openhouse.in` address
> that is not in `oh_users` is refused at sign-in, and one that IS in `oh_users`
> signs in as staff without a candidates row. Every row is an applicant *by
> construction*, so the Candidates page needs no filter at all.
>
> Membership in `oh_users` decides the role, never the domain. The domain only
> decides whether an unregistered address is refused rather than enrolled — so a
> contractor on a personal address can still be staff.
>
> `migrations/004_staff_are_not_candidates.sql` cleans up rows created under the
> old behaviour, deleting only those with **no** submissions and naming the rest.

**The email is saved here on every sign-in**, before the person does anything
else:

```sql
insert into candidates (email, name, login_count) values (%s, %s, %s)
on conflict (email) do update set
  name = coalesce(excluded.name, candidates.name),
  last_seen_at = now(),
  login_count = candidates.login_count + %s
returning id, (xmax = 0) as created;
```

`xmax = 0` is the standard Postgres way to tell an INSERT from an UPDATE inside
an upsert — it is zero only for a freshly inserted tuple. That is what lets the
caller emit a `candidate.created` audit event exactly once per person.

**Staff get a candidate row too.** It costs nothing and it is what lets an admin
walk the candidate flow end to end. Role comes from `oh_users` membership, never
from the presence of a row here.

## 4. `submissions` — the holder

```sql
create table if not exists submissions (
  id              uuid        primary key,   -- app-supplied; also the child id
  candidate_id    uuid        not null references candidates(id) on delete cascade,
  assessment_type text        not null,      -- 'sales_insight'
  status          text        not null default 'queued',
  overall_stars   smallint,                  -- derived by trigger, 0-5
  error           text,
  created_at      timestamptz not null default now(),
  scored_at       timestamptz,
  voided_at       timestamptz,

  constraint submissions_status_valid
    check (status in ('queued','processing','scored','failed','voided')),
  constraint submissions_stars_valid
    check (overall_stars is null or overall_stars between 0 and 5),
  constraint submissions_type_valid
    check (assessment_type in ('sales_insight'))
);
```

The rule for what belongs here: **if a column would be null for a written
assessment, it belongs in a child table.** `duration_s` fails that test;
`status` passes it.

### The one-live index

```sql
create unique index if not exists submissions_one_live
  on submissions (candidate_id, assessment_type)
  where status <> 'voided';
```

Now that the parent carries the type, this **single index covers every
assessment there will ever be** — a candidate can take `sales_insight` once *and*
a future assessment once, with no new index and no new code. Voided rows are
excluded, which is the whole retry mechanism.

This is what makes a double-clicked submit impossible at the *database* level.
The API catches the unique violation and returns `409`.

### Status

`queued → processing → scored | failed`, plus `voided` from any state. Status
lives here and only here.

A candidate never sees `failed` — [04-api.md](04-api.md) collapses it to
`submitted`. Only admins learn a run errored.

## 4a. `sales_insight_submissions` — the audio child

```sql
create table if not exists sales_insight_submissions (
  -- Same value as the parent. PK and FK at once, so a child cannot exist
  -- without its parent and cannot outlive it.
  id             uuid primary key references submissions(id) on delete cascade,

  audio_key      text        not null,   -- R2 object key. Never a public URL
  audio_type     text,
  audio_bytes    bigint,
  duration_s     numeric(8,2),
  transcript     text,
  metrics        jsonb,
  scores         jsonb,
  rubric_version text,
  model          text,
  stt_model      text
);
```

No `status`, no `candidate_id`, no timestamps — those are the parent's, and
duplicating them is exactly the drift this design exists to prevent.
`test_status_and_candidate_id_exist_only_on_the_parent` greps every write in
`db.py` to keep it that way.

`scores` is jsonb because the axes belong to **this assessment's rubric**, not to
the database. `overall_stars` on the parent is derived from it by trigger.

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

## 7. `activity_logs`

```sql
create table if not exists activity_logs (
  id           bigserial   primary key,
  at           timestamptz not null default now(),

  actor_email  text,                     -- null only for system actions
  actor_role   text,                     -- user | admin | system

  action       text        not null,     -- 'submission.voided', 'auth.login', …
  entity       text,                     -- 'sales_insight_submission' | 'candidate'
  entity_id    text,

  data         jsonb,
  ip           text,
  user_agent   text
);
```

**Append-only.** There is no `UPDATE` or `DELETE` against this table anywhere in
the codebase.

### What is recorded

Every action that creates, changes or removes data — plus every sign-in.

| Action | Actor | When |
|---|---|---|
| `auth.login` | the person | Every sign-in |
| `candidate.created` | the person | First sign-in only |
| `submission.created` | candidate | Upload accepted (`202`) |
| `submission.rejected` | candidate | `409` / `413` / `415` / `422` |
| `submission.processing` | `system` | Background task takes the row |
| `submission.scored` | `system` | Scoring finished |
| `submission.failed` | `system` | Scoring raised |
| `submission.voided` | admin | Void — **the only record of who** |
| `submission.swept` | `system` | Startup sweep cleared stale rows |

Reads are **not** logged. A rejected upload is, because a candidate hitting
`409` three times or `415` on every attempt is signal an admin should see.

### Why server-side only

Logging button clicks in the browser would miss anything that does not go
through our UI — a `curl`, a replayed request, a second tab — and it can be
forged by the person being audited. Every mutation in this product goes through
the API, so **the API is the complete and trustworthy record**. The browser is
where actions are initiated; it is not where they happen.

### Two rules the code enforces

- **`data` never carries a score, a reasoning string, a transcript, or audio.**
  Those live on the row they belong to; duplicating them here would double the
  surface that can leak a result. `test_audit_rows_never_carry_a_score_or_a_transcript`
  is what holds the line.
- **A failed audit write never fails the action it audits.** `logs.record()`
  swallows its own errors into the application log. Losing an audit row is bad;
  losing the user's action because of it is worse.

### Adding a verb

Add a constant to `backend/app/logs.py` — never a bare string literal at the
call site. A typo'd literal is an audit hole nothing catches. The activity page
reads its filter list from `select distinct action`, so it can never drift from
the verbs actually in use.

## 8. Query set

The complete list, all in `backend/app/db.py`. Anything not here doesn't exist yet.

```sql
-- role resolution, on every sign-in
select id, email, name, role from oh_users where email = %s and is_active;

-- identity, on every sign-in
insert into candidates (email, name) values (%s, %s)
on conflict (email) do update set
  name = coalesce(excluded.name, candidates.name), last_seen_at = now()
returning id;

-- can this candidate upload? (parent only)
select s.id, s.status, s.created_at from submissions s
  join candidates c on c.id = s.candidate_id
 where c.email = %s and s.assessment_type = %s and s.status <> 'voided';

-- claim the slot: parent then child, ONE transaction. Order is forced by the
-- foreign key and by the child's parent-guard trigger.
insert into submissions (id, candidate_id, assessment_type) values (%s, %s, %s);
insert into sales_insight_submissions (id, audio_key, audio_type, audio_bytes)
values (%s, %s, %s, %s);

-- background task takes ownership (state is the parent's)
update submissions set status = 'processing' where id = %s;

-- polled by the dashboard; email drives the ownership check
select s.id, c.email, s.status from submissions s
  join candidates c on c.id = s.candidate_id where s.id = %s;

-- startup sweep: anything still in flight after a restart is dead, whatever
-- assessment type it belongs to
update submissions set status = 'failed', error = %s
 where status in ('queued','processing') and created_at < now() - %s::interval;

-- THE HOLDER QUERY: every submission, every assessment type, no UNION
select s.id, c.email, c.name, s.assessment_type, s.status, s.overall_stars,
       s.created_at
  from submissions s join candidates c on c.id = s.candidate_id
 order by s.created_at desc limit %s offset %s;

-- admin board (no transcript, no scores payload — keep it light)
select s.id, c.email, c.name, s.status, s.duration_s, s.created_at,
       s.rubric_version, (s.scores->'overall'->>'stars')::int as overall
  from sales_insight_submissions s
  join candidates c on c.id = s.candidate_id
 order by s.created_at desc limit %s offset %s;

-- admin detail: parent state + child detail + identity
select s.id, s.assessment_type, s.status, s.overall_stars, s.error,
       s.created_at, s.scored_at, s.voided_at,
       d.audio_key, d.duration_s, d.transcript, d.metrics, d.scores,
       d.rubric_version, d.model, d.stt_model, c.email, c.name
  from submissions s
  join candidates c on c.id = s.candidate_id
  left join sales_insight_submissions d on d.id = s.id
 where s.id = %s;

-- scoring finishes: detail to the child, state to the parent, ONE transaction.
-- overall_stars is NOT written here — the trigger derives it.
update sales_insight_submissions set transcript = %s, metrics = %s, scores = %s,
       duration_s = %s, rubric_version = %s, model = %s, stt_model = %s
 where id = %s;
update submissions set status = 'scored', error = null, scored_at = now()
 where id = %s;

-- admin void → grants a retry. Who did it is written to activity_logs.
update submissions set status = 'voided', voided_at = now()
 where id = %s and status <> 'voided';

-- audit append (never updated, never deleted)
insert into activity_logs
  (actor_email, actor_role, action, entity, entity_id, data, ip, user_agent)
values (%s, %s, %s, %s, %s, %s, %s, %s);

-- the activity page. Filters are null-guarded in ONE statement rather than
-- assembled from fragments — string-built SQL is how a filter becomes injection.
select id, at, actor_email, actor_role, action, entity, entity_id, data, ip
  from activity_logs
 where (%s::text is null or action = %s)
   and (%s::text is null or actor_email = %s)
   and (%s::text is null or entity_id = %s)
 order by at desc, id desc limit %s offset %s;
```

Table names are written **literally**, never interpolated. That is deliberate:
parameterised table names look exactly like SQL injection, and a shared
"submissions layer" generic over the columns that differ between assessment
types would be an abstraction serving one implementation.

## 9. Adding an assessment type

1. **Widen the type constraint:**
   ```sql
   alter table submissions drop constraint submissions_type_valid;
   alter table submissions add constraint submissions_type_valid
     check (assessment_type in ('sales_insight', 'marketing_pitch'));
   ```
2. **Create its child table** — only what is specific to it, sharing the PK:
   ```sql
   create table marketing_pitch_submissions (
     id uuid primary key references submissions(id) on delete cascade,
     ...its own columns...
   );
   ```
3. **Copy both triggers**, renaming `sales_insight` to the new type.
4. Copy the child-table functions in `backend/app/db.py`, add its rubric, routes,
   admin page, and action verbs in `backend/app/logs.py`.

Nothing else changes. `submissions_one_live` already scopes per type, the
cross-assessment query already reads from the parent, and **no existing data
moves**.

## 10. What is deliberately absent

| Not here | Why |
|---|---|
| An `assessments` registry table | There is one assessment. A registry that lists one row is a lookup table waiting for a second reader |
| A `voided_by` FK on submissions | Staff actions are events, not row properties. One column could record exactly one action by one person; `activity_logs` records all of them |
| A denormalised mirror of the child on the parent | Every duplicated column is a column that can drift. Parent/child with a shared PK gets the same single-place-to-query result with nothing to sync |
| An `assessment_type` lookup table | A `check` constraint says the same thing in one line and needs no join |
| Client-side event tracking | Forgeable by the person being audited, and blind to anything not going through our UI |
| Log retention / rotation | Nothing to rotate yet. When there is, it is a scheduled `delete from activity_logs where at < now() - interval '2 years'` — the only DELETE this table will ever see |
| A jobs/queue table | One always-on Render instance running FastAPI `BackgroundTasks`. The startup sweep in [02-architecture.md §6](02-architecture.md) covers the one real failure mode |
| `roles` / permissions tables | Two roles, one of which is a membership test |
| A migration *framework* | The `migrations/` folder is numbered files run by `psql`, nothing more. `001_schema.sql` is edited in place while pre-launch; a real change becomes `003_*.sql`. Add `alembic` the day candidate data must survive a schema change |
| Soft-delete columns | Nothing is deleted. `voided` and `is_active` cover the two cases that exist |
