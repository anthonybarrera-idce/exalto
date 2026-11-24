"""Acapella Singing Voice Synthesizer (SVS) using source-filter formant synthesis.

Features legato portamento, continuous phase transitions, vowel formant interpolation,
and voice models for Soprano, Alto, Tenor, and Bass (SATB).
"""

import math
import re
from typing import Dict, List, Optional, Tuple
import numpy as np
from scipy import signal

from .models import NoteEvent, VoicePart, VoiceRole


# Formant frequencies (F1, F2, F3 in Hz) and bandwidths (B1, B2, B3 in Hz) for neutral vowel timbres
VOWEL_FORMANTS = {
    "a": {"f": [800, 1200, 2500], "bw": [80, 100, 120]},   # as in "father", "god", "all", "más", "la"
    "e": {"f": [530, 1840, 2500], "bw": [60, 90, 100]},    # as in "bless", "praise", "en", "che", "de"
    "i": {"f": [270, 2290, 3010], "bw": [50, 100, 120]},   # as in "sing", "him", "mi", "si", "ní"
    "o": {"f": [500, 900, 2400], "bw": [70, 80, 100]},     # as in "flow", "soul", "no", "do", "mor"
    "u": {"f": [300, 870, 2240], "bw": [60, 80, 100]},     # as in "you", "whom", "tu", "su", "luz"
}

# Voice-specific vocal tract scaling and vocal dynamics
VOICE_PROFILES = {
    VoiceRole.SOPRANO: {
        "formant_scale": 1.15,      # Shorter female vocal tract
        "vibrato_rate": 5.5,        # Hz
        "vibrato_depth": 0.014,     # Pitch modulation depth (~0.5 semitones)
        "vibrato_delay": 0.14,      # Vibrato onset delay in seconds
        "breath_level": 0.025,      # Subtle airy choir breath
        "odd_even_ratio": 0.75,     # Pure, bell-like harmonic profile
        "gain": 0.88,
    },
    VoiceRole.ALTO: {
        "formant_scale": 1.04,      # Warm contralto/mezzo tract
        "vibrato_rate": 5.2,
        "vibrato_depth": 0.012,
        "vibrato_delay": 0.15,
        "breath_level": 0.02,
        "odd_even_ratio": 0.88,     # Rich warm chest/head balance
        "gain": 0.90,
    },
    VoiceRole.TENOR: {
        "formant_scale": 0.95,      # Bright resonant male tract
        "vibrato_rate": 5.3,
        "vibrato_depth": 0.015,
        "vibrato_delay": 0.12,
        "breath_level": 0.02,
        "odd_even_ratio": 1.05,     # Singer's formant boost in upper harmonics
        "gain": 0.90,
    },
    VoiceRole.BASS: {
        "formant_scale": 0.88,      # Long resonant male tract
        "vibrato_rate": 4.8,
        "vibrato_depth": 0.011,
        "vibrato_delay": 0.16,
        "breath_level": 0.015,
        "odd_even_ratio": 1.25,     # Deep warm fundamental and lower chest resonance
        "gain": 0.95,
    },
}


def detect_vowel_from_syllable(syllable: Optional[str]) -> str:
    """Classify the primary singing vowel from lyric syllables (Spanish and English)."""
    if not syllable:
        return "a"

    clean = syllable.lower().strip()
    clean = clean.replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")
    clean = re.sub(r"[^a-z]", "", clean)
    if not clean:
        return "a"

    if any(w in clean for w in ["praise", "grace", "day", "way", "name", "faith", "great", "fe", "se", "te", "me", "que", "de", "re", "che"]):
        return "e"
    if any(w in clean for w in ["god", "father", "all", "heart", "call", "fall", "mas", "ta", "la", "pa", "va", "da", "sal"]):
        return "a"
    if any(w in clean for w in ["sing", "him", "in", "it", "is", "with", "king", "mi", "si", "ti", "ni", "di"]):
        return "i"
    if any(w in clean for w in ["flow", "soul", "holy", "lord", "hope", "glory", "no", "so", "to", "lo", "do", "co", "yo", "mor"]):
        return "o"
    if any(w in clean for w in ["whom", "you", "through", "true", "new", "tu", "su", "luz"]):
        return "u"

    for char in clean:
        if char in ["a", "e", "i", "o", "u"]:
            return char

    return "a"


