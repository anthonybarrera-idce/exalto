"""SATB Voice Separation engine for 4-part choral hymn sheet music and scores."""

import math
from typing import Dict, List, Optional, Tuple
import music21
from music21 import stream, note, chord, meter, tempo, key

from .models import HymnScore, NoteEvent, VoicePart, VoiceRole


# Standard vocal pitch ranges (MIDI numbers) for SATB parts
VOCAL_RANGES = {
    VoiceRole.SOPRANO: {"min": 55, "max": 84, "clef": "treble", "display": "Soprano"},  # G3 - C6
    VoiceRole.ALTO: {"min": 50, "max": 74, "clef": "treble", "display": "Alto"},        # D3 - D5
    VoiceRole.TENOR: {"min": 43, "max": 69, "clef": "bass", "display": "Tenor"},         # G2 - A4
    VoiceRole.BASS: {"min": 36, "max": 62, "clef": "bass", "display": "Bass"},           # C2 - D4
}


def midi_to_hz(midi: int) -> float:
    """Convert MIDI note number to frequency in Hertz (A4 = 440 Hz)."""
    if midi <= 0:
        return 0.0
    return 440.0 * (2.0 ** ((midi - 69) / 12.0))


def extract_lyric_from_element(element) -> Optional[str]:
    """Extract lyric syllable text from a music21 note/chord."""
    if hasattr(element, "lyrics") and element.lyrics:
        for lyr in element.lyrics:
            if lyr.text:
                return str(lyr.text).strip()
    if hasattr(element, "lyric") and element.lyric:
        return str(element.lyric).strip()
    return None


