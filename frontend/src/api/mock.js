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
    status: 'scored',
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

let me_ = {
  email: 'you@openhouse.in',
  name: 'You',
  role: 'admin',
  submission_status: 'pending',
};

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

  if (method === 'GET' && path === '/api/instructions') {
    return { markdown: INSTRUCTIONS, version: 'mock01' };
  }

  if (method === 'POST' && path === '/api/submissions') {
    pollCount = 0;
    me_ = {
      ...me_,
      submission_status: 'submitted',
      submission_id: SUBMISSIONS[0].id,
      submitted_at: new Date().toISOString(),
    };
    return { id: SUBMISSIONS[0].id, status: 'queued' };
  }

  // Three polls of 'processing', then 'scored' — exercises the real UI path.
  if (method === 'GET' && /^\/api\/submissions\/[^/]+\/status$/.test(path)) {
    pollCount += 1;
    return { id: path.split('/')[3], status: pollCount < 4 ? 'processing' : 'scored' };
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
    return {
      total: SUBMISSIONS.length,
      items: SUBMISSIONS.map((s) => ({
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
