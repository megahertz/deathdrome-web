#!/usr/bin/env python3
"""Compare original missile initialization, guidance and flight together."""
import hashlib,json,math,struct,subprocess
from unicorn import __version__
from native_ai_audit import Native,ROOT,EXE,RUNNER,f32
fixtures=[];native=[]
for dt,frames,offset in [(1/60,120,[120,5,-180]),(1/30,60,[-100,-4,80]),(1/120,240,[160,10,-60])]:
 r=dict(id=0,x=f32(20),y=f32(10),z=f32(50),yaw=.6435011087932844,speed=f32(60),turn=0,forwardVector=dict(x=f32(-.6),y=0,z=f32(-.8)))
 targets=[dict(x=f32(r['x']+offset[0]+i*.1),y=f32(r['y']+offset[1]+math.sin(i*dt)*2),z=f32(r['z']+offset[2]-i*.05)) for i in range(frames)]
 fixtures.append(dict(r=r,dt=f32(dt),targets=targets))
for fixture in fixtures:
 n=Native();r=fixture['r'];target=RUNNER+0x2000;n.cpu.mem_write(0x418f68,b'\x31\xc0\xc3');n.write(0x490650,'I',1);n.write(RUNNER,'I',0);n.write(RUNNER+0x2c,'fff',r['x'],r['y'],r['z']);n.write(RUNNER+0x104,'f',f32(r['yaw']*180/math.pi));n.write(RUNNER+0x198,'f',-r['speed']);n.write(RUNNER+0x8c,'fff',*r['forwardVector'].values());n.write(RUNNER+0x4bc,'B',1);n.write(RUNNER+0x494,'I',1);n.write(RUNNER+0x6f8,'I',target);n.write(0x518aa8,'f',fixture['dt']);n.write(0x49064c,'f',fixture['dt'])
 for address in [0x44b4f0,0x419008,0x42ed54,0x4182f4,0x468928,0x43738c]:n.cpu.mem_write(address,b'\xc3')
 n.cpu.mem_write(0x434ad4,b'\xb8'+struct.pack('<I',RUNNER)+b'\xc3')
 node=RUNNER+0x7000;node_data=RUNNER+0x8000;n.write(RUNNER+0x4fc,'I',node);n.write(node+0x44,'I',node_data);n.write(node+0x28,'I',1)
 for address in [0x45a6bc,0x468a0c]:n.cpu.mem_write(address,b'\xc2\x0c\x00')
 n.cpu.mem_write(0x435d68,b'\x31\xc0\xc2\x04\x00');samples=[]
 for t in fixture['targets']:
  n.write(target+0x2c,'fff',t['x'],t['y'],t['z']);n.call(0x436634,eax=RUNNER,edx=0);samples.append(dict(position=list(n.read(RUNNER+0x58c,'fff')),velocity=list(n.read(RUNNER+0x61c,'fff')),angles=list(n.read(node_data+0xc,'fff')),age=n.read(RUNNER+0x4cc,'f')[0],active=bool(n.read(RUNNER+0x4bc,'B')[0])))
 native.append(samples)
js="""
import {launchProjectiles,steerMissile,stepProjectileMotion} from './src/projectiles.js';let s='';for await(let x of process.stdin)s+=x;console.log(JSON.stringify(JSON.parse(s).map(({r,dt,targets})=>{
 let sim={player:0,runners:[r],projectiles:[],emit(){}};launchProjectiles(sim,r,true);let p=sim.projectiles[0];return targets.map(t=>{if(p.age>0)steerMissile(p,t,dt);stepProjectileMotion(p,dt);return {position:[p.x,p.y,p.z],velocity:[p.vx,p.vy,p.vz],angles:[p.angles.pitch,p.angles.yaw,p.angles.roll],age:p.age,active:p.life>0}});
})));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT));maxerr=0;mismatches=[];fields=0
for i,(a,b) in enumerate(zip(native,rebuilt)):
 for j,(x,y) in enumerate(zip(a,b)):
  errors=[abs(v-w) for k in ['position','velocity','angles'] for v,w in zip(x[k],y[k])]+[abs(x['age']-y['age'])];err=max(errors);fields+=len(errors);maxerr=max(maxerr,err)
  if err>.0002 or x['active']!=y['active']:mismatches.append(dict(fixture=i,update=j+1,error=err,native=x,rebuild=y))
report=dict(scope='Complete original 436634 calls combine initialization, live 436388 steering and float motion/age for three supplied moving-target trajectories at 30, 60 and 120 Hz. Real Euler initializer/increment setters execute on a supplied node; shared target pointer is supplied.',sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,fixtures=fixtures,native=native,rebuild=rebuilt,updates=sum(map(len,native)),numericFields=fields,maxNumericError=maxerr,tolerance=.0002,mismatches=mismatches,passed=not mismatches,limitations=['Scene intersections, audio/profile/inventory, node-position and sound-position setters are explicit stubs.','No exact-zero heading in these fixtures; original unwritten-stack branch remains unresolved.','No shared-lock acquisition/update-order comparison or native rendered frames.'])
(ROOT/'private/verification/missile-flight-native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['updates','numericFields','maxNumericError','mismatches','passed']},indent=2))
if mismatches:raise SystemExit(1)
