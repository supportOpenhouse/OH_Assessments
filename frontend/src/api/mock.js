// In-memory fixtures. VITE_USE_MOCKS=true (default) resolves every API call from
// here so the whole UI is browsable with no backend running.
//
// Real-shaped content only — no "Jane Doe", no invented metrics. The numbers
// below are internally consistent (wpm matches word_count over speech_s, etc.)
// so the UI is exercised against data that could actually occur.

function axis(stars, reasoning) {
  return { stars, reasoning };
}

const SUBMISSIONS = [
  {
    id: '9f1c0a3e-0000-4000-8000-000000000001',
    email: 'asha.r@example.com',
    name: 'Asha Ramesh',
    assessment_type: 'sales_insight',
    status: 'scored',
    overall_stars: 3,
    duration_s: 184.3,
    audio_bytes: 2914304,
    created_at: '2026-08-27T09:12:03Z',
    scored_at: '2026-08-27T09:12:48Z',
    audio_url: '',
    rubric_version: 'a91c3fbb21c4',
    model: 'claude-opus-5',
    stt_model: 'scribe_v2',
    error: null,
    transcript:
      'Hi, thanks for taking my call. I noticed you listed your flat in Powai about three weeks ago and it is still up, which usually means the pricing is fine but the reach is not. That is actually the specific thing we fix. My name is Asha, I am with OpenHouse. Before I take up more of your time — are you still actively trying to sell, or have you parked it for now? Right, so here is what I would suggest. Most owners in your building are getting two or three walk-ins a month. The ones we work with are seeing that in a week, because we are not waiting for buyers to find the listing, we are taking it to buyers who have already told us what they want. I know the obvious question is brokerage. We charge less than the standard two percent, and you only pay on a closed sale. Can I block twenty minutes on Thursday to walk you through what the last three sales in Powai actually closed at?',
    metrics: {
      duration_s: 184.3,
      speech_s: 161.0,
      speech_ratio: 0.874,
      word_count: 412,
      wpm: 153.5,
      pause_count_2s: 4,
      longest_pause_s: 5.2,
      mean_pause_s: 0.61,
      filler_count: 11,
      fillers_per_min: 3.6,
      audio_events: { laughter: 1 },
      speaker_count: 1,
    },
    scores: {
      pitch: axis(4, 'Opens with a concrete observation about the listing rather than a company introduction, states the value proposition inside twenty seconds, and closes on a specific next step with a named day.'),
      tone: axis(3, 'Steady at 153 words per minute and clearly audible, but 3.6 fillers per minute and one 5.2 second pause mid-pitch read as searching for the next line rather than pausing for effect.'),
      company: axis(2, 'Describes OpenHouse essentially as a listing service with better reach, which undersells it and could be said of any competitor. Accurate in outline, generic in substance.'),
      sales: axis(4, 'Qualifies intent early with a genuine open question, pre-empts the brokerage objection before it lands, and closes for a scheduled meeting rather than a vague follow-up.'),
      overall: axis(3, 'A capable seller who has not yet learned the company. Coachable — the sales instincts are real and the gap is knowledge, not attitude.'),
      flags: [],
      summary: 'Strong seller, weak on the company. Train and re-assess.',
    },
  },
  {
    id: '9f1c0a3e-0000-4000-8000-000000000002',
    email: 'dev.k@example.com',
    name: 'Dev Kulkarni',
    status: 'scored',
    duration_s: 96.1,
    audio_bytes: 1544192,
    created_at: '2026-08-26T14:02:00Z',
    scored_at: '2026-08-26T14:02:39Z',
    audio_url: '',
    rubric_version: 'a91c3fbb21c4',
    model: 'claude-opus-5',
    stt_model: 'scribe_v2',
    error: null,
    transcript:
      'So basically, um, we have properties, and, uh, you know, they are good properties. Like, really good ones. In, um, a lot of areas. And, uh... yeah. So if you are looking for a property, then, uh, you know, we have them. That is basically it. I mean, the prices are also, uh, competitive. So. Yeah.',
    metrics: {
      duration_s: 96.1,
      speech_s: 61.4,
      speech_ratio: 0.639,
      word_count: 121,
      wpm: 118.2,
      pause_count_2s: 9,
      longest_pause_s: 7.8,
      mean_pause_s: 1.9,
      filler_count: 14,
      fillers_per_min: 13.7,
      audio_events: {},
      speaker_count: 1,
    },
    scores: {
      pitch: axis(1, 'No discernible structure. Never states what is being sold or to whom, and there is no ask at any point in the recording.'),
      tone: axis(1, 'Nine pauses over two seconds and 13.7 fillers per minute. A speech ratio of 0.64 means over a third of the recording is dead air.'),
      company: axis(1, 'Says OpenHouse "has properties", which is true of every listing site and conveys nothing specific or accurate about what the company does.'),
      sales: axis(1, 'Features listed without a customer in the picture. No discovery, no benefit framing, no close.'),
      overall: axis(1, 'Not ready. The gaps are foundational rather than coachable within a reasonable ramp.'),
      flags: [],
      summary: 'Reject. No structure, no ask, heavy hesitation throughout.',
    },
  },
  {
    id: '9f1c0a3e-0000-4000-8000-000000000003',
    email: 'priya.s@example.com',
    name: 'Priya Sharma',
    status: 'failed',
    duration_s: null,
    audio_bytes: 812032,
    created_at: '2026-08-25T11:30:00Z',
    scored_at: null,
    audio_url: '',
    rubric_version: null,
    model: null,
    stt_model: null,
    error: 'transcription returned no speech: audio may be silent or corrupt',
    transcript: null,
    metrics: null,
    scores: null,
  },
];

