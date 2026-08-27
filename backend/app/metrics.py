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
}


def derive(words: list[dict]) -> dict:
    """Turn Scribe's word list into the delivery numbers Claude scores tone from.

    `words` entries carry a `type` of "word", "spacing", or "audio_event".
    """
    spoken = [x for x in words if x.get("type") == "word"]
    events = [x for x in words if x.get("type") == "audio_event"]

    if not spoken:
        return dict(EMPTY)

    duration_s = round(max(x["end"] for x in words), 2)
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
    }
