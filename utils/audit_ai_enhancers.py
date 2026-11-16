#!/usr/bin/env python3
"""Compare original AI weapon rolling and all-four-cell duplicate scans."""
import hashlib,json,random,struct,subprocess
from unicorn import __version__
from native_ai_audit import Native,ROOT,EXE,RUNNER,SCRATCH
states=[([4,0,0,0],1),([4,1,0,0],2),([4,6,0,0],2),([4,6,2,3],2),([4,5,6,1],4),([4,1,3,5],4),([4,2,2,2],2),([4,6,6,6],1),([4,3,5,6],4)]
draws=[[i] for i in [0,1,3,4,5,6]]+[[2,i] for i in range(7)]
fixtures=[dict(cells=cells,count=count,draws=stream) for cells,count in states for stream in draws];random.seed(1996)
fixtures.extend(dict(cells=[4]+[random.randrange(7) for _ in range(3)],count=random.randrange(1,5),draws=[random.randrange(32768),random.randrange(32768)]) for _ in range(100));native=[]
for fixture in fixtures:
 n=Native();counter=SCRATCH+0x800;table=counter+0x10;n.write(RUNNER+0x498,'4I',*fixture['cells']);n.write(RUNNER+0x4ac,'I',fixture['count']);n.write(table,'3I',*(fixture['draws']+[0,0])[:3]);n.write(counter,'I',0)
 # Supplied RNG stream: use only EAX and preserve the original caller registers.
 n.cpu.mem_write(0x45a8e6,b'\xa1'+struct.pack('<I',counter)+b'\xff\x05'+struct.pack('<I',counter)+b'\x8b\x04\x85'+struct.pack('<I',table)+b'\xc3')
 raw=n.call(0x42db00);raw_draws=n.read(counter,'I')[0];n.write(counter,'I',0);chosen=n.call(0x42db7c,eax=RUNNER);native.append(dict(raw=raw,rawDraws=raw_draws,chosen=chosen,draws=n.read(counter,'I')[0]))
js="""
import {rollAIEnhancer,chooseAIEnhancer} from './src/ai-actions.ts';import {WEAPON_NAMES,weaponCode} from './src/inventory.ts';let s='';for await(let x of process.stdin)s+=x;
console.log(JSON.stringify(JSON.parse(s).map(({cells,count,draws})=>{let index=0,sim={randomInt:()=>draws[index++]},raw=rollAIEnhancer(sim),rawDraws=index;index=0;let r={weapons:cells.slice(0,count).map(i=>WEAPON_NAMES[i]),weaponCells:[...cells]},chosen=weaponCode(chooseAIEnhancer(sim,r));return {raw,rawDraws,chosen,draws:index}})));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT));mismatches=[dict(fixture=i,native=a,rebuild=b) for i,(a,b) in enumerate(zip(native,rebuilt)) if a!=b]
report=dict(scope='Actual original 42db00 random weapon roll and 42db7c duplicate walk. All four inventory cells are supplied independently of active count; RNG results are a supplied stream and call counts are compared.',sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,fixtures=fixtures,native=native,rebuild=rebuilt,mismatches=mismatches,passed=not mismatches,limitations=['RNG draw values are supplied; original generator arithmetic has a separate audit, but full game seeding/call order remains unmatched.','Does not execute the complete periodic AI controller or inventory pickup delivery, which have separate component coverage.','No scene traversal, full native gameplay or rendered-frame comparison.'])
(ROOT/'private/verification/ai-enhancers-native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(fixtures=len(fixtures),mismatches=mismatches,passed=not mismatches),indent=2))
if mismatches:raise SystemExit(1)