const INSTRUCTIONS = `## Your task

Record a **2-3 minute** sales pitch for OpenHouse, as if you were speaking to a
property owner on a first call.

## Cover these

- Who you are and why you are calling
- What OpenHouse is and why it matters to them
- Handle this objection: "I already have a broker."
- Close for a next step

## Guidelines

- Speak naturally. Do not read a script.
- Record somewhere quiet, on any device.
- Upload as MP3, M4A, WAV or WEBM, under 25 MB.
- **You get one attempt.** Listen back before you upload.

## What happens next

Your recording is transcribed and assessed. You will not see a result here —
the hiring team reviews every submission and will be in touch.`;

// Audit fixtures. Shapes match what the backend actually writes — note that no
// entry carries a score, a transcript, or audio.
const LOGS = [
  { id: '9', at: '2026-08-27T09:12:48Z', actor_email: null, actor_role: 'system',
    action: 'submission.scored', entity: 'submission',
    entity_id: '9f1c0a3e-0000-4000-8000-000000000001',
    data: { rubric_version: 'a91c3fbb21c4', model: 'claude-opus-5', stt_model: 'scribe_v2', duration_s: 184.3, word_count: 412 }, ip: null },
  { id: '8', at: '2026-08-27T09:12:06Z', actor_email: null, actor_role: 'system',
    action: 'submission.processing', entity: 'submission',
    entity_id: '9f1c0a3e-0000-4000-8000-000000000001', data: {}, ip: null },
  { id: '7', at: '2026-08-27T09:12:03Z', actor_email: 'asha.r@example.com', actor_role: 'user',
    action: 'submission.created', entity: 'submission',
    entity_id: '9f1c0a3e-0000-4000-8000-000000000001',
    data: { bytes: 2914304, content_type: 'audio/mpeg', duration_s: 184.3 }, ip: '103.21.244.7' },
  { id: '6', at: '2026-08-27T09:08:12Z', actor_email: 'asha.r@example.com', actor_role: 'user',
    action: 'submission.rejected', entity: null, entity_id: null,
    data: { reason: 'too_large', status: 413, filename: 'pitch-raw.wav', content_type: 'audio/wav' }, ip: '103.21.244.7' },
  { id: '5', at: '2026-08-27T09:04:55Z', actor_email: 'asha.r@example.com', actor_role: 'user',
    action: 'auth.login', entity: 'candidate', entity_id: '11111111-0000-4000-8000-000000000001',
    data: { new_candidate: false }, ip: '103.21.244.7' },
  { id: '4', at: '2026-08-26T14:02:39Z', actor_email: null, actor_role: 'system',
    action: 'submission.swept', entity: null, entity_id: null,
    data: { count: 1, stale_after_minutes: 10 }, ip: null },
  { id: '3', at: '2026-08-25T11:41:00Z', actor_email: 'you@openhouse.in', actor_role: 'admin',
    action: 'submission.voided', entity: 'submission',
    entity_id: '9f1c0a3e-0000-4000-8000-000000000003',
    data: { candidate_email: 'priya.s@example.com', previous_status: 'failed' }, ip: '49.36.180.2' },
  { id: '2', at: '2026-08-25T11:30:14Z', actor_email: null, actor_role: 'system',
    action: 'submission.failed', entity: 'submission',
    entity_id: '9f1c0a3e-0000-4000-8000-000000000003',
    data: { error: 'ScoringError: transcription returned no speech' }, ip: null },
  { id: '1', at: '2026-08-25T11:29:02Z', actor_email: 'priya.s@example.com', actor_role: 'user',
    action: 'candidate.created', entity: 'candidate',
    entity_id: '11111111-0000-4000-8000-000000000003',
    data: { name: 'Priya Sharma' }, ip: '49.36.180.2' },
];