class ChoralVocalSynthesizer:
    """Synthesizes smooth, natural singing voice stems with legato portamento and continuous vocal tract resonance."""

    def __init__(self, sample_rate: int = 44100):
        self.sample_rate = sample_rate

    def synthesize_part(self, part: VoicePart, total_duration_secs: float) -> np.ndarray:
        """Synthesize an isolated vocal stem track for one voice part (S, A, T, or B)."""
        total_samples = int(math.ceil(total_duration_secs * self.sample_rate))
        audio = np.zeros(total_samples, dtype=np.float32)

        profile = VOICE_PROFILES[part.role]
        formant_scale = profile["formant_scale"]

        # Filter out rests
        valid_notes = [n for n in part.notes if not n.is_rest and n.frequency_hz > 0]
        if not valid_notes:
            return audio

        # Continuous phase carryover from note to note
        running_phase = 0.0

        for i, note in enumerate(valid_notes):
            # Inspect previous and next note for legato portamento context
            prev_note = valid_notes[i - 1] if i > 0 else None
            next_note = valid_notes[i + 1] if i + 1 < len(valid_notes) else None

            # Is note connected legato to previous note? (gap < 40ms)
            is_legato_prev = False
            prev_freq = note.frequency_hz
            if prev_note:
                prev_end = prev_note.start_time + prev_note.duration
                if note.start_time - prev_end < 0.06:
                    is_legato_prev = True
                    prev_freq = prev_note.frequency_hz

            # Is note connected legato to next note?
            is_legato_next = False
            if next_note:
                note_end = note.start_time + note.duration
                if next_note.start_time - note_end < 0.06:
                    is_legato_next = True

            note_samples, running_phase = self._synthesize_legato_note(
                note=note,
                profile=profile,
                formant_scale=formant_scale,
                prev_freq=prev_freq,
                is_legato_prev=is_legato_prev,
                is_legato_next=is_legato_next,
                start_phase=running_phase,
            )

            start_idx = int(round(note.start_time * self.sample_rate))
            end_idx = start_idx + len(note_samples)

            if start_idx >= total_samples:
                continue

            if end_idx > total_samples:
                note_samples = note_samples[: total_samples - start_idx]
                end_idx = total_samples

            # Crossfade mix into stem buffer with overlap
            audio[start_idx:end_idx] += note_samples

        # Smooth peak limiter and normalization
        max_val = np.max(np.abs(audio))
        if max_val > 0.001:
            audio = (audio / max_val) * profile["gain"]

        return audio

    def _synthesize_legato_note(
        self,
        note: NoteEvent,
        profile: dict,
        formant_scale: float,
        prev_freq: float,
        is_legato_prev: bool,
        is_legato_next: bool,
        start_phase: float,
    ) -> Tuple[np.ndarray, float]:
        """Synthesize a note with S-curve pitch glide (portamento) and continuous phase."""
        # Extend note slightly (35 ms) when connected for seamless crossfade
        overlap_sec = 0.035 if is_legato_next else 0.0
        duration = max(note.duration + overlap_sec, 0.06)
        num_samples = int(duration * self.sample_rate)
        t = np.linspace(0, duration, num_samples, endpoint=False)

        # 1. Smooth Legato Pitch Glide (Portamento)
        f0 = note.frequency_hz
        freq_curve = np.full(num_samples, f0, dtype=np.float32)

        if is_legato_prev and abs(prev_freq - f0) > 0.5:
            # Glide over 55ms using a smooth half-cosine S-curve
            glide_sec = min(0.065, duration * 0.45)
            glide_samples = int(glide_sec * self.sample_rate)
            if glide_samples > 1:
                # S-curve: 0 at start, 1 at end
                s_curve = 0.5 * (1.0 - np.cos(np.linspace(0, np.pi, glide_samples)))
                freq_curve[:glide_samples] = prev_freq + (f0 - prev_freq) * s_curve

        # 2. Delayed Choral Vibrato (natural warm onset)
        vibrato_rate = profile["vibrato_rate"]
        vibrato_depth = profile["vibrato_depth"]
        vibrato_delay = profile["vibrato_delay"]

        # Vibrato ramps in gently after onset
        vibrato_env = np.clip((t - vibrato_delay) / 0.18, 0.0, 1.0)
        vibrato = vibrato_depth * np.sin(2 * np.pi * vibrato_rate * t) * vibrato_env

        # Organic micro-drift
        drift = 0.0015 * np.sin(2 * np.pi * 0.7 * t)
        final_freq_curve = freq_curve * (1.0 + vibrato + drift)

        # Continuous Phase Integration
        delta_phase = 2 * np.pi * final_freq_curve / self.sample_rate
        phase = start_phase + np.cumsum(delta_phase)
        end_phase = float(phase[-1] % (2 * np.pi))

        # 3. Rich Glottal Harmonic Generator
        odd_even = profile["odd_even_ratio"]
        glottal_source = np.zeros(num_samples, dtype=np.float32)

        max_harmonic = min(28, int((self.sample_rate * 0.45) / max(f0, 50.0)))
        for h in range(1, max_harmonic + 1):
            h_amp = 1.0 / (h ** 1.12)
            if h % 2 == 0:
                h_amp *= odd_even
            glottal_source += h_amp * np.sin(h * phase)

        # Gentle choir breathiness
        breath = np.random.normal(0, 1, num_samples).astype(np.float32)
        sos_breath = signal.butter(2, [700, 3800], btype="bandpass", fs=self.sample_rate, output="sos")
        breath_filtered = signal.sosfilt(sos_breath, breath)
        glottal_source += profile["breath_level"] * breath_filtered

        # 4. Formant Filter Bank (Vocal Tract Resonance)
        vowel_key = detect_vowel_from_syllable(note.lyric)
        vowel = VOWEL_FORMANTS[vowel_key]

        formant_output = np.zeros(num_samples, dtype=np.float32)
        formant_weights = [1.0, 0.65, 0.30]

        for i in range(3):
            fc = vowel["f"][i] * formant_scale
            bw = vowel["bw"][i] * formant_scale

            fc = min(fc, self.sample_rate * 0.46)
            bw = max(bw, 30.0)

            q = max(fc / bw, 1.0)
            b, a = signal.iirpeak(fc, q, fs=self.sample_rate)
            f_filtered = signal.lfilter(b, a, glottal_source)
            formant_output += formant_weights[i] * f_filtered

        # 5. Legato Amplitude Envelope
        # If connected to previous note, do not cut to 0; stay at sustain volume (~0.85)
        # If connected to next note, smoothly crossfade down to 0 at the overlap tail
        amp_envelope = np.ones(num_samples, dtype=np.float32)

        # Attack
        if is_legato_prev:
            # Soft legato connection: only a gentle 15% articulation dip over 25ms
            dip_sec = min(0.025, duration * 0.2)
            dip_samples = int(dip_sec * self.sample_rate)
            if dip_samples > 1:
                amp_envelope[:dip_samples] = 0.85 + 0.15 * (0.5 * (1 - np.cos(np.linspace(0, np.pi, dip_samples))))
        else:
            # From silence/rest: smooth soft attack over 35ms
            att_sec = min(0.035, duration * 0.25)
            att_samples = int(att_sec * self.sample_rate)
            if att_samples > 1:
                amp_envelope[:att_samples] = 0.5 * (1 - np.cos(np.linspace(0, np.pi, att_samples)))

        # Release
        if is_legato_next:
            # Crossfade tail during overlap (last 35ms)
            rel_samples = int(overlap_sec * self.sample_rate)
            if rel_samples > 1:
                amp_envelope[-rel_samples:] = 0.5 * (1 + np.cos(np.linspace(0, np.pi, rel_samples)))
        else:
            # To silence/rest: natural decrescendo release over 45ms
            rel_sec = min(0.045, duration * 0.3)
            rel_samples = int(rel_sec * self.sample_rate)
            if rel_samples > 1:
                amp_envelope[-rel_samples:] = 0.5 * (1 + np.cos(np.linspace(0, np.pi, rel_samples)))

        result = formant_output * amp_envelope
        return result, end_phase
