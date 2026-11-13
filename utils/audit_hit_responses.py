#!/usr/bin/env python3
"""Compare primary, wave and runner hit responses before actor health checks."""
import hashlib,json,struct,subprocess
from unicorn import __version__,UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EDX
from native_ai_audit import Native,ROOT,EXE,RUNNER
tables=json.loads((ROOT/'private/assets/game-tables.json').read_text())
fixtures=[dict(kind=kind,health=health,shielded=shield) for kind in ['Laser','Missile','ShockWave','Nitro Ram','Runner contact'] for health in [0,1,100] for shield in [False,True]]
native=[]
for f in fixtures:
 n=Native();owner=RUNNER;target=RUNNER+0x1000;nodes=[RUNNER+0x8000,RUNNER+0x8100];points=[]
 n.write(0x48f104,'2I',*nodes);n.write(0x48f158,'I',2);n.write(0x48d8b8,'B',0);n.write(0x48d89c,'I',0);n.write(0x48d8a8,'I',0)
 for i in range(8):n.write(0x48d8d8+i*80,'I',2);n.write(0x48d8e0+i*80,'I',0xffffffff);n.write(0x48d8c4+i*80,'II',0,0)
 for i,(address,node) in enumerate(zip([owner,target],nodes)):
  n.write(node+0x4c,'I',address);n.write(address,'II',i,i);n.write(address+0x15e,'B',1);n.write(address+0x2c,'fff',100+i*10,0,100);n.write(address+0x6e8,'ff',tables['runners'][i]['armorFactor'],tables['runners'][i]['weaponFactor']);n.write(0x48d8d8+i*80,'I',i);n.write(0x48d8e0+i*80,'I',i);n.write(0x48d8d0+i*80,'f',f['health'] if i else 100);n.write(0x48d8e5+i*80,'B',int(i==1 and f['shielded']))
 n.write(owner+0x198,'f',-75);n.write(owner+0x6e4,'f',1 if f['kind']=='Nitro Ram' else 0);n.write(owner+0x6ac,'I',1 if f['kind']=='Missile' else 4)
 n.cpu.mem_write(0x411ee8,b'\x31\xc0\xc3')
 for address in [0x4161b8,0x418990,0x4182f4,0x432a08,0x432bb8]:n.cpu.mem_write(address,b'\xc3')
 n.cpu.mem_write(0x418490,b'\xc2\x04\x00');n.cpu.mem_write(0x418fd4,b'\xb8\xff\xff\xff\xff\xc3');n.cpu.mem_write(0x432460,b'\x31\xc0\xc3');n.cpu.hook_add(UC_HOOK_CODE,lambda cpu,address,size,data:points.append(cpu.reg_read(UC_X86_REG_EDX)),begin=0x418990,end=0x418990)
 if f['kind'] in ['Laser','Missile']:
  pointer=struct.unpack('<f',struct.pack('<I',owner))[0];n.call(0x435828,[0,0,-1,pointer],eax=0,edx=target)
 elif f['kind']=='ShockWave':
  # Supplied eligible wave intersection. The actual response, health and
  # kill/score calls run; geometric/height eligibility is outside this audit.
  hits=RUNNER+0x3000;n.write(hits,'I',1);n.cpu.mem_write(0x434c54,b'\xb8\x01\x00\x00\x00\xc3');n.cpu.mem_write(0x42b468,b'\x31\xc0\xc3');n.cpu.mem_write(0x417dd8,b'\xb8\x01\x00\x00\x00\xc3');n.call(0x43524c,eax=target,edx=hits)
 else:
  n.cpu.mem_write(0x42b468,b'\xb8\x01\x00\x00\x00\xc3');n.call(0x4325e4,eax=owner,edx=0)
 native.append(dict(health=n.read(0x48d8d0+80,'f')[0],active=bool(n.read(target+0x15e,'B')[0]),kills=n.read(0x48d8c4,'I')[0],score=sum(points),nitro=n.read(owner+0x6e4,'f')[0]))
js="""
import {Simulation} from './src/simulation.js';import {runnerContact} from './src/runner-contact.js';import {stepSecondaryProjectile} from './src/secondary.js';let s='';for await(let x of process.stdin)s+=x;
console.log(JSON.stringify(JSON.parse(s).map(f=>{let sim=new Simulation({ground:()=>0,blocked:()=>false,wallContact:()=>null});sim.runners.forEach(r=>r.dead=Infinity);let r=sim.runners[0],q=sim.runners[1];Object.assign(r,{dead:0,inactive:false,x:100,y:0,z:100,yaw:0,speed:75,nitro:f.kind==='Nitro Ram'?1:0});Object.assign(q,{dead:0,inactive:false,x:110,y:0,z:100,speed:0,health:f.health,shield:f.shielded?10:0});sim.score=0;if(f.kind==='Laser'||f.kind==='Missile')sim.projectileContact({owner:0,kind:f.kind,x:110,y:0,z:100,life:1,damage:f.kind==='Missile'?140:4},{x:110,y:0,z:100});else if(f.kind==='ShockWave')stepSecondaryProjectile(sim,{owner:0,kind:f.kind,x:100,y:0,z:100,life:1,scale:20},1/60);else runnerContact(sim,r,q,{aImpact:true,bImpact:false});return {health:q.health,active:!q.dead,kills:r.kills,score:sim.score,nitro:r.nitro}})));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT));mismatches=[dict(fixture=i,native=a,rebuild=b) for i,(a,b) in enumerate(zip(native,rebuilt)) if a!=b]
report=dict(scope='Actual primary 435828, ShockWave response 43524c and unilateral runner-contact response 4325e4 with real profile health/kill helpers. Compare responses for initial zero/one/full health with and without shield, before actor death checks.',sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,fixtures=fixtures,native=native,rebuild=rebuilt,mismatches=mismatches,passed=not mismatches,limitations=['Eligible scene/wave/contact intersections and name/model identifiers are supplied. No native sweep/overlap/height geometry or collision ordering.','Native impact response, audio playback, score/message delivery and victim camera flash are stubs; score call amounts are captured.','Only owner model/profile 0 and victim 1, unilateral contact and five hit kinds. Two simultaneous Nitro runners, barriers, Ion, other hazards, independent effect-node scheduling and full scene traversal remain unverified.'])
(ROOT/'private/verification/hit-responses-native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(fixtures=len(fixtures),mismatches=mismatches,passed=not mismatches),indent=2))
if mismatches:raise SystemExit(1)
