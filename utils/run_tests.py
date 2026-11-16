"""Run portable checks in a public checkout; add reference checks when supplied."""
from pathlib import Path
import argparse,subprocess,sys,os
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();mode=parser.add_mutually_exclusive_group();mode.add_argument('--reference',action='store_true');mode.add_argument('--portable',action='store_true');args=parser.parse_args()
reference=all((ROOT/p).is_file() for p in ['private/original/game/RUN/ddrome.exe','private/assets/region-data.json','private/verification/world-regions-native.json'])
if args.reference and not reference:raise SystemExit('Reference tests require the local private/ installation and audit fixtures. No original media is bundled.')
subprocess.run([sys.executable,'utils/test_browser_media.py'],cwd=ROOT,check=True)
subprocess.run([sys.executable,'utils/test_publication.py'],cwd=ROOT,check=True)
files=sorted((ROOT/'utils/tests').glob('*.test.ts'))
env=dict(os.environ)
if args.portable or not reference:
    env['DD_PORTABLE_TESTS']='1'
    files=[p for p in files if not any(term in p.read_text() for term in ['private/','readFile','readFileSync'])]
    print(f'Portable suite: {len(files)} test files; original-media reference tests are not run.',flush=True)
else:print(f'Full local suite: {len(files)} test files, including private reference fixtures.',flush=True)
subprocess.run(['node','--import','./utils/tests/setup.ts','--test','--test-isolation=none',*[str(p.relative_to(ROOT)) for p in files]],cwd=ROOT,env=env,check=True)