class SATBSeparator:
    """Separates a music21 parsed score into distinct, coherent Soprano, Alto, Tenor, and Bass parts."""

    def __init__(self, default_bpm: float = 80.0):
        self.default_bpm = default_bpm

    def separate_score(self, score: music21.stream.Score, hymn_id: str = "hymn_1") -> HymnScore:
        """Analyze a score and extract 4 distinct SATB VoiceParts with note timings and lyrics."""
        # 1. Determine title, composer, key, meter, bpm
        title = "Hymn Score"
        if score.metadata and score.metadata.title:
            title = score.metadata.title
        elif score.metadata and score.metadata.movementName:
            title = score.metadata.movementName

        composer = "Traditional"
        if score.metadata and score.metadata.composer:
            composer = score.metadata.composer

        # Detect tempo / BPM
        bpm = self.default_bpm
        tempos = score.flatten().getElementsByClass(tempo.MetronomeMark)
        if tempos:
            for mark in tempos:
                if mark.number:
                    bpm = float(mark.number)
                    break

        # Detect key signature
        key_sig = "C major"
        keys = score.flatten().getElementsByClass(key.KeySignature)
        if keys:
            key_sig = str(keys[0].asKey())

        # Detect time signature
        time_sig = "4/4"
        meters = score.flatten().getElementsByClass(meter.TimeSignature)
        if meters:
            time_sig = f"{meters[0].numerator}/{meters[0].denominator}"

        # 2. Inspect parts
        parts = list(score.parts)
        num_parts = len(parts)

        # Container for separated raw notes: role -> list of (offset, duration, pitch_name, midi, lyric)
        raw_parts: Dict[VoiceRole, List[Tuple[float, float, str, int, Optional[str]]]] = {
            VoiceRole.SOPRANO: [],
            VoiceRole.ALTO: [],
            VoiceRole.TENOR: [],
            VoiceRole.BASS: [],
        }

        if num_parts >= 4:
            # Case A: Already 4 distinct parts (e.g. SATB choir score)
            self._parse_four_parts(parts, raw_parts)
        elif num_parts == 2:
            # Case B: Standard 2-staff Hymnal Grand Staff (Treble: S+A, Bass: T+B)
            self._parse_grand_staff_parts(parts[0], parts[1], raw_parts)
        elif num_parts == 1:
            # Case C: Single condensed / chordal staff
            self._parse_condensed_part(parts[0], raw_parts)
        else:
            # Fallback to flattened chord/note analysis
            self._parse_condensed_part(score.flatten(), raw_parts)

        # 3. Synchronize lyrics across parts if only one part had lyrics
        self._propagate_lyrics(raw_parts)

        # 4. Build HymnScore and calculate time in seconds
        seconds_per_beat = 60.0 / bpm
        hymn_parts: Dict[str, VoicePart] = {}
        max_duration = 0.0
        all_lyrics: List[str] = []

        for role, raw_notes in raw_parts.items():
            role_meta = VOCAL_RANGES[role]
            voice_notes: List[NoteEvent] = []
            min_m = 999
            max_m = -1

            # Sort notes by beat offset
            raw_notes.sort(key=lambda x: x[0])

            # Fill gaps with rests if there are timing discontinuities
            last_end_beat = 0.0
            for beat_offset, beat_dur, pitch_name, midi_val, lyr in raw_notes:
                # If there's a noticeable gap between notes, insert a rest
                if beat_offset > last_end_beat + 0.05:
                    rest_dur = beat_offset - last_end_beat
                    voice_notes.append(
                        NoteEvent(
                            pitch="REST",
                            midi=0,
                            frequency_hz=0.0,
                            start_time=last_end_beat * seconds_per_beat,
                            duration=rest_dur * seconds_per_beat,
                            beat_offset=last_end_beat,
                            beat_duration=rest_dur,
                            is_rest=True,
                        )
                    )

                start_sec = beat_offset * seconds_per_beat
                dur_sec = beat_dur * seconds_per_beat
                end_sec = start_sec + dur_sec
                if end_sec > max_duration:
                    max_duration = end_sec

                if midi_val > 0:
                    min_m = min(min_m, midi_val)
                    max_m = max(max_m, midi_val)

                voice_notes.append(
                    NoteEvent(
                        pitch=pitch_name,
                        midi=midi_val,
                        frequency_hz=midi_to_hz(midi_val),
                        start_time=start_sec,
                        duration=dur_sec,
                        beat_offset=beat_offset,
                        beat_duration=beat_dur,
                        lyric=lyr,
                        is_rest=(midi_val == 0),
                    )
                )
                last_end_beat = beat_offset + beat_dur

                if lyr and role == VoiceRole.SOPRANO:
                    all_lyrics.append(lyr)

            hymn_parts[role.value] = VoicePart(
                role=role,
                display_name=role_meta["display"],
                clef=role_meta["clef"],
                notes=voice_notes,
                min_midi=min_m if min_m <= 127 else None,
                max_midi=max_m if max_m >= 0 else None,
                total_notes=len(voice_notes),
            )

        return HymnScore(
            id=hymn_id,
            title=title,
            composer=composer,
            key_signature=key_sig,
            time_signature=time_sig,
            tempo_bpm=bpm,
            total_duration_secs=round(max_duration, 2),
            parts=hymn_parts,
            lyrics=all_lyrics,
        )

    def _parse_four_parts(self, parts, raw_parts):
        """Map 4 distinct score parts to Soprano, Alto, Tenor, Bass based on pitch range or part names."""
        roles = [VoiceRole.SOPRANO, VoiceRole.ALTO, VoiceRole.TENOR, VoiceRole.BASS]
        for idx, p in enumerate(parts[:4]):
            role = roles[idx]
            for el in p.flatten().notesAndRests:
                self._add_element_to_voice(el, raw_parts[role])

    def _parse_grand_staff_parts(self, treble_part, bass_part, raw_parts):
        """Separate standard 2-staff hymn: Treble staff -> S (top) + A (bottom), Bass staff -> T (top) + B (bottom)."""
        # Upper staff (Treble: Soprano & Alto)
        self._separate_two_voices(
            treble_part,
            raw_parts[VoiceRole.SOPRANO],
            raw_parts[VoiceRole.ALTO],
            is_bass_clef=False,
        )
        # Lower staff (Bass: Tenor & Bass)
        self._separate_two_voices(
            bass_part,
            raw_parts[VoiceRole.TENOR],
            raw_parts[VoiceRole.BASS],
            is_bass_clef=True,
        )

    def _separate_two_voices(self, part_stream, upper_list, lower_list, is_bass_clef: bool):
        """Split a single staff with polyphonic chords/voices into upper and lower lines."""
        flat = part_stream.flatten()
        for el in flat.notesAndRests:
            offset = float(el.offset)
            dur = float(el.quarterLength)
            lyr = extract_lyric_from_element(el)

            if el.isRest:
                upper_list.append((offset, dur, "REST", 0, None))
                lower_list.append((offset, dur, "REST", 0, None))
            elif el.isNote:
                # Monophonic moment or single note
                m = el.pitch.midi
                p_name = el.pitch.nameWithOctave
                # In hymn staves, single notes are often unison or sung by both parts
                upper_list.append((offset, dur, p_name, m, lyr))
                lower_list.append((offset, dur, p_name, m, lyr))
            elif el.isChord:
                # Pitches ordered from lowest to highest
                sorted_pitches = sorted(el.pitches, key=lambda p: p.midi)
                if len(sorted_pitches) >= 2:
                    low_p = sorted_pitches[0]
                    high_p = sorted_pitches[-1]
                    upper_list.append((offset, dur, high_p.nameWithOctave, high_p.midi, lyr))
                    lower_list.append((offset, dur, low_p.nameWithOctave, low_p.midi, lyr))
                elif len(sorted_pitches) == 1:
                    p = sorted_pitches[0]
                    upper_list.append((offset, dur, p.nameWithOctave, p.midi, lyr))
                    lower_list.append((offset, dur, p.nameWithOctave, p.midi, lyr))

    def _parse_condensed_part(self, score_stream, raw_parts):
        """Handle fully condensed 4-part homophonic chords (common in hymn reductions)."""
        flat = score_stream.flatten()
        for el in flat.notesAndRests:
            offset = float(el.offset)
            dur = float(el.quarterLength)
            lyr = extract_lyric_from_element(el)

            if el.isRest:
                for role in VoiceRole:
                    raw_parts[role].append((offset, dur, "REST", 0, None))
            elif el.isChord:
                pitches = sorted(el.pitches, key=lambda p: p.midi)
                n = len(pitches)
                if n >= 4:
                    # Lowest to highest: Bass, Tenor, Alto, Soprano
                    raw_parts[VoiceRole.BASS].append((offset, dur, pitches[0].nameWithOctave, pitches[0].midi, lyr))
                    raw_parts[VoiceRole.TENOR].append((offset, dur, pitches[1].nameWithOctave, pitches[1].midi, lyr))
                    raw_parts[VoiceRole.ALTO].append((offset, dur, pitches[2].nameWithOctave, pitches[2].midi, lyr))
                    raw_parts[VoiceRole.SOPRANO].append((offset, dur, pitches[3].nameWithOctave, pitches[3].midi, lyr))
                elif n == 3:
                    # Bass, Tenor, Soprano (Alto doubles soprano or tenor)
                    raw_parts[VoiceRole.BASS].append((offset, dur, pitches[0].nameWithOctave, pitches[0].midi, lyr))
                    raw_parts[VoiceRole.TENOR].append((offset, dur, pitches[1].nameWithOctave, pitches[1].midi, lyr))
                    raw_parts[VoiceRole.ALTO].append((offset, dur, pitches[1].nameWithOctave, pitches[1].midi, lyr))
                    raw_parts[VoiceRole.SOPRANO].append((offset, dur, pitches[2].nameWithOctave, pitches[2].midi, lyr))
                elif n == 2:
                    raw_parts[VoiceRole.BASS].append((offset, dur, pitches[0].nameWithOctave, pitches[0].midi, lyr))
                    raw_parts[VoiceRole.TENOR].append((offset, dur, pitches[0].nameWithOctave, pitches[0].midi, lyr))
                    raw_parts[VoiceRole.ALTO].append((offset, dur, pitches[1].nameWithOctave, pitches[1].midi, lyr))
                    raw_parts[VoiceRole.SOPRANO].append((offset, dur, pitches[1].nameWithOctave, pitches[1].midi, lyr))
                elif n == 1:
                    p = pitches[0]
                    for role in VoiceRole:
                        raw_parts[role].append((offset, dur, p.nameWithOctave, p.midi, lyr))
            elif el.isNote:
                for role in VoiceRole:
                    raw_parts[role].append((offset, dur, el.pitch.nameWithOctave, el.pitch.midi, lyr))

    def _add_element_to_voice(self, el, voice_list):
        offset = float(el.offset)
        dur = float(el.quarterLength)
        lyr = extract_lyric_from_element(el)
        if el.isRest:
            voice_list.append((offset, dur, "REST", 0, None))
        elif el.isNote:
            voice_list.append((offset, dur, el.pitch.nameWithOctave, el.pitch.midi, lyr))
        elif el.isChord:
            # Pick highest pitch if part has chord
            highest = max(el.pitches, key=lambda p: p.midi)
            voice_list.append((offset, dur, highest.nameWithOctave, highest.midi, lyr))

    def _propagate_lyrics(self, raw_parts):
        """If Soprano has lyrics but other voices don't, align the syllables by beat offset."""
        soprano_lyrics = {item[0]: item[4] for item in raw_parts[VoiceRole.SOPRANO] if item[4]}
        if not soprano_lyrics:
            return

        for role in [VoiceRole.ALTO, VoiceRole.TENOR, VoiceRole.BASS]:
            has_lyrics = any(item[4] for item in raw_parts[role])
            if not has_lyrics:
                updated = []
                for offset, dur, p_name, midi_val, lyr in raw_parts[role]:
                    aligned_lyr = soprano_lyrics.get(offset, lyr)
                    updated.append((offset, dur, p_name, midi_val, aligned_lyr))
                raw_parts[role] = updated
