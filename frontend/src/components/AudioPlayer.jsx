import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IconPlay, IconPause, IconBack10, IconForward10,
  // Parked for the commented-out controls below.
  // eslint-disable-next-line no-unused-vars
  IconVolume, IconHeart, IconPrev, IconNext,
} from './icons.jsx';
import { mmss } from '../utils/format.js';

// Audio player, ported from the supplied card.
//
// Live: play/pause, a seekable progress bar, elapsed/total. The card's skip
// track buttons are replaced by -10s / +10s, which is what you actually want
// when re-listening to one recording.
//
// The volume slider, the "now playing" equaliser, the title block and the like
// button are KEPT BUT COMMENTED OUT — their CSS is still in styles.css, so
// uncommenting is all it takes to bring them back.
//
// Ported off styled-components: that would be a dependency for one component,
// and every other style in this app lives in styles.css.

const SKIP = 10;

export default function AudioPlayer({ src, preload = 'metadata', label = 'Recording' }) {
  const ref = useRef(null);
  const barRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onTime = () => setTime(el.currentTime);
    // `durationchange` as well as `loadedmetadata`: a streamed file reports
    // Infinity first and only settles once enough has arrived.
    const onMeta = () => setDuration(Number.isFinite(el.duration) ? el.duration : 0);
    const onEnd = () => setPlaying(false);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('durationchange', onMeta);
    el.addEventListener('ended', onEnd);
    el.addEventListener('play', () => setPlaying(true));
    el.addEventListener('pause', () => setPlaying(false));
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('durationchange', onMeta);
      el.removeEventListener('ended', onEnd);
    };
  }, [src]);

  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {}); else el.pause();
  }, []);

  const nudge = useCallback((by) => {
    const el = ref.current;
    if (!el) return;
    el.currentTime = Math.min(Math.max(0, el.currentTime + by), el.duration || 0);
  }, []);

  const seekTo = useCallback((clientX) => {
    const el = ref.current;
    const bar = barRef.current;
    if (!el || !bar || !duration) return;
    const r = bar.getBoundingClientRect();
    const ratio = Math.min(Math.max(0, (clientX - r.left) / r.width), 1);
    el.currentTime = ratio * duration;
    setTime(el.currentTime);
  }, [duration]);

  const pct = duration ? (time / duration) * 100 : 0;

  return (
    <div className="player">
      <audio ref={ref} src={src} preload={preload} />

      {/*
      // ── Now playing: artwork, equaliser, title. Kept for later.
      <div className="top">
        <div className="pfp">
          <div className="playing">
            <div className="greenline line-1" />
            <div className="greenline line-2" />
            <div className="greenline line-3" />
            <div className="greenline line-4" />
            <div className="greenline line-5" />
          </div>
        </div>
        <div className="texts">
          <p className="title-1">Title</p>
          <p className="title-2">Subtitle</p>
        </div>
      </div>
      */}

      <div className="controls">
        {/*
        // ── Volume. Kept for later.
        <button type="button" className="volume_button" aria-label="Volume"><IconVolume /></button>
        <div className="volume">
          <div className="slider"><div className="green" /></div>
          <div className="circle" />
        </div>
        // ── Previous / next track. Replaced by -10s / +10s below.
        <button type="button" aria-label="Previous"><IconPrev /></button>
        <button type="button" aria-label="Next"><IconNext /></button>
        */}

        <button type="button" className="player-btn" onClick={() => nudge(-SKIP)}
                aria-label={`Back ${SKIP} seconds`}>
          <IconBack10 />
          <span className="player-skip-n">{SKIP}</span>
        </button>

        <button type="button" className="player-btn player-play" onClick={toggle}
                aria-label={playing ? `Pause ${label}` : `Play ${label}`}>
          {playing ? <IconPause size={20} /> : <IconPlay size={20} />}
        </button>

        <button type="button" className="player-btn" onClick={() => nudge(SKIP)}
                aria-label={`Forward ${SKIP} seconds`}>
          <IconForward10 />
          <span className="player-skip-n">{SKIP}</span>
        </button>

        {/*
        // ── Like. Kept for later.
        <div className="air" />
        <button type="button" aria-label="Like"><IconHeart /></button>
        */}

        <span className="timetext time_now">{mmss(time)}</span>

        {/* A real slider, not a div: it gets keyboard seeking and a screen
            reader announcement for free, which a click-handler on a bar does not. */}
        <div
          ref={barRef}
          className="time"
          role="slider"
          tabIndex={0}
          aria-label={`Seek ${label}`}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          aria-valuetext={`${mmss(time)} of ${mmss(duration)}`}
          onMouseDown={(e) => { seekTo(e.clientX); e.preventDefault(); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') { nudge(5); e.preventDefault(); }
            if (e.key === 'ArrowLeft') { nudge(-5); e.preventDefault(); }
            if (e.key === ' ' || e.key === 'Enter') { toggle(); e.preventDefault(); }
          }}
        >
          <div className="elapsed" style={{ width: `${pct}%` }} />
        </div>

        <span className="timetext time_full">{mmss(duration)}</span>
      </div>
    </div>
  );
}
