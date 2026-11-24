"""Automated tests for Hymn Studio SATB Extraction and Acapella Vocal Synthesis."""

from pathlib import Path
import numpy as np
import pytest
from fastapi.testclient import TestClient

from hymn_processor.models import VoiceRole
from hymn_processor.omr_extractor import OMRExtractor
from hymn_processor.satb_separator import SATBSeparator
from hymn_processor.vocal_synthesizer import ChoralVocalSynthesizer
from hymn_processor.audio_mixer import AudioMixer
from hymn_processor.server import app


SAMPLE_MUSICXML = Path(__file__).resolve().parent.parent / "samples" / "doxology.musicxml"


def test_omr_extractor_musicxml():
    """Verify parsing a 4-part SATB MusicXML file."""
    extractor = OMRExtractor()
    score = extractor.process_file(str(SAMPLE_MUSICXML), hymn_id="test_doxology")

    assert score.title == "The Doxology (Old 100th)"
    assert score.key_signature == "G major"
    assert score.time_signature == "4/4"
    assert "soprano" in score.parts
    assert "alto" in score.parts
    assert "tenor" in score.parts
    assert "bass" in score.parts

    # Verify that notes were extracted
    soprano = score.parts["soprano"]
    assert soprano.total_notes == 16
    assert soprano.notes[0].pitch == "G4"
    assert soprano.notes[0].midi == 67
    assert soprano.notes[0].lyric == "Praise"


def test_satb_separator_ranges():
    """Verify voice parts fall within realistic SATB choral pitch ranges."""
    extractor = OMRExtractor()
    score = extractor.process_file(str(SAMPLE_MUSICXML), hymn_id="test_doxology")

    soprano = score.parts["soprano"]
    alto = score.parts["alto"]
    tenor = score.parts["tenor"]
    bass = score.parts["bass"]

    # Soprano pitch >= Alto pitch
    assert soprano.min_midi >= alto.min_midi
    # Tenor pitch >= Bass pitch
    assert tenor.min_midi >= bass.min_midi


def test_choral_vocal_synthesizer():
    """Verify vocal synthesis generates valid audio waveform buffers for all 4 parts."""
    extractor = OMRExtractor()
    score = extractor.process_file(str(SAMPLE_MUSICXML), hymn_id="test_doxology")

    synth = ChoralVocalSynthesizer(sample_rate=22050)  # fast sample rate for test

    for role_name in ["soprano", "alto", "tenor", "bass"]:
        part = score.parts[role_name]
        audio = synth.synthesize_part(part, total_duration_secs=score.total_duration_secs)

        assert isinstance(audio, np.ndarray)
        assert len(audio) > 0
        assert not np.isnan(audio).any()
        assert np.max(np.abs(audio)) > 0.05  # Has non-silent audible sound


def test_audio_mixer(tmp_path):
    """Verify stem mixing produces 4 individual files and 1 stereo mix."""
    extractor = OMRExtractor()
    score = extractor.process_file(str(SAMPLE_MUSICXML), hymn_id="test_doxology")

    synth = ChoralVocalSynthesizer(sample_rate=22050)
    stems = {
        role: synth.synthesize_part(score.parts[role.value], total_duration_secs=score.total_duration_secs)
        for role in VoiceRole
    }

    mixer = AudioMixer(sample_rate=22050)
    outputs = mixer.export_stems_and_mix(stems, output_dir=str(tmp_path), base_name="test")

    assert "soprano" in outputs
    assert "alto" in outputs
    assert "tenor" in outputs
    assert "bass" in outputs
    assert "mix" in outputs

    for key, path_str in outputs.items():
        p = Path(path_str)
        assert p.exists()
        assert p.stat().st_size > 1000


def test_api_endpoints():
    """Verify FastAPI endpoints for loading samples and streaming stems."""
    client = TestClient(app)

    # 1. Root UI serves HTML
    root_res = client.get("/")
    assert root_res.status_code == 200

    # 2. Load sample endpoint
    res = client.post("/api/load-sample")
    assert res.status_code == 200
    data = res.json()
    assert "task_id" in data
    assert "hymn_id" in data

    # 3. Check task status endpoint
    task_res = client.get(f"/api/tasks/{data['task_id']}")
    assert task_res.status_code == 200
    task_data = task_res.json()
    assert "stage" in task_data
