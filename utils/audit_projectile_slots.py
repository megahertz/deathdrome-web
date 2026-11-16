#!/usr/bin/env python3
"""Compare original fire allocation and ordered live-slot dispatch/cleanup."""
import hashlib,json,random,struct,subprocess
from unicorn import __version__
from native_ai_audit import Native,ROOT,EXE,RUNNER,f32
random.seed(1996)
masks=[0,4095,4094,2047,0x555,0xaaa,0x484]+[random.randrange(4096) for _ in range(25)]
allocation_fixtures=[];allocation_native=[]
for mask in masks:
 for missile in [False,True]:
  n=Native();slots=[dict(slot=i,kind='Missile' if i%2 else 'Laser') for i in range(12) if mask&(1<<i)];n.write(RUNNER+0x6e0,'I',12);n.write(RUNNER+0x494,'I',len(slots));n.write(RUNNER+0x14d,'B',1);n.write(RUNNER+0x498,'I',1 if missile else 4)
  for p in slots:n.write(RUNNER+0x4bc+p['slot'],'B',1);n.write(RUNNER+0x6ac+p['slot']*4,'I',1 if p['kind']=='Missile' else 4)
  n.call(0x43753c,eax=RUNNER)
  result=[dict(slot=i,kind='Missile' if n.read(RUNNER+0x6ac+i*4,'I')[0]==1 else 'Laser') for i in range(12) if n.read(RUNNER+0x4bc+i,'B')[0]]
  allocation_fixtures.append(dict(slots=slots,missile=missile));allocation_native.append(dict(slots=result,count=n.read(RUNNER+0x494,'I')[0]))
dispatch_fixtures=[];dispatch_native=[]
for laser_slot,missile_slots in [(0,[3,11]),(8,[0,11]),(11,[0,8]),(4,[2,7])]:
 n=Native();target=RUNNER+0x2000;dt=f32(1/60);slots=[dict(slot=i,kind='Missile',age=f32(.2)) for i in missile_slots]+[dict(slot=laser_slot,kind='Laser',age=f32(.999))]
 n.write(RUNNER,'I',0);n.write(RUNNER+0x2c,'fff',0,10,0);n.write(RUNNER+0x80,'fff',0,0,-1);n.write(RUNNER+0xd8,'I',1);n.write(RUNNER+0x498,'I',4);n.write(RUNNER+0x6e0,'I',12);n.write(RUNNER+0x494,'I',len(slots));n.write(RUNNER+0x6f8,'I',target);n.write(target+0x2c,'fff',100,10,-100);n.write(target+0x15e,'B',1);n.write(target+0xd8,'I',1);n.write(0x518aa8,'f',dt);n.write(0x49064c,'f',dt);n.write(0x518ec0,'I',1);n.write(0x518ed0,'I',4);n.write(0x48f1b4,'B',0)
 for address in [0x44b4f0,0x468928]:n.cpu.mem_write(address,b'\xc3')
 for address in [0x45a6bc,0x45a5fc,0x468a0c]:n.cpu.mem_write(address,b'\xc2\x0c\x00')
 n.cpu.mem_write(0x435d68,b'\x31\xc0\xc2\x04\x00')
 for p in slots:
  i=p['slot'];n.write(RUNNER+0x4bc+i,'B',1);n.write(RUNNER+0x6ac+i*4,'I',1 if p['kind']=='Missile' else 4);n.write(RUNNER+0x4cc+i*4,'f',p['age']);n.write(RUNNER+0x58c+i*12,'fff',0,10,0);n.write(RUNNER+0x61c+i*12,'fff',-90,0,-120)
 n.call(0x4371d0,eax=RUNNER);result=[]
 for p in slots:
  i=p['slot'];active=bool(n.read(RUNNER+0x4bc+i,'B')[0]);result.append(dict(slot=i,active=active,position=list(n.read(RUNNER+0x58c+i*12,'fff')),velocity=list(n.read(RUNNER+0x61c+i*12,'fff')),age=n.read(RUNNER+0x4cc+i*4,'f')[0] if active else None))
 dispatch_fixtures.append(dict(slots=slots,dt=dt));dispatch_native.append(dict(slots=result,count=n.read(RUNNER+0x494,'I')[0],target=1 if n.read(RUNNER+0x6f8,'I')[0] else None))
