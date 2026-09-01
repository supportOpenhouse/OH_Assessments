from app.metrics import derive


def w(text, start, end, type="word", speaker_id="speaker_0"):
    return {"text": text, "start": start, "end": end, "type": type, "speaker_id": speaker_id}


def test_counts_words_and_ignores_spacing():
    words = [w("Hello", 0.0, 0.4), w(" ", 0.4, 0.5, type="spacing"), w("there", 0.5, 0.9)]
    assert derive(words)["word_count"] == 2


def test_wpm_uses_speech_time_not_wall_time():
    # 10 words inside 5s of speech, then a 55s silence.
    words = [w(f"w{i}", i * 0.5, i * 0.5 + 0.5) for i in range(10)]
    words.append(w("end", 60.0, 60.5))
    m = derive(words)
    # Wall time is 60.5s; speech time is ~5.5s. Wall-time wpm would be ~11.
    assert m["wpm"] > 50, "wpm must be computed over speech time, not wall time"


def test_detects_pauses_over_two_seconds():
    words = [w("a", 0.0, 0.5), w("b", 3.5, 4.0), w("c", 4.2, 4.6)]
    m = derive(words)
    assert m["pause_count_2s"] == 1
    assert m["longest_pause_s"] == 3.0


def test_counts_fillers_case_insensitively():
    words = [w("Um", 0.0, 0.2), w("basically", 0.3, 0.8), w("house", 0.9, 1.2)]
    assert derive(words)["filler_count"] == 2


def test_collects_audio_events():
    words = [w("hi", 0.0, 0.3), w("(laughter)", 0.4, 1.0, type="audio_event")]
    m = derive(words)
    assert m["audio_events"] == {"laughter": 1}
    assert m["word_count"] == 1, "audio events are not words"


def test_counts_distinct_speakers():
    words = [w("hi", 0.0, 0.3), w("yo", 0.4, 0.7, speaker_id="speaker_1")]
    assert derive(words)["speaker_count"] == 2


def test_empty_input_does_not_divide_by_zero():
    m = derive([])
    assert m["word_count"] == 0 and m["wpm"] == 0.0 and m["speech_ratio"] == 0.0


def test_speech_ratio_flags_dead_air():
    # 2s of speech spread across a 10s recording.
    words = [w("a", 0.0, 1.0), w("b", 9.0, 10.0)]
    m = derive(words)
    assert m["speech_ratio"] == 0.2


def test_scribes_own_duration_wins_over_the_last_word_end():
    """The last word ends at 1.0s but the clip runs 30s — 29 seconds of trailing
    silence that `max(end)` cannot see. Reporting 1.0s here would put
    speech_ratio at 1.0 on a recording that is mostly silence."""
    words = [w("hello", 0.0, 0.5), w("there", 0.6, 1.0)]
    m = derive(words, audio_duration_s=30.0)
    assert m["duration_s"] == 30.0
    assert m["speech_ratio"] == round(0.9 / 30.0, 3)


def test_duration_falls_back_to_the_last_timestamp():
    words = [w("hello", 0.0, 0.5), w("there", 0.6, 1.0)]
    assert derive(words)["duration_s"] == 1.0
    assert derive(words, audio_duration_s=None)["duration_s"] == 1.0
