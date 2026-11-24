"""Command Line Interface (CLI) for Hymn Studio."""

import argparse
import json
from pathlib import Path
import sys

from .models import VoiceRole
from .omr_extractor import OMRExtractor
from .vocal_synthesizer import ChoralVocalSynthesizer
from .audio_mixer import AudioMixer


def run_pipeline(input_file: str, output_dir: str, gemini_api_key: str = None):
    """Run full end-to-end pipeline on a hymn sheet music file."""
    p_in = Path(input_file)
    if not p_in.exists():
        print(f"Error: Input file '{input_file}' not found.", file=sys.stderr)
        sys.exit(1)

    p_out = Path(output_dir)
    p_out.mkdir(parents=True, exist_ok=True)

    print(f"\n=======================================================")
    print(f" 🎵  HYMN STUDIO: SHEET MUSIC TO SATB ACAPELLA ENGINE  🎵")
    print(f"=======================================================\n")
    print(f"Input File:  {p_in.resolve()}")
    print(f"Output Dir:  {p_out.resolve()}\n")

    # 1. OMR & Score Extraction
    print("▶ Stage 1/4: Extracting notes, rhythm, and lyrics...")
    extractor = OMRExtractor(gemini_api_key=gemini_api_key)
    score = extractor.process_file(str(p_in), hymn_id=p_in.stem)

    print(f"  ✓ Title:          {score.title}")
    print(f"  ✓ Composer:       {score.composer}")
    print(f"  ✓ Key / Meter:    {score.key_signature} | {score.time_signature} | {score.tempo_bpm} BPM")
    print(f"  ✓ Total Duration: {score.total_duration_secs:.1f} seconds")

    # 2. SATB Voice Separation Summary
    print("\n▶ Stage 2/4: SATB Vocal Part Separation:")
    for role_name in ["soprano", "alto", "tenor", "bass"]:
        part = score.parts.get(role_name)
        if part:
            pitched = [n for n in part.notes if not n.is_rest]
            print(f"  ✓ {part.display_name:8s}: {len(pitched)} notes (range: {part.min_midi or 'N/A'} - {part.max_midi or 'N/A'} MIDI)")

    # 3. Acapella Singing Voice Synthesis
    print("\n▶ Stage 3/4: Synthesizing AI Acapella Singing Voices...")
    synth = ChoralVocalSynthesizer()
    stems = {}

    for role in VoiceRole:
        part = score.parts.get(role.value)
        if part:
            print(f"  • Synthesizing {part.display_name} voice stem (vowel formants + micro-vibrato)...")
            audio = synth.synthesize_part(part, score.total_duration_secs)
            stems[role] = audio

    # 4. Mixing & Mastering
    print("\n▶ Stage 4/4: Mastering 4 Solo Stems & SATB Quartet Mix...")
    mixer = AudioMixer()
    output_files = mixer.export_stems_and_mix(stems, output_dir=str(p_out), base_name=score.id)

    # Save score metadata JSON
    meta_file = p_out / "score_metadata.json"
    with open(meta_file, "w") as f:
        json.dump(score.model_dump(), f, indent=2)

    print("\n=======================================================")
    print(" ✅  PROCESSING COMPLETE! GENERATED AUDIO STEMS:       ")
    print("=======================================================")
    for stem_name, file_path in output_files.items():
        print(f"  • {stem_name.upper():7s} -> {file_path}")
    print(f"  • METADATA-> {meta_file}\n")