js="""
import {launchProjectiles,projectileSlots,stepRunnerProjectiles} from './src/projectiles.ts';let s='';for await(let x of process.stdin)s+=x;let data=JSON.parse(s);
const allocation=data.allocation.map(({slots,missile})=>{let r={id:0,x:0,y:10,z:0,yaw:0,speed:0,weapon:missile?'Missile':null},sim={player:0,runners:[r],projectiles:slots.map(p=>({...p,owner:0,life:1})),emit(){}};launchProjectiles(sim,r,missile);let active=projectileSlots(sim,r);return {slots:active.map(({slot,kind})=>({slot,kind})),count:active.length}});
const dispatch=data.dispatch.map(({slots,dt})=>{let r={id:0,x:0,y:10,z:0,yaw:0,weapon:null,missileLockTarget:1},sim={runners:[r,{id:1,x:100,y:10,z:-100}],projectiles:slots.map(p=>({...p,owner:0,x:0,y:10,z:0,vx:-90,vy:0,vz:-120,dx:-.6,dy:0,dz:-.8,speed:150,lifetime:p.kind==='Missile'?4:1,life:(p.kind==='Missile'?4:1)-p.age}))};stepRunnerProjectiles(sim,r,dt);return {slots:sim.projectiles.map(p=>({slot:p.slot,active:p.life>0,position:[p.x,p.y,p.z],velocity:[p.vx,p.vy,p.vz],age:p.life>0?p.age:null})),count:sim.projectiles.filter(p=>p.life>0).length,target:r.missileLockTarget}});
console.log(JSON.stringify({allocation,dispatch}));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],input=json.dumps(dict(allocation=allocation_fixtures,dispatch=dispatch_fixtures)).encode(),cwd=ROOT));mismatches=[];maxerr=0
for i,(a,b) in enumerate(zip(allocation_native,rebuilt['allocation'])):
 if a!=b:mismatches.append(dict(allocation=i,native=a,rebuild=b))
for i,(a,b) in enumerate(zip(dispatch_native,rebuilt['dispatch'])):
 if a['count']!=b['count'] or a['target']!=b['target']:mismatches.append(dict(dispatch=i,native=a,rebuild=b))
 for x,y in zip(a['slots'],b['slots']):
  errors=[abs(v-w) for k in ['position','velocity'] for v,w in zip(x[k],y[k])]
  if x['age'] is not None and y['age'] is not None:errors.append(abs(x['age']-y['age']))
  err=max(errors);maxerr=max(maxerr,err)
  if err>.00004 or x['active']!=y['active']:mismatches.append(dict(dispatch=i,slot=x['slot'],error=err,native=x,rebuild=y))
report=dict(scope='Actual 43753c fire dispatch and 435974 allocation for 64 pool masks/kinds; actual 4371d0 slot dispatch with live laser/missile guidance, motion and expiry cleanup for four ordered mixed-slot cases.',sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,allocationFixtures=allocation_fixtures,allocationNative=allocation_native,allocationRebuild=rebuilt['allocation'],dispatchFixtures=dispatch_fixtures,dispatchNative=dispatch_native,dispatchRebuild=rebuilt['dispatch'],maxNumericError=maxerr,mismatches=mismatches,passed=not mismatches,limitations=['Dispatch fixtures start from initialized projectiles and select Laser ID 4; shared lock is supplied.','Scene intersections, visibility, sound and render transform setters are explicit stubs.','Does not compare deferred first initialization/inventory consumption, barriers, native actor scene scheduling or rendered frames.'])
(ROOT/'private/verification/projectile-slots-native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(allocations=len(allocation_fixtures),dispatches=len(dispatch_fixtures),maxNumericError=maxerr,mismatches=mismatches,passed=not mismatches),indent=2))
if mismatches:raise SystemExit(1)
