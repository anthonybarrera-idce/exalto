"""Data models for Hymn Studio score extraction, SATB separation, and stem synthesis."""

from enum import Enum
from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class VoiceRole(str, Enum):
    SOPRANO = "soprano"
    ALTO = "alto"
    TENOR = "tenor"
    BASS = "bass"


class NoteEvent(BaseModel):
    """Represents a discrete musical note or rest event in a vocal line."""
    pitch: str = Field(description="Scientific pitch notation e.g. 'G4', 'C#5', or 'REST'")
    midi: int = Field(description="MIDI note number (e.g. 60 for C4, 0 for rest)")
    frequency_hz: float = Field(description="Frequency in Hertz (e.g. 440.0 for A4, 0.0 for rest)")
    start_time: float = Field(description="Start time in seconds from beginning of score")
    duration: float = Field(description="Duration in seconds")
    beat_offset: float = Field(description="Start offset in quarter-note beats")
    beat_duration: float = Field(description="Duration in quarter-note beats")
    lyric: Optional[str] = Field(default=None, description="Lyric syllable attached to note")
    is_rest: bool = Field(default=False, description="True if this is a silence / rest")


class VoicePart(BaseModel):
    """A single vocal part (S, A, T, or B) containing its chronological notes."""
    role: VoiceRole
    display_name: str
    clef: str = "treble"  # 'treble' or 'bass'
    notes: List[NoteEvent] = Field(default_factory=list)
    min_midi: Optional[int] = None
    max_midi: Optional[int] = None
    total_notes: int = 0


class HymnScore(BaseModel):
    """The fully parsed, separated 4-part SATB hymn score."""
    id: str
    title: str = "Untitled Hymn"
    composer: Optional[str] = "Traditional"
    hymn_number: Optional[int] = None
    key_signature: str = "C major"
    time_signature: str = "4/4"
    tempo_bpm: float = 80.0
    total_duration_secs: float = 0.0
    parts: Dict[str, VoicePart] = Field(default_factory=dict)
    lyrics: List[str] = Field(default_factory=list)


class ProcessingStage(str, Enum):
    PENDING = "pending"
    OMR_EXTRACTING = "omr_extracting"
    SATB_SEPARATING = "satb_separating"
    SYNTHESIZING_VOICES = "synthesizing_voices"
    MIXING = "mixing"
    COMPLETED = "completed"
    FAILED = "failed"


class TaskStatus(BaseModel):
    """Status tracking for async processing jobs."""
    task_id: str
    hymn_id: str
    stage: ProcessingStage = ProcessingStage.PENDING
    progress_percent: int = 0
    message: str = "Task initialized"
    error: Optional[str] = None
    created_at: float
    updated_at: float
    stems: Optional[Dict[str, str]] = None  # URLs to audio stems
    score_meta: Optional[Dict] = None