const ASSESSMENT = {
  key: 'sales_insight',
  slug: 'sales-insight',
  name: 'Sales (Insight)',
  blurb: 'A recorded sales pitch, assessed on what you said and how you said it.',
  format: 'Audio recording',
  target_length: '2–3 minutes',
  attempts: 1,
};

const CANDIDATES = [
  { id: '11111111-0000-4000-8000-000000000001', email: 'asha.r@example.com',
    name: 'Asha Ramesh', first_seen_at: '2026-08-20T10:02:00Z',
    last_seen_at: '2026-08-27T09:04:55Z', last_submission_at: '2026-08-27T09:12:03Z',
    login_count: 4, attempts: 1, scored: 1, voided: 0,
    assessments: [{ key: 'sales_insight', name: 'Sales (Insight)' }] },
  { id: '11111111-0000-4000-8000-000000000002', email: 'dev.k@example.com',
    name: 'Dev Kulkarni', first_seen_at: '2026-08-24T08:00:00Z',
    last_seen_at: '2026-08-26T14:02:00Z', last_submission_at: '2026-08-26T14:02:00Z',
    login_count: 2, attempts: 1, scored: 1, voided: 0,
    assessments: [{ key: 'sales_insight', name: 'Sales (Insight)' }] },
  { id: '11111111-0000-4000-8000-000000000003', email: 'priya.s@example.com',
    name: 'Priya Sharma', first_seen_at: '2026-08-25T11:29:02Z',
    last_seen_at: '2026-08-25T11:30:00Z', last_submission_at: '2026-08-25T11:30:00Z',
    login_count: 1, attempts: 2, scored: 0, voided: 1,
    assessments: [{ key: 'sales_insight', name: 'Sales (Insight)' }] },
  { id: '11111111-0000-4000-8000-000000000004', email: 'no.attempt@example.com',
    name: 'Rahul Menon', first_seen_at: '2026-08-28T09:00:00Z',
    last_seen_at: '2026-08-28T09:00:00Z', last_submission_at: null,
    login_count: 1, attempts: 0, scored: 0, voided: 0, assessments: [] },
];

// Flip role to 'user' to walk the candidate path; submission_count drives where
// sign-in lands (0 -> /assessments, >0 -> /history).
let me_ = {
  email: 'you@openhouse.in',
  name: 'You',
  role: 'admin',
  first_seen_at: '2026-08-01T09:00:00Z',
  last_seen_at: '2026-08-31T09:00:00Z',
  login_count: 12,
  submission_count: 0,
};

let myHistory_ = [];

let pollCount = 0; // lets the dashboard's polling path be exercised offline

function notFound() {
  const e = new Error('not found');
  e.status = 404;
  throw e;
}

