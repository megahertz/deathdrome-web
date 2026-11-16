#!/usr/bin/env python3
"""Execute original allocation, selection changes and first ordered slot update."""
import hashlib,json,math,struct,subprocess
from unicorn import __version__,UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX
from native_ai_audit import Native,ROOT,EXE,RUNNER,SCRATCH,f32

fixtures=[];native=[]
for missile in [False,True]:
 for selected in range(4):
  for presses in [1,2]:
   for side in [0,1]:
    for human in [False,True]:
     fixtures.append(dict(missile=missile,selected=selected,presses=presses,side=side,human=human,dt=f32(1/60),behind=selected%2==0))
for fixture in fixtures:
 n=Native();target=RUNNER+0x2000;table=SCRATCH+0x8000
 n.write(table,'II',RUNNER,target)
 n.cpu.mem_write(0x434ad4,b'\x8b\x04\x85'+struct.pack('<I',table)+b'\xc3')
 n.cpu.mem_write(0x43414c,b'\xb8\x02\x00\x00\x00\xc3')
 n.cpu.mem_write(0x418f68,b'\xb8'+struct.pack('<I',0 if fixture['human'] else 1)+b'\xc3')
 for address in [0x44b4f0,0x419008,0x42ed54,0x4182f4,0x468928,0x4156d0]:n.cpu.mem_write(address,b'\xc3')
 for address in [0x45a54c,0x45a6bc,0x468a0c]:n.cpu.mem_write(address,b'\xc2\x0c\x00')
 n.cpu.mem_write(0x435d68,b'\x31\xc0\xc2\x04\x00')
 sounds=[]
 n.cpu.hook_add(UC_HOOK_CODE,lambda cpu,address,size,data:sounds.append(cpu.reg_read(UC_X86_REG_EAX)),begin=0x4182f4,end=0x4182f4)
 n.write(0x490650,'I',1);n.write(0x518aa8,'f',fixture['dt']);n.write(0x49064c,'f',fixture['dt'])
 n.write(RUNNER,'I',0);n.write(RUNNER+0x14d,'B',1);n.write(RUNNER+0x15e,'B',1);n.write(RUNNER+0xd8,'I',1)
 n.write(RUNNER+0x498,'4I',4,1,5,6);n.write(RUNNER+0x4a8,'II',1 if fixture['missile'] else 0,4);n.write(RUNNER+0x6e0,'I',12);n.write(RUNNER+0x6dc,'I',fixture['side']);n.write(RUNNER+0x6f8,'I',target)
 for i in range(12):n.write(RUNNER+0x4fc+i*4,'I',RUNNER+0x7000+i*0x100)
 for _ in range(fixture['presses']):n.call(0x43753c,eax=RUNNER)
 count=n.read(RUNNER+0x494,'I')[0]
 before=dict(count=count,cells=list(n.read(RUNNER+0x498,'4I')),selected=n.read(RUNNER+0x4a8,'I')[0],side=n.read(RUNNER+0x6dc,'I')[0],sounds=list(sounds))
 # Supply a different current pose and selection after the button action.
 n.write(RUNNER+0x4a8,'I',fixture['selected']);n.write(RUNNER+0x2c,'fff',40,10,60);n.write(RUNNER+0x104,'fff',f32(36.86989764584402),0,0);n.write(RUNNER+0x198,'f',-75);n.write(RUNNER+0x8c,'fff',f32(-.6),0,f32(-.8));n.write(RUNNER+0x80,'fff',f32(-.6),0,f32(-.8))
 n.write(target,'I',1);n.write(target+0x2c,'fff',100 if fixture['behind'] else -20,10,140 if fixture['behind'] else -20);n.write(target+0xd8,'I',1);n.write(target+0x15e,'B',1)
 n.call(0x4371d0,eax=RUNNER)
 slots=[dict(slot=i,position=list(n.read(RUNNER+0x58c+i*12,'fff')),velocity=list(n.read(RUNNER+0x61c+i*12,'fff')),age=n.read(RUNNER+0x4cc+i*4,'f')[0]) for i in range(count)]
 native.append(dict(before=before,slots=slots,cells=list(n.read(RUNNER+0x498,'4I')),count=n.read(RUNNER+0x4ac,'I')[0],selected=n.read(RUNNER+0x4a8,'I')[0],side=n.read(RUNNER+0x6dc,'I')[0],target=1 if n.read(RUNNER+0x6f8,'I')[0] else None,sounds=list(sounds)))
