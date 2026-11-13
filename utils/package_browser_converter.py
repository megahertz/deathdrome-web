"""Package converter CODE ONLY. No original resource bytes enter this archive."""
from pathlib import Path
import json,zipfile,hashlib
ROOT=Path(__file__).resolve().parents[1];out=ROOT/'public/resource-code'
out.mkdir(exist_ok=True)
scripts=['extract_assets.py','export_models.py','export_support.py','export_training.py','export_credits.py','export_recharge_paths.py','export_scene_effects.py','extract_regions.py']
catalog=json.loads((ROOT/'utils/browser_converter/case-catalog.json').read_text())
with zipfile.ZipFile(out/'converter.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name in scripts:z.write(ROOT/'utils'/name,'utils/'+name)
    for p in (ROOT/'utils/browser_converter').glob('*.py'):z.write(p,'utils/'+p.name)
    z.writestr('utils/case-catalog.json',json.dumps(catalog))
blast=(ROOT/'utils/unshieldv3-master/blast.h').read_text().split('/*\n * blast()')[0]
(out/'BLAST-LICENSE.txt').write_text(blast)
(out/'UNSHIELD-LICENSE.txt').write_bytes((ROOT/'utils/unshieldv3-master/LICENSE').read_bytes())
print('Code archive:',(out/'converter.zip').stat().st_size,'bytes; no game files')
