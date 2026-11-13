#!/usr/bin/env python3
"""Compare original hangar controller and camera actions with synthetic scene nodes."""
import hashlib,json,struct,subprocess
from unicorn import UC_HOOK_CODE,__version__
from unicorn.x86_const import UC_X86_REG_EAX,UC_X86_REG_EDX
from native_ai_audit import Native,ROOT,EXE,RUNNER,SCRATCH,f32
HANGER,ACTOR,CAMERA,YAW,CHASSIS,COCKPIT= [RUNNER+i*0x100 for i in range(6)]
DATA=RUNNER+0x8000
fixtures=[dict(position=[f32(x),f32(10+f32(.01)),f32(z)],yaw=yaw,dt=f32(dt),frames=frames) for x,z,yaw,dt,frames in [
 (9.2,-3.82,292.5,1/60,425),(3.82,-9.2,337.5,1/60,425),(-9.2,3.82,112.5,1/60,425),
 (9.2,3.8,247.5,1/30,215),(0,0,0,.1,75),(0,0,180,1/30,215)]]
native=[]
for f in fixtures:
 n=Native();active=[True];events=[]
 for i,obj in enumerate([HANGER,ACTOR,CAMERA,YAW,CHASSIS,COCKPIT]):n.write(obj+0x44,'I',DATA+i*0x200);n.write(obj+0x28,'I',1)
 n.write(0x48f424,'I',CAMERA);n.write(0x48f428,'I',HANGER);n.write(0x48f3f4,'I',1);n.write(0x48f3f8,'I',0);n.write(0x5192e0,'I',ACTOR);n.write(0x519360,'fff',*f['position']);n.write(0x519300,'fff',0,f['yaw'],0)
 n.write(SCRATCH,'f',f['dt'])
 n.cpu.mem_write(0x44ca3c,b'\xd9\x05'+struct.pack('<I',SCRATCH)+b'\xc3')
 for address in [0x44b4f0,0x44b628,0x42aff4,0x45a3dc,0x45a3e4,0x4593bc,0x4182f4,0x41837c,0x43f1cc,0x444f70,0x426a78,0x418d14,0x4341b0,0x43f248]:n.cpu.mem_write(address,b'\xc3')
 n.cpu.mem_write(0x434b94,b'\xb8'+struct.pack('<I',YAW)+b'\xc3')
 for address in [0x418954,0x411ee8,0x418fd4]:n.cpu.mem_write(address,b'\x31\xc0\xc3')
 n.cpu.mem_write(0x418490,b'\xc2\x04\x00');n.cpu.mem_write(0x43f4fc,b'\xb8\x01\x00\x00\x00\xc3');n.cpu.mem_write(0x44b434,b'\xc3')
 def calls(cpu,address,size,user):
  if address==0x44b434:
   name=bytes(cpu.mem_read(cpu.reg_read(UC_X86_REG_EDX),16)).split(b'\0')[0]
   cpu.reg_write(UC_X86_REG_EAX,{b'yaw':YAW,b'chassis':CHASSIS,b'cockpit':COCKPIT}.get(name,YAW))
  elif address==0x44b628 and cpu.reg_read(UC_X86_REG_EAX)==HANGER and not cpu.reg_read(UC_X86_REG_EDX):active[0]=False
  elif address==0x4182f4:
   number={0x32:3,0x33:2,0x34:1,0x35:0}.get(cpu.reg_read(UC_X86_REG_EAX))
   if number is not None:events.append(number)
 for address in [0x44b434,0x44b628,0x4182f4]:n.cpu.hook_add(UC_HOOK_CODE,calls,begin=address,end=address)
 for address,xyz in [(0x5193e8,[75,11,-30]),(0x5193cc,[0,3.5,7])]:n.write(address,'fff',*xyz);n.call(0x458d88,[f['yaw']],eax=address,edx=address)
 n.call(0x43bc38);active[0]=True;samples=[]
 for frame in range(f['frames']):
  n.call(0x43b9d4,eax=HANGER)
  samples.append(dict(active=active[0],elapsed=n.read(0x48f3fc,'f')[0],height=n.read(DATA+0x28,'f')[0],yaw=n.read(DATA+0x10,'f')[0],cameraStage=n.read(0x5193c0,'I')[0],cameraPosition=list(n.read(DATA+0x400+8,'fff')),cameraAngles=list(n.read(DATA+0x400+0x14,'fff')),events=[*events]))
  if not active[0]:break
 native.append(samples)
js="""
import {beginEntrance,stepEntrance} from './src/entrance.js';
let fixtures=JSON.parse(await new Promise(resolve=>{let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>resolve(s))}));
console.log(JSON.stringify(fixtures.map(f=>{let events=[],s={player:0,runners:[{id:0,x:f.position[0],y:10,z:f.position[2],yaw:f.yaw*Math.PI/180}],time:307.1,emit(type,e){if(type==='countdown')events.push(e.number)}};beginEntrance(s);let out=[];for(let i=0;i<f.frames;i++){stepEntrance(s,f.dt);let e=s.entrance,c=e.active?e.cameraLocal:e.camera;out.push({active:e.active,elapsed:e.elapsed,height:e.height,yaw:e.yawDegrees,cameraStage:e.cameraStage,cameraPosition:[c.x,c.y,c.z],cameraAngles:[e.cameraAngles.pitchDegrees,e.cameraAngles.yawDegrees,e.cameraAngles.rollDegrees],events:[...events]});if(!e.active)break}return out})));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT))
mismatches=[];maxerr=0
for i,(ns,rs) in enumerate(zip(native,rebuilt)):
 if len(ns)!=len(rs):mismatches.append(dict(fixture=i,lengths=[len(ns),len(rs)]))
 for j,(a,b) in enumerate(zip(ns,rs)):
  err=max([abs(a[k]-b[k]) for k in ['elapsed','height','yaw']]+[abs(x-y) for k in ['cameraPosition','cameraAngles'] for x,y in zip(a[k],b[k])]);maxerr=max(maxerr,err)
  if err>.0002 or any(a[k]!=b[k] for k in ['active','cameraStage','events']):mismatches.append(dict(fixture=i,frame=j,error=err,native=a,rebuild=b))
report=dict(scope='Original 43bc38 setup, 43b9d4 hangar controller, 43b820/43b6c8 camera stages and 43b508 final camera placement. Uses actual transform getters/setters and math with synthetic scene nodes; reparenting, visibility, runtime/profile/audio and controller activation are stubbed.',executable=str(EXE.relative_to(ROOT)),sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,fixtures=fixtures,native=native,rebuild=rebuilt,maxNumericError=maxerr,mismatches=mismatches,passed=not mismatches,limitations=['Parent-relative camera poses and hangar state are audited. Complete native scene matrices/scheduling and rendered frames are not compared.','Initial actor positions/headings are supplied fixtures.','Native animated attachments and profile/controller startup effects remain outside this audit.'])
(ROOT/'private/verification/entrance-native-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(fixtures=len(fixtures),nativeFrames=[len(x) for x in native],rebuiltFrames=[len(x) for x in rebuilt],maxNumericError=maxerr,mismatches=len(mismatches),firstMismatch=mismatches[:1],passed=report['passed']),indent=2))
if mismatches:raise SystemExit(1)
