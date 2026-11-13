#!/usr/bin/env python3
"""Compare original shared missile-lock selection on supplied runner records."""
import hashlib,json,struct,subprocess
from unicorn import __version__
from native_ai_audit import Native,ROOT,EXE,RUNNER,SCRATCH,f32
base=[dict(id=0,x=0,y=0,z=0,yaw=0,dead=0,zoneMask=1,weapon='Nitro Ram'),dict(id=1,x=0,y=0,z=-100,dead=0,zoneMask=1),dict(id=2,x=80,y=0,z=-10,dead=0,zoneMask=1)]
fixtures=[]
for active in [False,True]:
 for changes in [{},{1:dict(dead=1),2:dict(dead=1)},{1:dict(z=100),2:dict(z=100)},{1:dict(z=-1000),2:dict(dead=1)},{1:dict(z=f32(-999.999)),2:dict(dead=1)},{1:dict(x=0,z=f32(-.001)),2:dict(dead=1)},{1:dict(x=0,z=f32(-.0009999999)),2:dict(dead=1)},{1:dict(zoneMask=2)},{1:dict(inactive=True)},{1:dict(respawn=dict(phase='delay'))},{1:dict(escaped=True)},{1:dict(opponentExit=dict(phase='fold'))},{2:dict(x=0,z=-100)},{0:dict(planarForwardVector=dict(x=1,z=0)),1:dict(x=100,z=0),2:dict(x=-10,z=-100)}]:
  rows=[{**r,**changes.get(r['id'],{})} for r in base];fixtures.append(dict(runners=rows,active=active,previous=1))
weapon_ids={'Nitro Ram':0,'Missile':1,'ShockWave':2,'Disruptor':3,'Laser':4,'Ion Sword':5,'NanoShield':6}
fixtures=[{**fixture,'runners':[{**r,**({'weapon':None if name=='Laser' else name} if r['id']==0 else {})} for r in fixture['runners']]} for fixture in fixtures for name in weapon_ids]
native=[]
for fixture in fixtures:
 n=Native();rows=fixture['runners'];table=SCRATCH+0x8000;addresses=[RUNNER+i*0x1000 for i in range(len(rows))];n.write(table,'3I',*addresses);n.cpu.mem_write(0x434ad4,b'\x8b\x04\x85'+struct.pack('<I',table)+b'\xc3');n.cpu.mem_write(0x43414c,b'\xb8'+struct.pack('<I',len(rows))+b'\xc3')
 for r,address in zip(rows,addresses):
  active=not(r.get('dead') or r.get('inactive') or r.get('respawn') or r.get('escaped') or r.get('opponentExit'));n.write(address,'I',r['id']);n.write(address+0x2c,'fff',r['x'],r['y'],r['z']);n.write(address+0xd8,'I',r['zoneMask']);n.write(address+0x15e,'B',int(active))
 forward=rows[0].get('planarForwardVector',dict(x=0,z=-1));n.write(RUNNER+0x80,'fff',forward['x'],0,forward['z']);n.write(RUNNER+0x6e0,'I',12);n.write(RUNNER+0x4bc,'B',int(fixture['active']));n.write(RUNNER+0x6ac,'I',1);n.write(RUNNER+0x6f8,'I',addresses[fixture['previous']]);n.write(RUNNER+0x498,'I',weapon_ids[rows[0]['weapon'] or 'Laser']);n.cpu.mem_write(0x4359e4,b'\xc3');n.cpu.mem_write(0x436634,b'\xc3');n.call(0x4371d0,eax=RUNNER);pointer=n.read(RUNNER+0x6f8,'I')[0];native.append(addresses.index(pointer) if pointer else None)
js="""
import {updateMissileLock} from './src/projectiles.js';let s='';for await(let x of process.stdin)s+=x;console.log(JSON.stringify(JSON.parse(s).map(({runners,active,previous})=>{let r=runners[0];r.missileLockTarget=previous;let sim={runners,projectiles:active?[{owner:0,kind:'Missile',life:1}]:[]};return updateMissileLock(sim,r)})));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT));mismatches=[dict(fixture=i,native=a,rebuild=b) for i,(a,b) in enumerate(zip(native,rebuilt)) if a!=b]
report=dict(scope='Actual original 4371d0 weapon dispatcher, 436230 shared-lock scan and 4377b4 zone-mask test on synthetic runner records. All seven selected weapon IDs use the decoded jump-table mapping. Model-count/ID lookup and projectile handlers are stubbed; no line-of-sight stub is needed because this scan does not query one.',sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,fixtures=fixtures,native=native,rebuild=rebuilt,mismatches=mismatches,passed=not mismatches,limitations=['Native zone occupancy generation is not executed. The runtime still defaults to all zones until full scene lifecycle is ported.','Nitro (0) and Missile (1) execute the scan; Laser (4) and other weapons skip it. Earlier reports mislabeled native ID 0 as Laser; this report supersedes that mapping.','Does not compare complete projectile slot ordering, expiry/hit cleanup, actor update order or rendered frames.'])
(ROOT/'private/verification/missile-locks-native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(fixtures=len(fixtures),mismatches=mismatches,passed=not mismatches),indent=2))
if mismatches:raise SystemExit(1)
