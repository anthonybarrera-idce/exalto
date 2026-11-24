"""Choral Multi-track Stem Mixer and Sacred Acoustics Mastering Engine."""

import math
from pathlib import Path
from typing import Dict, Tuple
import numpy as np
from scipy import signal
import soundfile as sf

from .models import VoiceRole


# Stereo panning coordinates (-1.0 = full left, 0.0 = center, +1.0 = full right)
# Standard SATB choral arrangement across the stereo field
CHORAL_PANNING = {
    VoiceRole.SOPRANO: -0.30,   # Stage Left
    VoiceRole.ALTO: 0.30,      # Stage Right
    VoiceRole.TENOR: -0.15,    # Inner Left
    VoiceRole.BASS: 0.15,      # Inner Right
}


def apply_panning(mono: np.ndarray, pan: float) -> Tuple[np.ndarray, np.ndarray]:
    """Apply equal-power stereo panning law."""
    # pan is in [-1.0, 1.0]. Convert to angle in [0, pi/2]
    theta = (pan + 1.0) * (math.pi / 4.0)
    left_gain = math.cos(theta)
    right_gain = math.sin(theta)
    return mono * left_gain, mono * right_gain


def generate_church_reverb_ir(sample_rate: int, rt60: float = 1.8) -> np.ndarray:
    """Generate a clean synthetic church / cathedral acoustic impulse response."""
    ir_len = int(rt60 * sample_rate)
    t = np.linspace(0, rt60, ir_len, endpoint=False)

    # Exponential decay envelope for specified RT60 (-60 dB decay)
    decay = np.exp(-6.91 * t / rt60)

    # Diffuse white noise tail
    noise = np.random.normal(0, 1, ir_len).astype(np.float32)

    # Low-pass filter to simulate high-frequency air absorption in stone cathedral
    sos = signal.butter(2, 3500, btype="lowpass", fs=sample_rate, output="sos")
    filtered_noise = signal.sosfilt(sos, noise)

    ir = decay * filtered_noise

    # Early reflection spikes
    early_delays = [0.015, 0.028, 0.045, 0.062, 0.085]
    early_gains = [0.7, 0.5, 0.35, 0.25, 0.15]
    for d, g in zip(early_delays, early_gains):
        idx = int(d * sample_rate)
        if idx < ir_len:
            ir[idx] += g

    # Normalize impulse response energy
    energy = np.sqrt(np.sum(ir ** 2))
    if energy > 0:
        ir /= energy

    return ir.astype(np.float32)


class AudioMixer:
    """Mixes isolated stems into individual tracks and masters the full 4-voice SATB acapella quartet."""

    def __init__(self, sample_rate: int = 44100):
        self.sample_rate = sample_rate
        self._reverb_ir = generate_church_reverb_ir(sample_rate, rt60=1.6)

    def export_stems_and_mix(
        self,
        stems: Dict[VoiceRole, np.ndarray],
        output_dir: str,
        base_name: str = "hymn",
    ) -> Dict[str, str]:
        """Export 4 isolated solo stems and 1 master SATB acapella mix.

        Returns:
            Dictionary mapping stem name ('soprano', 'alto', 'tenor', 'bass', 'mix')
            to absolute file path.
        """
        out_path = Path(output_dir)
        out_path.mkdir(parents=True, exist_ok=True)

        results = {}

        # 1. Export 4 individual solo stems (stereo centered or gentle room ambiance)
        for role, audio in stems.items():
            file_name = f"{role.value}.wav"
            stem_file = out_path / file_name

            # Add gentle subtle room reverberation to solo stems for natural listening
            wet_solo = signal.fftconvolve(audio, self._reverb_ir, mode="full")[: len(audio)]
            solo_processed = 0.85 * audio + 0.15 * wet_solo

            # Peak normalize
            max_p = np.max(np.abs(solo_processed))
            if max_p > 0:
                solo_processed = (solo_processed / max_p) * 0.92

            sf.write(str(stem_file), solo_processed, self.sample_rate)
            results[role.value] = str(stem_file)

        # 2. Master SATB 4-part acapella mix
        # Determine max length among stems
        max_len = max(len(audio) for audio in stems.values())
        mix_left = np.zeros(max_len, dtype=np.float32)
        mix_right = np.zeros(max_len, dtype=np.float32)

        for role, audio in stems.items():
            pan = CHORAL_PANNING.get(role, 0.0)
            pad_len = max_len - len(audio)
            padded = np.pad(audio, (0, pad_len)) if pad_len > 0 else audio

            l_part, r_part = apply_panning(padded, pan)
            mix_left += l_part
            mix_right += r_part

        # 3. Apply Sacred Choir Convolution Reverb (cathedral acoustic bloom)
        reverb_wet_l = signal.fftconvolve(mix_left, self._reverb_ir, mode="full")[:max_len]
        reverb_wet_r = signal.fftconvolve(mix_right, self._reverb_ir, mode="full")[:max_len]

        wet_level = 0.22
        dry_level = 0.78

        final_l = (dry_level * mix_left) + (wet_level * reverb_wet_l)
        final_r = (dry_level * mix_right) + (wet_level * reverb_wet_r)

        # 4. Master Limiter & Peak Normalization
        stereo = np.column_stack([final_l, final_r])
        peak = np.max(np.abs(stereo))
        if peak > 0:
            # Normalize to -0.8 dBFS peak
            stereo = (stereo / peak) * 0.92

        mix_file = out_path / "satb_mix.wav"
        sf.write(str(mix_file), stereo, self.sample_rate)
        results["mix"] = str(mix_file)

        return results
