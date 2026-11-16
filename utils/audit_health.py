#!/usr/bin/env python3
"""Compare original profile-health arithmetic and protection predicates."""
import hashlib,json,subprocess
from unicorn import __version__
from native_ai_audit import Native,ROOT,EXE,f32
fixtures=[dict(health=f32(health),delta=f32(delta),profileType=kind,shielded=shield,invulnerableHuman=god) for kind in [0,1,2] for shield in [False,True] for god in [False,True] for health in [0,.00001,5,99.9,100] for delta in [-10000,-140,-4,-.3,0,.25,1,1000]]
n=Native();native=[]
for f in fixtures:
 n.write(0x48d8d0,'f',f['health']);n.write(0x48d8d8,'I',f['profileType']);n.write(0x48d8e5,'B',int(f['shielded']));n.write(0x48d8b8,'B',int(f['invulnerableHuman']));n.call(0x418e44,[f['delta']],eax=0);native.append(n.read(0x48d8d0,'f')[0])
js="""
import {healthAfterDelta} from './src/health.ts';let s='';for await(let x of process.stdin)s+=x;console.log(JSON.stringify(JSON.parse(s).map(f=>healthAfterDelta(f.health,f.delta,f))));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT));mismatches=[dict(fixture=i,native=a,rebuild=b) for i,(a,b) in enumerate(zip(native,rebuilt)) if a!=b]
report=dict(scope='Actual original 418e44 profile-health adjustment, with real float human damage multiplication, invulnerable-human flag, profile shield byte, ignored type-2 profiles and health clamps.',sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,fixtures=fixtures,native=native,rebuild=rebuilt,mismatches=mismatches,passed=not mismatches,limitations=['Supplied profile flags and finite stored health/delta values. No native game state generation, damage-caller armor/power arithmetic, scene actors, death entry, rendering or complete gameplay.','The runtime currently uses only human/AI profile types and shield state. Type-2 and invulnerable-human cases verify the isolated helper; their complete game modes are not implemented.'])
(ROOT/'private/verification/health-native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(fixtures=len(fixtures),mismatches=len(mismatches),passed=not mismatches),indent=2))
if mismatches:raise SystemExit(1)
