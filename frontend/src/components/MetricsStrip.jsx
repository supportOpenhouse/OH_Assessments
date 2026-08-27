import { mmss } from '../utils/format.js';

// Ruled columns, not tiles. Every figure monospaced and tabular so the values
// line up between rows.
export default function MetricsStrip({ metrics }) {
  if (!metrics) return null;

  const cells = [
    [metrics.wpm, 'words / min'],
    [metrics.fillers_per_min, 'fillers / min'],
    [`${Math.round((metrics.speech_ratio ?? 0) * 100)}%`, 'speech ratio'],
    [`${metrics.longest_pause_s}s`, 'longest pause'],
    [metrics.word_count, 'words'],
    [mmss(metrics.duration_s), 'duration'],
  ];

  const events = Object.entries(metrics.audio_events || {});

  return (
    <>
      <div className="metrics">
        {cells.map(([v, k]) => (
          <div className="metric" key={k}>
            <div className="metric-v">{v ?? '—'}</div>
            <div className="metric-k">{k}</div>
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
