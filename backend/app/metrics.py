"""Scribe word entries -> delivery metrics.

Pure: no I/O, no state, no config. This is the only file in the backend that can
be tested without a network, a database, or an API key — which is why it exists
as its own module rather than living inside scoring.py.
"""

FILLERS = {
    "um", "uh", "er", "ah", "like", "basically", "actually", "literally",
    "honestly", "right", "so", "you know", "i mean", "sort of", "kind of",
}

PAUSE_THRESHOLD_S = 2.0

EMPTY = {
    "duration_s": 0.0, "speech_s": 0.0, "speech_ratio": 0.0, "word_count": 0,
    "wpm": 0.0, "pause_count_2s": 0, "longest_pause_s": 0.0, "mean_pause_s": 0.0,
    "filler_count": 0, "fillers_per_min": 0.0, "audio_events": {}, "speaker_count": 0,
    "by_speaker": {}, "conversation": {},
}

UNKNOWN_SPEAKER = "speaker_unknown"


def _fillers(spoken: list[dict]) -> int:
    return sum(1 for x in spoken if x["text"].strip().lower().strip(".,!?") in FILLERS)


def _per_min(n: int, seconds: float) -> float:
    return round(n / (seconds / 60), 1) if seconds else 0.0


def turns(spoken: list[dict]) -> list[dict]:
    """Consecutive words by one speaker, collapsed into a turn.

    Everything conversational is measured over turns rather than raw words. A
    gap between two of a speaker's words is only a hesitation if it falls INSIDE
    their own turn — the gap while the other person talks is not dead air, and
    counting it as one is how a good listener gets scored as halting.
    """
    out: list[dict] = []
    for w in spoken:
        sp = w.get("speaker_id") or UNKNOWN_SPEAKER
        if out and out[-1]["speaker"] == sp:
            out[-1]["words"].append(w)
        else:
            out.append({"speaker": sp, "words": [w]})
    for t in out:
        t["start"] = t["words"][0]["start"]
        t["end"] = t["words"][-1]["end"]
        t["text"] = " ".join(w["text"].strip() for w in t["words"]).strip()
    return out


def _speaker_stats(own: list[dict]) -> dict:
    """Delivery numbers for ONE speaker, measured only within their own turns."""
    spoken = [w for t in own for w in t["words"]]
    speech_s = round(sum(w["end"] - w["start"] for w in spoken), 2)
    gaps = [
        round(b["start"] - a["end"], 2)
        for t in own
        for a, b in zip(t["words"], t["words"][1:])
        if b["start"] > a["end"]
    ]
    fillers = _fillers(spoken)
    return {
        "word_count": len(spoken),
        "speech_s": speech_s,
        "wpm": round(len(spoken) / (speech_s / 60), 1) if speech_s else 0.0,
        "filler_count": fillers,
        "fillers_per_min": _per_min(fillers, speech_s),
        "pause_count_2s": sum(1 for g in gaps if g >= PAUSE_THRESHOLD_S),
        "longest_pause_s": max(gaps) if gaps else 0.0,
        "turn_count": len(own),
        # A turn ending in "?" is the cheap, reliable proxy for a question asked.
        # Qualification on the Sales axis is largely judged on this number.
        "question_count": sum(1 for t in own if t["text"].rstrip().endswith("?")),
        "longest_turn_s": round(max(t["end"] - t["start"] for t in own), 2) if own else 0.0,
    }


def _conversation(all_turns: list[dict], speech_by: dict[str, float]) -> dict:
    """Numbers that only exist because there are two people on the recording."""
    total = sum(speech_by.values())
    # A turn starting before the previous speaker's last word ended is one
    # person talking over another. Diarised word timings genuinely overlap when
    # that happens, which is the only reason this is measurable at all.
    interruptions: dict[str, int] = {}
    for prev, cur in zip(all_turns, all_turns[1:]):
        if cur["start"] < prev["end"]:
            interruptions[cur["speaker"]] = interruptions.get(cur["speaker"], 0) + 1
    return {
        "turn_count": len(all_turns),
        "talk_ratio": {sp: round(s / total, 3) if total else 0.0
                       for sp, s in speech_by.items()},
        "interruptions": interruptions,
        "longest_monologue_s": round(max((t["end"] - t["start"] for t in all_turns),
                                         default=0.0), 2),
    }


def derive(words: list[dict], audio_duration_s: float | None = None) -> dict:
    """Turn Scribe's word list into the delivery numbers Claude scores tone from.

    `words` entries carry a `type` of "word", "spacing", or "audio_event".

    `audio_duration_s` is Scribe's own `audio_duration_secs`. Prefer it: the last
    word's end time is not the end of the AUDIO, so trailing silence disappears
    and speech_ratio comes out flattering. Falls back to the last timestamp when
    the caller has nothing better.
    """
    spoken = [x for x in words if x.get("type") == "word"]
    events = [x for x in words if x.get("type") == "audio_event"]

    if not spoken:
        return dict(EMPTY)

    duration_s = round(
        audio_duration_s if audio_duration_s else max(x["end"] for x in words), 2
    )
    speech_s = round(sum(x["end"] - x["start"] for x in spoken), 2)

    # Gaps between consecutive spoken words. An audio event sitting inside a gap
    # does not make that gap speech.
    gaps = [
        round(b["start"] - a["end"], 2)
        for a, b in zip(spoken, spoken[1:])
        if b["start"] > a["end"]
    ]
    long_gaps = [g for g in gaps if g >= PAUSE_THRESHOLD_S]

    # wpm over SPEECH time, not wall time. A fast talker who pauses a lot is a
    # different problem from a slow talker, and wall time collapses the two into
    # the same number.
    wpm = round(len(spoken) / (speech_s / 60), 1) if speech_s else 0.0

    fillers = sum(
        1 for x in spoken
        if x["text"].strip().lower().strip(".,!?") in FILLERS
    )

    counts: dict[str, int] = {}
    for e in events:
        key = e["text"].strip().strip("()").lower()
        counts[key] = counts.get(key, 0) + 1

    speakers = {x.get("speaker_id") for x in spoken if x.get("speaker_id")}

    all_turns = turns(spoken)
    by_speaker = {
        sp: _speaker_stats([t for t in all_turns if t["speaker"] == sp])
        for sp in dict.fromkeys(t["speaker"] for t in all_turns)   # first-heard order
    }
    speech_by = {sp: s["speech_s"] for sp, s in by_speaker.items()}

    return {
        "duration_s": duration_s,
        "speech_s": speech_s,
        "speech_ratio": round(speech_s / duration_s, 3) if duration_s else 0.0,
        "word_count": len(spoken),
        "wpm": wpm,
        "pause_count_2s": len(long_gaps),
        "longest_pause_s": max(gaps) if gaps else 0.0,
        "mean_pause_s": round(sum(gaps) / len(gaps), 2) if gaps else 0.0,
        "filler_count": fillers,
        "fillers_per_min": round(fillers / (speech_s / 60), 1) if speech_s else 0.0,
        "audio_events": counts,
        "speaker_count": len(speakers),
        # Everything above is the WHOLE recording, both voices blended. On a
        # two-party call that is the wrong number to score a rep on — their wpm
        # and filler rate are diluted by the customer's. Tone reads by_speaker;
        # the blended figures stay because the admin metrics strip renders them.
        "by_speaker": by_speaker,
        "conversation": _conversation(all_turns, speech_by),
    }
