#!/usr/bin/env bash
# Quick start script for Exalto Hymn Studio
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
    .venv/bin/pip install -r requirements.txt
fi

echo "Starting Exalto Hymn Studio on http://localhost:8000 ..."
PYTHONPATH=. .venv/bin/uvicorn hymn_processor.server:app --host 0.0.0.0 --port 8000 --reload
