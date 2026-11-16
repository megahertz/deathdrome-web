#!/usr/bin/env python3
"""Compare unsteered original projectile actions through their expiry update."""
import hashlib,json,struct,subprocess
from unicorn import __version__
from native_ai_audit import Native,ROOT,EXE,RUNNER,f32
fixtures=[];native=[]
for missile in [False,True]:
 for dt,speed,yaw in [(1/60,75,22.5),(1/30,-40,112.5),(.01,0,247.5),(.025,123.456,292.5)]:
  fixtures.append(dict(missile=missile,dt=f32(dt),r=dict(id=0,x=f32(123.456),y=f32(10),z=f32(-87.654),yaw=yaw*3.141592653589793/180,speed=f32(speed),turn=0,forwardVector=dict(x=f32(.6),y=0,z=f32(-.8)))))
for fixture in fixtures:
 n=Native();r=fixture['r'];missile=fixture['missile'];n.cpu.mem_write(0x418f68,b'\x31\xc0\xc3');n.write(0x490650,'I',1);n.write(RUNNER,'I',0);n.write(RUNNER+0x2c,'fff',r['x'],r['y'],r['z']);n.write(RUNNER+0x104,'f',f32(r['yaw']*180/3.141592653589793));n.write(RUNNER+0x198,'f',-r['speed']);n.write(RUNNER+0x8c,'fff',*r['forwardVector'].values());n.write(RUNNER+0x4bc,'B',1);n.write(RUNNER+0x494,'I',1);n.write(0x518aa8,'f',fixture['dt'])
 for address in [0x44b4f0,0x419008,0x42ed54,0x4182f4,0x468928,0x43738c]:n.cpu.mem_write(address,b'\xc3')
 n.cpu.mem_write(0x434ad4,b'\xb8'+struct.pack('<I',RUNNER)+b'\xc3')
 for address in [0x45a54c,0x45a6bc,0x468a0c]:n.cpu.mem_write(address,b'\xc2\x0c\x00')
 n.cpu.mem_write(0x435d68,b'\x31\xc0\xc2\x04\x00') # no scene hit
 n.cpu.mem_write(0x436388,b'\xc3') # no target/steering in this audit
 samples=[]
 for frame in range(1,1001):
  n.call(0x436634 if missile else 0x4359e4,eax=RUNNER,edx=0)
  active=bool(n.read(RUNNER+0x4bc,'B')[0]);samples.append(dict(frame=frame,position=list(n.read(RUNNER+0x58c,'fff')),velocity=list(n.read(RUNNER+0x61c,'fff')),age=n.read(RUNNER+0x4cc,'f')[0] if active else None,active=active))
  if not active:break
 else:raise RuntimeError('Projectile never expired')
 native.append(samples)
js="""
import {launchProjectiles,stepProjectileMotion} from './src/projectiles.ts';let s='';for await(let x of process.stdin)s+=x;
console.log(JSON.stringify(JSON.parse(s).map(({r,missile,dt})=>{
 let sim={player:0,runners:[r],projectiles:Array.from({length:11},()=>({owner:0,kind:'Laser',life:1})),emit(){}};launchProjectiles(sim,r,missile);let p=sim.projectiles.at(-1),out=[];
 for(let frame=1;frame<=1000;frame++){stepProjectileMotion(p,dt);let active=p.life>0;out.push({frame,position:[p.x,p.y,p.z],velocity:[p.vx,p.vy,p.vz],age:active?p.age:null,active});if(!active)break;}return out;
})));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT));maxerr=0;mismatches=[];fields=0
for i,(a,b) in enumerate(zip(native,rebuilt)):
 if len(a)!=len(b):mismatches.append(dict(fixture=i,nativeFrames=len(a),rebuildFrames=len(b)))
 for j,(x,y) in enumerate(zip(a,b)):
  errors=[abs(v-w) for k in ['position','velocity'] for v,w in zip(x[k],y[k])];fields+=len(errors)
  if x['age'] is not None and y['age'] is not None:errors.append(abs(x['age']-y['age']));fields+=1
  err=max(errors);maxerr=max(err,maxerr)
  if err>0.00003 or x['active']!=y['active']:mismatches.append(dict(fixture=i,frame=j+1,error=err,native=x,rebuild=y))
report=dict(scope='Complete original 4359e4/436634 action calls through expiry, with collision and steering disabled; actual initialization, float velocity/position/age arithmetic and expiry cleanup execute.',sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,fixtures=fixtures,native=native,rebuild=rebuilt,updates=sum(map(len,native)),numericFields=fields,maxNumericError=maxerr,mismatches=mismatches,passed=not mismatches,limitations=['No scene intersections, target acquisition or missile steering; supplied directions and poses.','Audio/profile/inventory/render-node setter calls are stubbed.','Vertical out-of-band contact branch is separately source-derived, not executed in this audit.','Does not compare the native scene scheduler or rendered frames.'])
(ROOT/'private/verification/projectile-motion-native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['updates','numericFields','maxNumericError','mismatches','passed']},indent=2))
if mismatches:raise SystemExit(1)