def main():
    parser = argparse.ArgumentParser(
        description="Extract SATB vocal parts from hymn sheet music and synthesize acapella voices."
    )
    subparsers = parser.add_subparsers(dest="command")

    process_parser = subparsers.add_parser("process", help="Process a sheet music file")
    process_parser.add_argument("--input", "-i", required=True, help="Path to sheet music (.musicxml, .pdf, .png, etc.)")
    process_parser.add_argument("--out", "-o", default="./output", help="Directory to save audio stems")
    process_parser.add_argument("--api-key", help="Optional Gemini API key for photo/scan OMR")

    deck_parser = subparsers.add_parser(
        "deck",
        help="Batch-convert hymn slide decks (Google Slides links / .pptx) to piano MusicXML + admin lyrics",
    )
    deck_parser.add_argument("inputs", nargs="+", help="Google Slides links, .pptx files, or .txt files listing them")
    deck_parser.add_argument("--out", "-o", default="./storage/decks", help="Output directory")
    deck_parser.add_argument("--hymnal", default="community", help="Exalto hymnalId for the admin import")
    deck_parser.add_argument("--language", default="es", choices=["es", "en"])
    deck_parser.add_argument("--engine", choices=["local", "claude", "gemini"], default="local",
                             help="How the sheet music is read: local (free, offline shape-note reader), claude or gemini")
    deck_parser.add_argument("--api-key", help="Gemini API key for --engine gemini (defaults to GEMINI_API_KEY / .env)")
    deck_parser.add_argument("--no-cache", action="store_true", help="Re-transcribe pages even if cached")
    deck_parser.add_argument("--tempo", type=float, default=80, help="Beats per minute when the music doesn't say (default 80)")
    deck_parser.add_argument("--no-audio", action="store_true", help="Skip rendering piano audio")
    deck_parser.add_argument("--no-correct", action="store_true", help="Keep OCR'd lyrics exactly as read")

    rebuild_parser = subparsers.add_parser("rebuild", help="Rewrite a hymn's MusicXML/MIDI after editing transcription.json")
    rebuild_parser.add_argument("--dir", required=True, help="The hymn's output folder")
    edit_parser = subparsers.add_parser("edit", help="Apply note/key/time/tempo edits saved in transcription.json: rebuild score, checks and audio")
    edit_parser.add_argument("--dir", required=True, help="The hymn's output folder")
    edit_parser.add_argument("--respell-from", type=int, default=None, help="Old key (fifths): re-read notes under the new key signature")
    edit_parser.add_argument("--no-audio", action="store_true")
    boxes_parser = subparsers.add_parser("boxes", help="Add note/measure positions to an older conversion (notes unchanged)")
    boxes_parser.add_argument("--dir", required=True, help="The hymn's output folder")
    audio_parser = subparsers.add_parser("audio", help="Re-render a hymn's piano and plain-tone tracks")
    audio_parser.add_argument("--dir", required=True, help="The hymn's output folder")
    practice_parser = subparsers.add_parser("practice", help="Write practice.json (notes for the mobile app's practice screen)")
    practice_parser.add_argument("--dir", nargs="+", required=True, help="Hymn output folder(s)")
    tones_parser = subparsers.add_parser("tones", help="Render plain-tone ('just notes') practice tracks for a hymn")
    tones_parser.add_argument("--dir", required=True, help="The hymn's output folder")

    args = parser.parse_args()

    if args.command == "process":
        run_pipeline(args.input, args.out, gemini_api_key=args.api_key)
    elif args.command == "audio":
        import json as _json
        from pathlib import Path as _P

        from .piano_render import render, render_tones

        d = _P(args.dir)
        bpm = (_json.loads((d / "review.json").read_text()).get("bpm") or 80)
        xml = d / f"{d.name}.musicxml"
        render(xml, d / f"{d.name}.mid", d / f"{d.name}-piano.wav", bpm=bpm)
        render_tones(xml, d, d.name, bpm=bpm)
        print("re-rendered piano and plain-tone tracks")
    elif args.command == "tones":
        import json as _json
        from pathlib import Path as _P

        from .piano_render import render_tones

        d = _P(args.dir)
        bpm = (_json.loads((d / "review.json").read_text()).get("bpm") or 80)
        for k, v in render_tones(d / f"{d.name}.musicxml", d, d.name, bpm=bpm).items():
            print(f"{k}: {v}")
    elif args.command == "practice":
        from .practice import write_practice

        for d in args.dir:
            out = write_practice(d)
            print(f"{d}: {out if out else 'no music (skipped)'}")
    elif args.command == "edit":
        from .deck_batch import apply_edits

        r = apply_edits(args.dir, respell_from=args.respell_from, audio=not args.no_audio)
        print(f"{r['measures']} measures, {len(r['warnings'])} warning(s)")
    elif args.command == "boxes":
        from .deck_batch import add_boxes

        print(f"{add_boxes(args.dir)} measure(s) placed")
    elif args.command == "rebuild":
        from .deck_batch import rebuild_score

        for k, v in rebuild_score(args.dir).items():
            print(f"{k}: {v}")
    elif args.command == "deck":
        from .deck_batch import run_batch

        run_batch(args.inputs, args.out, hymnal_id=args.hymnal, language=args.language,
                  api_key=args.api_key, use_cache=not args.no_cache, engine=args.engine,
                  tempo=args.tempo, render_audio=not args.no_audio,
                  correct_lyrics=not args.no_correct)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
