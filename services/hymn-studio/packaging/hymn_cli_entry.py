"""Entry point for the bundled converter (PyInstaller): same as `python -m hymn_processor.cli`."""
import multiprocessing
import sys

from hymn_processor.cli import main

if __name__ == "__main__":
    multiprocessing.freeze_support()
    sys.exit(main())
