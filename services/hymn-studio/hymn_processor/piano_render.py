"""Render a score to piano audio with no downloads or services.

If FluidSynth and a SoundFont are installed (FLUIDSYNTH_SOUNDFONT=/path/to/piano.sf2),
that realistic piano is used. Otherwise a small built-in synthesizer plays the notes:
a few decaying harmonics with a hammer-like attack, which is clear enough to rehearse
parts by ear.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

RATE = 44100


VOICE_NAMES = {(0, "1"): "soprano", (0, "2"): "alto", (1, "1"): "tenor", (1, "2"): "bass",
               # (newer scores number the left hand's voices 3 and 4)
               (1, "3"): "tenor", (1, "4"): "bass"}


def voice_events(musicxml_path: str | Path, bpm: float) -> dict[str, list[tuple[float, float, int]]]:
    """(start_sec, dur_sec, midi) per SATB voice; tied notes joined.

    The score is a grand staff: right hand voice 1/2 = soprano/alto, left hand = tenor/bass.
    """
    import music21

    score = music21.converter.parse(str(musicxml_path)).stripTies()
    sec = 60.0 / bpm
    out: dict[str, list] = {v: [] for v in VOICE_NAMES.values()}
    for pi, part in enumerate(score.parts[:2]):
        for voice in part.recurse().getElementsByClass(music21.stream.Voice):
            name = VOICE_NAMES.get((pi, str(voice.id)))
            if not name:
                continue
            for n in voice.notes:
                start = float(n.getOffsetInHierarchy(score))
                for p in n.pitches:
                    out[name].append((start * sec, float(n.quarterLength) * sec, p.midi))
    for v in out.values():
        v.sort()
    return out


def note_events(musicxml_path: str | Path, bpm: float) -> list[tuple[float, float, int]]:
    """All voices together; a note sung by two voices in unison is struck once."""
    seen, events = set(), []
    for evs in voice_events(musicxml_path, bpm).values():
        for e in evs:
            key = (round(e[0], 3), e[2])
            if key not in seen:
                seen.add(key)
                events.append(e)
    return sorted(events)


def _piano_tone(midi: int, dur: float) -> np.ndarray:
    f0 = 440.0 * 2 ** ((midi - 69) / 12)
    length = dur + 0.6  # let it ring briefly after release
    t = np.arange(int(length * RATE)) / RATE
    tone = np.zeros_like(t)
    b = 0.0004  # slight string inharmonicity
    for k, amp in enumerate((1.0, 0.55, 0.3, 0.18, 0.1, 0.06), start=1):
        fk = f0 * k * np.sqrt(1 + b * k * k)
        if fk > RATE / 2:
            break
        decay = np.exp(-t * (1.2 + 0.9 * k) * (0.6 + f0 / 900))
        tone += amp * decay * np.sin(2 * np.pi * fk * t)
    attack = np.minimum(1.0, t / 0.004)
    release = np.where(t > dur, np.exp(-(t - dur) * 9), 1.0)
    return tone * attack * release


def _plain_tone(midi: int, dur: float) -> np.ndarray:
    """A soft, steady flute-like tone held for the whole note, so the exact pitch is easy to hear.

    Mostly the fundamental with a little 2nd and 3rd harmonic: rounder than a bare sine and kinder
    in chords. Gentle 30 ms fade in/out avoids clicks; a short gap separates repeated notes.
    """
    f0 = 440.0 * 2 ** ((midi - 69) / 12)
    length = dur + 0.1
    t = np.arange(int(length * RATE)) / RATE
    tone = np.sin(2 * np.pi * f0 * t) + 0.18 * np.sin(2 * np.pi * 2 * f0 * t) + 0.06 * np.sin(2 * np.pi * 3 * f0 * t)
    # Low notes sound weaker to the ear: lift them a little.
    tone *= 1.0 + 0.5 * max(0.0, (60 - midi) / 24)
    attack = np.minimum(1.0, t / 0.03)
    end = max(0.05, dur - 0.05)
    release = np.clip(1 - (t - end) / 0.06, 0, 1)
    return tone * attack * release * 0.5


def synth(events: list[tuple[float, float, int]], timbre: str = "piano") -> np.ndarray:
    total = max((s + d for s, d, _ in events), default=0) + 1.5
    mix = np.zeros(int(total * RATE))
    voice = _plain_tone if timbre == "tone" else _piano_tone
    for start, dur, midi in events:
        tone = voice(midi, dur)
        i = int(start * RATE)
        mix[i : i + len(tone)] += tone[: len(mix) - i]
    return mix


def render_builtin(events: list[tuple[float, float, int]], out_wav: Path, timbre: str = "piano") -> Path:
    mix = synth(events, timbre)
    peak = np.max(np.abs(mix)) or 1.0
    sf.write(out_wav, (mix / peak * 0.85).astype(np.float32), RATE)
    return out_wav


def write_voice_set(tracks: dict[str, list], files: dict[str, Path], timbre: str) -> None:
    """Write the all-voices track and the four voice tracks.

    The app plays the four voice tracks together, so they share ONE level: their sum peaks at 0.9
    instead of each voice being made as loud as possible (which made the mix clip badly).
    The all-voices track is levelled on its own.
    """
    voices = {k: synth(v, timbre) for k, v in tracks.items() if k != "all" and v}
    if voices:
        n = max(len(x) for x in voices.values())
        padded = {k: np.pad(x, (0, n - len(x))) for k, x in voices.items()}
        peak = np.max(np.abs(sum(padded.values()))) or 1.0
        for k, x in padded.items():
            sf.write(files[k], (x / peak * 0.9).astype(np.float32), RATE)
    if tracks.get("all"):
        render_builtin(tracks["all"], files["all"], timbre)


def _fluidsynth(events, out_wav: Path, sf2: str) -> None:
    import mido

    mid = mido.MidiFile(ticks_per_beat=480)
    track = mido.MidiTrack()
    mid.tracks.append(track)
    tick = lambda t: int(round(t * 2 * 480))  # tempo 120 → 1 s = 2 beats  # noqa: E731
    msgs = []
    for start, dur, midi in events:
        msgs += [(tick(start), "note_on", midi), (tick(start + dur), "note_off", midi)]
    now = 0
    for t, kind, midi in sorted(msgs, key=lambda m: (m[0], m[1] == "note_on")):
        track.append(mido.Message(kind, note=midi, velocity=80 if kind == "note_on" else 0, time=t - now))
        now = t
    tmp = out_wav.with_suffix(".tmp.mid")
    mid.save(tmp)
    subprocess.run(["fluidsynth", "-ni", "-F", str(out_wav), "-r", str(RATE), sf2, str(tmp)], check=True, capture_output=True)
    tmp.unlink(missing_ok=True)


def render(musicxml_path: Path, midi_path: Path, out_wav: Path, bpm: float = 80) -> tuple[dict[str, Path], str]:
    """Write piano WAVs for all voices together and for each voice alone (plus .m4a on macOS).

    Returns ({"all": path, "soprano": path, ...}, engine).
    """
    sf2 = os.environ.get("FLUIDSYNTH_SOUNDFONT")
    use_fs = bool(sf2 and Path(sf2).exists() and shutil.which("fluidsynth"))
    tracks = {"all": note_events(musicxml_path, bpm), **voice_events(musicxml_path, bpm)}
    names = {name: (out_wav if name == "all" else out_wav.with_name(f"{out_wav.stem}-{name}.wav")) for name, ev in tracks.items() if ev}
    if not use_fs:
        write_voice_set(tracks, names, "piano")
    files = {}
    for name, events in tracks.items():
        if not events:
            continue
        wav = names[name]
        if use_fs:
            _fluidsynth(events, wav, sf2)
        if shutil.which("afconvert"):
            subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", str(wav), str(wav.with_suffix(".m4a"))],
                           check=False, capture_output=True)
        files[name] = wav
    return files, "fluidsynth" if use_fs else "built-in"


def render_tones(musicxml_path: Path, out_dir: Path, slug: str, bpm: float = 80) -> dict[str, Path]:
    """Plain-tone ("just notes") versions of the practice tracks: <slug>-tone.wav and <slug>-tone-<voice>.wav."""
    tracks = {"all": note_events(musicxml_path, bpm), **voice_events(musicxml_path, bpm)}
    files = {name: out_dir / (f"{slug}-tone.wav" if name == "all" else f"{slug}-tone-{name}.wav")
             for name, ev in tracks.items() if ev}
    write_voice_set(tracks, files, "tone")
    return files