js="""
import {queueProjectiles,stepRunnerProjectiles} from './src/projectiles.ts';
import {inventoryCells,selectInventoryWeapon} from './src/inventory.ts';
let s='';for await(let x of process.stdin)s+=x;console.log(JSON.stringify(JSON.parse(s).map(f=>{
 let events=[],r={id:0,x:0,y:0,z:0,yaw:0,speed:0,weaponCells:[4,1,5,6],weapons:[null,'Missile','Ion Sword','NanoShield'],selectedWeapon:f.missile?1:0,muzzleSide:f.side,missileLockTarget:1},q={id:1,x:f.behind?100:-20,y:10,z:f.behind?140:-20},sim={player:f.human?0:1,runners:[r,q],projectiles:[],emit(type,data){events.push({type,...data})}};selectInventoryWeapon(r);
 for(let i=0;i<f.presses;i++)queueProjectiles(sim,r,f.missile);
 let sounds=()=>events.filter(e=>e.type==='shot').map(e=>e.soundId),before={count:sim.projectiles.length,cells:[...inventoryCells(r)],selected:r.selectedWeapon,side:r.muzzleSide,sounds:sounds()};
 Object.assign(r,{selectedWeapon:f.selected,x:40,y:10,z:60,yaw:36.86989764584402*Math.PI/180,speed:75,forwardVector:{x:Math.fround(-.6),y:0,z:Math.fround(-.8)},planarForwardVector:{x:Math.fround(-.6),z:Math.fround(-.8)}});selectInventoryWeapon(r);stepRunnerProjectiles(sim,r,f.dt);
 return {before,slots:sim.projectiles.map(p=>({slot:p.slot,position:[p.x,p.y,p.z],velocity:[p.vx,p.vy,p.vz],age:p.age})),cells:[...inventoryCells(r)],count:r.weapons.length,selected:r.selectedWeapon,side:r.muzzleSide,target:r.missileLockTarget,sounds:sounds()};
})));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT));mismatches=[];maxerr=0
for i,(a,b) in enumerate(zip(native,rebuilt)):
 for key in ['before','cells','count','selected','side','target','sounds']:
  if a[key]!=b[key]:mismatches.append(dict(fixture=i,field=key,native=a[key],rebuild=b[key]))
 for x,y in zip(a['slots'],b['slots']):
  err=max([abs(v-w) for key in ['position','velocity'] for v,w in zip(x[key],y[key])]+[abs(x['age']-y['age'])]);maxerr=max(maxerr,err)
  if err>.00003:mismatches.append(dict(fixture=i,slot=x['slot'],error=err,native=x,rebuild=y))
report=dict(scope='Actual 43753c allocation followed by supplied pose/selection changes and actual 4371d0 wrapper, 436230 lock scan, 4359e4/436634 first actions and 43738c consumption. All four cells, selection, muzzle bit, sound IDs and first motion are compared.',sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,fixtures=fixtures,native=native,rebuild=rebuilt,maxNumericError=maxerr,mismatches=mismatches,passed=not mismatches,limitations=['Supplied human/AI type, model lookup, runner poses and occupancy masks; full native input/AI/scene scheduler is not executed.','Scene intersections, rendering/node setters, sound playback and HUD delivery are stubs. Sound call IDs are captured.','Positive 60 Hz first update only; zero-time repeated initialization and dead-owner scene lifecycle remain unverified.'])
(ROOT/'private/verification/projectile-initialization-native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(fixtures=len(fixtures),maxNumericError=maxerr,mismatches=mismatches,passed=not mismatches),indent=2))
if mismatches:raise SystemExit(1)
