"""FastAPI Server for Hymn Studio: Sheet Music to SATB Acapella AI Vocal Service."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import time
from typing import Dict, Optional
import uuid

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .models import HymnScore, ProcessingStage, TaskStatus, VoiceRole
from .omr_extractor import OMRExtractor
from .satb_separator import SATBSeparator
from .vocal_synthesizer import ChoralVocalSynthesizer
from .audio_mixer import AudioMixer


app = FastAPI(
    title="Hymn Studio",
    description="Extract SATB vocal parts from sheet music and produce acapella singing voices and 4-part mix.",
    version="1.0.0",
)

# Enable CORS for local development and mobile clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / "storage"
STATIC_DIR = BASE_DIR / "static"
SAMPLES_DIR = BASE_DIR / "samples"

STORAGE_DIR.mkdir(parents=True, exist_ok=True)
STATIC_DIR.mkdir(parents=True, exist_ok=True)

# Automatically load .env if present
env_file = BASE_DIR / ".env"
if env_file.exists():
    with open(env_file, "r") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

# In-memory task registry
TASKS: Dict[str, TaskStatus] = {}
thread_pool = ThreadPoolExecutor(max_workers=4)


def process_hymn_task(task_id: str, file_path: str, gemini_api_key: Optional[str] = None):
    """Background worker executing the full 4-stage pipeline."""
    task = TASKS[task_id]
    hymn_dir = STORAGE_DIR / task.hymn_id
    hymn_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Stage 1: OMR & Extraction
        task.stage = ProcessingStage.OMR_EXTRACTING
        task.progress_percent = 20
        task.message = "Extracting notes, rhythm, meter, and lyrics from sheet music..."
        task.updated_at = time.time()

        extractor = OMRExtractor(gemini_api_key=gemini_api_key)
        score = extractor.process_file(file_path, hymn_id=task.hymn_id)

        # Stage 2: SATB Voice Separation
        task.stage = ProcessingStage.SATB_SEPARATING
        task.progress_percent = 45
        task.message = f"Separated 4 vocal parts: Soprano ({score.parts['soprano'].total_notes} notes), Alto ({score.parts['alto'].total_notes}), Tenor ({score.parts['tenor'].total_notes}), Bass ({score.parts['bass'].total_notes})..."
        task.updated_at = time.time()

        # Stage 3: Acapella Singing Synthesis
        task.stage = ProcessingStage.SYNTHESIZING_VOICES
        task.progress_percent = 65
        task.message = "Synthesizing Soprano, Alto, Tenor, and Bass AI acapella singing voices..."
        task.updated_at = time.time()

        synth = ChoralVocalSynthesizer()
        stems = {}
        for role in VoiceRole:
            part = score.parts.get(role.value)
            if part:
                stems[role] = synth.synthesize_part(part, score.total_duration_secs)

        # Stage 4: Stem & Master Mixing
        task.stage = ProcessingStage.MIXING
        task.progress_percent = 85
        task.message = "Mastering isolated voice stems and SATB quartet sacred acoustic mix..."
        task.updated_at = time.time()

        mixer = AudioMixer()
        stem_paths = mixer.export_stems_and_mix(stems, output_dir=str(hymn_dir), base_name=score.id)

        # Save score metadata
        meta_file = hymn_dir / "score_metadata.json"
        with open(meta_file, "w") as f:
            json.dump(score.model_dump(), f, indent=2)

        # Build accessible stem URLs
        stem_urls = {
            role_name: f"/api/hymns/{task.hymn_id}/audio/{role_name}"
            for role_name in ["soprano", "alto", "tenor", "bass", "mix"]
        }

        task.stage = ProcessingStage.COMPLETED
        task.progress_percent = 100
        task.message = "Hymn processing complete! All stems and mix ready."
        task.stems = stem_urls
        task.score_meta = {
            "title": score.title,
            "composer": score.composer,
            "key": score.key_signature,
            "time_sig": score.time_signature,
            "bpm": score.tempo_bpm,
            "duration": score.total_duration_secs,
            "lyrics": score.lyrics,
        }
        task.updated_at = time.time()

    except Exception as e:
        task.stage = ProcessingStage.FAILED
        task.error = str(e)
        task.message = f"Processing failed: {e}"
        task.updated_at = time.time()


@app.post("/api/upload")
async def upload_sheet_music(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    gemini_api_key: Optional[str] = Form(None),
):
    """Upload a sheet music file (PDF, image, or MusicXML) and start extraction & stem generation."""
    hymn_id = f"hymn_{uuid.uuid4().hex[:8]}"
    hymn_dir = STORAGE_DIR / hymn_id
    hymn_dir.mkdir(parents=True, exist_ok=True)

    dest_file = hymn_dir / file.filename
    with open(dest_file, "wb") as buffer:
        content = await file.read()
        buffer.write(content)

    task_id = str(uuid.uuid4())
    now = time.time()
    task = TaskStatus(
        task_id=task_id,
        hymn_id=hymn_id,
        stage=ProcessingStage.PENDING,
        progress_percent=5,
        message="Uploaded file received. Enqueuing task...",
        created_at=now,
        updated_at=now,
    )
    TASKS[task_id] = task

    background_tasks.add_task(process_hymn_task, task_id, str(dest_file), gemini_api_key)

    return {
        "task_id": task_id,
        "hymn_id": hymn_id,
        "filename": file.filename,
        "status_url": f"/api/tasks/{task_id}",
    }


@app.post("/api/load-sample")
async def load_sample(background_tasks: BackgroundTasks):
    """Load and process the included Doxology sample MusicXML score immediately."""
    sample_file = SAMPLES_DIR / "doxology.musicxml"
    if not sample_file.exists():
        raise HTTPException(status_code=404, detail="Sample file not found")

    hymn_id = f"sample_doxology_{uuid.uuid4().hex[:6]}"
    task_id = str(uuid.uuid4())
    now = time.time()

    task = TaskStatus(
        task_id=task_id,
        hymn_id=hymn_id,
        stage=ProcessingStage.PENDING,
        progress_percent=5,
        message="Loading Doxology SATB score...",
        created_at=now,
        updated_at=now,
    )
    TASKS[task_id] = task

    background_tasks.add_task(process_hymn_task, task_id, str(sample_file), None)

    return {
        "task_id": task_id,
        "hymn_id": hymn_id,
        "filename": "doxology.musicxml",
        "status_url": f"/api/tasks/{task_id}",
    }


@app.post("/api/load-sample-me-proveera")
async def load_sample_me_proveera(background_tasks: BackgroundTasks):
    """Load and process the uploaded 'Me Proveerá tu Amor' 4-part SATB hymn immediately."""
    sample_file = SAMPLES_DIR / "me_proveera_tu_amor.musicxml"
    if not sample_file.exists():
        raise HTTPException(status_code=404, detail="Score file not found")

    hymn_id = f"me_proveera_{uuid.uuid4().hex[:6]}"
    task_id = str(uuid.uuid4())
    now = time.time()

    task = TaskStatus(
        task_id=task_id,
        hymn_id=hymn_id,
        stage=ProcessingStage.PENDING,
        progress_percent=5,
        message="Loading 'Me Proveerá tu Amor' SATB score...",
        created_at=now,
        updated_at=now,
    )
    TASKS[task_id] = task

    background_tasks.add_task(process_hymn_task, task_id, str(sample_file), None)

    return {
        "task_id": task_id,
        "hymn_id": hymn_id,
        "filename": "Me-Proveerá-tu-Amor-Presentación-4-3.pdf",
        "status_url": f"/api/tasks/{task_id}",
    }


@app.get("/api/tasks/{task_id}")
async def get_task_status(task_id: str):
    """Check processing status of a hymn job."""
    task = TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@app.get("/api/hymns/{hymn_id}/metadata")
async def get_hymn_metadata(hymn_id: str):
    """Retrieve extracted score metadata and notes."""
    meta_path = STORAGE_DIR / hymn_id / "score_metadata.json"
    if not meta_path.exists():
        raise HTTPException(status_code=404, detail="Metadata not found")
    with open(meta_path, "r") as f:
        return json.load(f)


@app.get("/api/hymns/{hymn_id}/audio/{stem_name}")
async def get_stem_audio(hymn_id: str, stem_name: str):
    """Stream or download an individual audio stem (soprano, alto, tenor, bass, mix)."""
    valid_stems = {
        "soprano": "soprano.wav",
        "alto": "alto.wav",
        "tenor": "tenor.wav",
        "bass": "bass.wav",
        "mix": "satb_mix.wav",
    }
    if stem_name not in valid_stems:
        raise HTTPException(status_code=400, detail=f"Invalid stem: {stem_name}. Choose from {list(valid_stems.keys())}")

    audio_file = STORAGE_DIR / hymn_id / valid_stems[stem_name]
    if not audio_file.exists():
        raise HTTPException(status_code=404, detail="Audio file not ready or not found")

    return FileResponse(
        path=str(audio_file),
        media_type="audio/wav",
        filename=f"{hymn_id}_{valid_stems[stem_name]}",
    )


# Serve Static Assets & Web Studio UI
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
async def root():
    """Serve the Web Studio interface."""
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {"message": "Hymn Studio API is running. Web UI not found."}