export function mockApi(method, path, body) {
  if (method === 'GET' && path === '/api/health') return { ok: true };

  if (method === 'POST' && path === '/api/auth/google') {
    return { token: 'mock-token', user: me_ };
  }

  if (method === 'GET' && path === '/api/me') return me_;

  if (method === 'GET' && path === '/api/assessments') {
    const live = myHistory_[0];
    return { items: [{ ...ASSESSMENT,
      state: live ? live.state : 'available',
      submission_id: live ? live.id : null,
      submitted_at: live ? live.submitted_at : null }] };
  }

  if (method === 'GET' && path === '/api/my/submissions') {
    return { items: myHistory_ };
  }

  if (method === 'GET' && path.startsWith('/api/candidates')) {
    const m = path.match(/[?&]q=([^&]+)/);
    const q = m ? decodeURIComponent(m[1]).toLowerCase() : null;
    const items = q
      ? CANDIDATES.filter((c) => c.email.toLowerCase().includes(q)
                              || (c.name || '').toLowerCase().includes(q))
      : CANDIDATES;
    return { total: items.length, items };
  }

  if (method === 'GET' && path === '/api/instructions') {
    return { markdown: INSTRUCTIONS, version: 'mock01' };
  }

  if (method === 'POST' && path === '/api/submissions') {
    pollCount = 0;
    const now = new Date().toISOString();
    me_ = { ...me_, submission_count: me_.submission_count + 1 };
    myHistory_ = [{
      id: SUBMISSIONS[0].id,
      assessment_key: ASSESSMENT.key,
      assessment_name: ASSESSMENT.name,
      assessment_slug: ASSESSMENT.slug,
      state: 'assessing',
      submitted_at: now,
    }];
    return { id: SUBMISSIONS[0].id, status: 'queued' };
  }

  // Three polls of 'processing', then 'scored' — exercises the real UI path.
  if (method === 'GET' && /^\/api\/submissions\/[^/]+\/status$/.test(path)) {
    pollCount += 1;
    const status = pollCount < 4 ? 'processing' : 'scored';
    if (status === 'scored' && myHistory_[0]) myHistory_[0].state = 'submitted';
    return { id: path.split('/')[3], status };
  }

  if (method === 'GET' && path.startsWith('/api/logs')) {
    const m = path.match(/[?&]action=([^&]+)/);
    const want = m ? decodeURIComponent(m[1]) : null;
    const items = want ? LOGS.filter((l) => l.action === want) : LOGS;
    return { total: items.length, items,
             actions: [...new Set(LOGS.map((l) => l.action))].sort() };
  }

  if (method === 'POST' && /^\/api\/submissions\/[^/]+\/void$/.test(path)) {
    const row = SUBMISSIONS.find((s) => s.id === path.split('/')[3]);
    if (!row) notFound();
    row.status = 'voided';
    return { id: row.id, status: 'voided' };
  }

  if (method === 'GET' && /^\/api\/submissions\/[^/]+$/.test(path)) {
    const row = SUBMISSIONS.find((s) => s.id === path.split('/').pop());
    if (!row) notFound();
    return row;
  }

  if (method === 'GET' && path.startsWith('/api/submissions')) {
    const p = new URLSearchParams(path.split('?')[1] || '');
    let items = SUBMISSIONS;
    if (p.get('status')) {
      const want = p.get('status');
      items = items.filter((s) => (want === 'processing'
        ? s.status === 'processing' || s.status === 'queued'
        : s.status === want));
    }
    if (p.get('stars')) items = items.filter((s) => String(s.overall_stars) === p.get('stars'));
    if (p.get('q')) {
      const q = p.get('q').toLowerCase();
      items = items.filter((s) => s.email.toLowerCase().includes(q)
                               || (s.name || '').toLowerCase().includes(q));
    }
    return {
      total: items.length,
      assessments: [ASSESSMENT],
      items: items.map((s) => ({
        id: s.id,
        email: s.email,
        name: s.name,
        status: s.status,
        duration_s: s.duration_s,
        created_at: s.created_at,
        rubric_version: s.rubric_version,
        overall: s.scores ? s.scores.overall.stars : null,
      })),
    };
  }

  const e = new Error(`mock: unhandled ${method} ${path}`);
  e.status = 500;
  throw e;
}
