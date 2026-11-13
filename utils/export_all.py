"""Rebuild browser assets from the preserved installation, in dependency order."""
from pathlib import Path
import subprocess,sys
TOOLS=Path(__file__).resolve().parent
for name in ['extract_assets.py','export_models.py','export_support.py',
             'export_metadata.py','export_training.py','export_credits.py','export_recharge_paths.py','export_recordings.py','export_scene_effects.py',
             'export_audio.py','extract_regions.py']:
    subprocess.run([sys.executable,str(TOOLS/name)],check=True)
