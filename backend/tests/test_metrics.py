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


# ── two-party calls ───────────────────────────────────────────────────────
# The recordings are a salesperson and a customer. Every delivery number that
# gets attributed to the rep has to be measured on the rep alone; a blended
# figure scores them partly on how the customer talks.

def rep(text, start, end):
    return w(text, start, end, speaker_id="speaker_0")


def cust(text, start, end):
    return w(text, start, end, speaker_id="speaker_1")


def test_fillers_are_attributed_to_the_speaker_who_said_them():
    words = [rep("hello", 0.0, 1.0), cust("um", 1.0, 2.0), cust("um", 2.0, 3.0)]
    m = derive(words)
    assert m["by_speaker"]["speaker_0"]["filler_count"] == 0
    assert m["by_speaker"]["speaker_1"]["filler_count"] == 2
    # The blended figure still exists for the admin strip, and is still wrong to
    # score a rep on — which is the whole reason by_speaker exists.
    assert m["filler_count"] == 2


def test_a_pause_while_the_other_person_talks_is_not_hesitation():
    """The rep says one word, listens for 8s, then answers. Measured across all
    words that is an 8s searching pause; measured within their own turns it is
    not a pause at all. Scoring the first number punishes listening."""
    words = [rep("hello", 0.0, 0.5),
             cust("about", 1.0, 2.0), cust("six", 2.0, 4.0), cust("months", 4.5, 9.0),
             rep("understood", 9.5, 10.5)]
    m = derive(words)
    # 9 seconds separate the rep's two words. Every one of them is the customer
    # talking, so none of it is the rep hesitating.
    assert words[4]["start"] - words[0]["end"] == 9.0
    assert m["by_speaker"]["speaker_0"]["longest_pause_s"] == 0.0
    assert m["by_speaker"]["speaker_0"]["pause_count_2s"] == 0


def test_talk_ratio_and_questions_are_measured_per_speaker():
    words = [rep("what is your timeline?", 0.0, 2.0),
             cust("about", 2.0, 3.0), cust("six months", 3.0, 5.0),
             rep("understood", 5.0, 6.0)]
    m = derive(words)
    assert m["by_speaker"]["speaker_0"]["question_count"] == 1
    assert m["by_speaker"]["speaker_1"]["question_count"] == 0
    # rep spoke 3s of the 6s total
    assert m["conversation"]["talk_ratio"] == {"speaker_0": 0.5, "speaker_1": 0.5}
    assert m["conversation"]["turn_count"] == 3


def test_an_interruption_is_credited_to_the_one_who_cut_in():
    # The rep starts talking at 1.5s while the customer runs to 2.0s.
    words = [cust("i was saying", 0.0, 2.0), rep("right but", 1.5, 3.0)]
    assert derive(words)["conversation"]["interruptions"] == {"speaker_0": 1}


def test_turns_collapse_consecutive_words_by_one_speaker():
    from app.metrics import turns
    t = turns([rep("a", 0, 1), rep("b", 1, 2), cust("c", 2, 3), rep("d", 3, 4)])
    assert [x["speaker"] for x in t] == ["speaker_0", "speaker_1", "speaker_0"]
    assert t[0]["text"] == "a b"


def test_a_one_voice_recording_still_produces_numbers():
    """Diarisation can come back with a single speaker. Nothing may divide by
    zero, and the conversation block must not claim an interaction happened."""
    m = derive([rep("hello", 0.0, 1.0), rep("there", 1.0, 2.0)])
    assert m["speaker_count"] == 1
    assert list(m["by_speaker"]) == ["speaker_0"]
    assert m["conversation"]["talk_ratio"] == {"speaker_0": 1.0}
    assert m["conversation"]["interruptions"] == {}
