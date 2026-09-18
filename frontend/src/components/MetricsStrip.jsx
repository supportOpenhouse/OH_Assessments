import { mmss } from '../utils/format.js';

// Ruled columns, not tiles. Every figure tabular so the values line up.
//
// Each figure is graded good / above avg / below avg / bad and coloured
// green / yellow / orange / red.
//
// WHOSE figures: on a two-party call the recording-wide numbers blend the
// salesperson with the customer, so grading them would colour the customer's
// delivery into the candidate's result. Pace, fillers, pauses and words are
// therefore the SALESPERSON's own (metrics.by_speaker[scores.salesperson]).
// Speech ratio and duration describe the call itself and stay recording-wide.
// A row scored before the model named a salesperson shows the blended figures,
// labelled as such and left ungraded — a colour on a blended number is a grade
// for two people at once.

// PROVISIONAL. Set against one real scored call (rep: 317 wpm, 6.6 fillers/min,
// 0.66s longest pause, 65% of the talk, 60% speech ratio, 70s) plus reasoning —
// not calibrated. Same status as the rubric; tune these against more calls.
//
// Each entry is three NESTED ranges [lo, hi] — good, above avg, below avg —
// and anything outside the widest is bad. Nesting is what lets one grader
// handle both one-sided metrics (fillers: lower is better) and two-sided ones
// (pace: too slow and too fast are both bad).
const BANDS = {
  // Measured over SPEECH time — the sum of word durations, every inter-word
  // micro-gap removed — so it runs far above the textbook 140-160 wall-clock
  // figure. Textbook bands would paint every call red.
  wpm: [[250, 340], [220, 380], [190, 420]],
  // Per minute of speech. English-only filler list, so Hinglish "matlab / woh /
  // yaani" is invisible here and a Hinglish speaker grades flattering.
  fillers: [[0, 3], [0, 6], [0, 9]],
  // Recording-wide share that is speech. Low means dead air on the line.
  speechRatio: [[0.65, 1], [0.55, 1], [0.45, 1]],
  // Longest gap INSIDE the salesperson's own turns — waiting while the customer
  // talks is listening, not hesitation, and is not counted.
  pause: [[0, 1.5], [0, 3], [0, 5]],
  // "words" is graded on the salesperson's SHARE of the talk, not the raw
  // count: a count only measures length, and the rubric rewards a rep who lets
  // the lead talk. Leading the call without monologuing sits around half.
  talkShare: [[0.40, 0.60], [0.30, 0.70], [0.20, 0.80]],
  // Against the task's 2-3 minute brief (app/assessments.py `target_length`).
  duration: [[120, 180], [90, 240], [60, 300]],
};

const GRADES = ['good', 'high', 'low'];
const LABEL = { good: 'good', high: 'above avg', low: 'below avg', bad: 'bad' };

function grade(value, ranges) {
  if (value == null) return null;
  const i = ranges.findIndex(([lo, hi]) => value >= lo && value <= hi);
  return i === -1 ? 'bad' : GRADES[i];
}

const pct = (x) => `${Math.round(x * 100)}%`;

export default function MetricsStrip({ metrics, salesperson }) {
  if (!metrics) return null;

  const repId = salesperson?.speaker;
  const rep = repId ? metrics.by_speaker?.[repId] : undefined;
  const share = rep ? metrics.conversation?.talk_ratio?.[repId] : undefined;

  // [value shown, label, grade, sub-line]
  const cells = rep
    ? [
      [rep.wpm, 'words / min', grade(rep.wpm, BANDS.wpm)],
      [rep.fillers_per_min, 'fillers / min', grade(rep.fillers_per_min, BANDS.fillers)],
      [pct(metrics.speech_ratio), 'speech ratio', grade(metrics.speech_ratio, BANDS.speechRatio)],
      [`${rep.longest_pause_s}s`, 'longest pause', grade(rep.longest_pause_s, BANDS.pause)],
      [rep.word_count, 'words', grade(share, BANDS.talkShare), `${pct(share)} of the talk`],
      [mmss(metrics.duration_s), 'duration', grade(metrics.duration_s, BANDS.duration)],
    ]
    : [
      [metrics.wpm, 'words / min', null],
      [metrics.fillers_per_min, 'fillers / min', null],
      [pct(metrics.speech_ratio), 'speech ratio', grade(metrics.speech_ratio, BANDS.speechRatio)],
      [`${metrics.longest_pause_s}s`, 'longest pause', null],
      [metrics.word_count, 'words', null],
      [mmss(metrics.duration_s), 'duration', grade(metrics.duration_s, BANDS.duration)],
    ];

  const events = Object.entries(metrics.audio_events || {});

  return (
    <>
      <p className="metrics-who">
        {rep
          ? <>Salesperson&rsquo;s delivery · <span className="num">{repId}</span></>
          : 'Whole call · no salesperson identified — re-score to grade pace, fillers, pauses and talk share'}
      </p>
      <div className="metrics">
        {cells.map(([v, k, g, sub]) => (
          <div className="metric" key={k} data-grade={g || undefined}>
            <div className="metric-v">{v ?? '—'}</div>
            <div className="metric-k">{k}</div>
            {sub && <div className="metric-sub">{sub}</div>}
            {/* The word, not only the colour: red/green is the pair colour-blind
                readers most often cannot tell apart. */}
            {g && <div className="metric-grade">{LABEL[g]}</div>}
          </div>
        ))}
      </div>
      {/* Flag, don't punish — a second voice is usually background audio. */}
      {metrics.speaker_count > 1 && (
        <p className="metric-flag">{metrics.speaker_count} speakers detected</p>
      )}
      {events.length > 0 && (
        <p className="metric-flag">
          {events.map(([k, n]) => `${n}× ${k}`).join(' · ')}
        </p>
      )}
    </>
  );
}
