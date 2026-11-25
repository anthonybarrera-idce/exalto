# PyInstaller spec for the Hymn Studio converter: builds dist/hymn-cli/ (one folder, no Python needed).
#   cd services/hymn-studio && .venv/bin/pyinstaller packaging/hymn-cli.spec --noconfirm
# Never bundles .env files or the storage/ folder (secrets and user data stay out of the app).
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs, collect_submodules

datas = [("../hymn_processor/data", "hymn_processor/data")]
datas += collect_data_files("spellchecker")          # Spanish word frequency list
datas += collect_data_files("music21", excludes=["corpus/**", "**/*.pdf"])  # settings, not the 200 MB corpus
datas += collect_data_files("pypdfium2_raw")
binaries = collect_dynamic_libs("pypdfium2_raw") + collect_dynamic_libs("_soundfile_data")
datas += collect_data_files("_soundfile_data")

a = Analysis(
    ["hymn_cli_entry.py"],
    pathex=[".."],
    binaries=binaries,
    datas=datas,
    hiddenimports=collect_submodules("hymn_processor") + ["scipy.ndimage", "scipy.signal"],
    excludes=["tkinter", "matplotlib", "IPython", "pytest", "fastapi", "uvicorn"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="hymn-cli", console=True, upx=False)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="hymn-cli")
