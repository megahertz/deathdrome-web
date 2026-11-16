#!/usr/bin/env python3
"""Real native collision response with supplied contact and rejection result."""
import hashlib,json,math,struct,subprocess
from unicorn import UC_HOOK_CODE,__version__
from unicorn.x86_const import UC_X86_REG_ESP,UC_X86_REG_EAX
from native_ai_audit import Native,ROOT,EXE,RUNNER,SCRATCH,f32
n=Native();fixtures=[];native=[];sounds=[];damage=[]
n.cpu.mem_write(0x433048,b'\xa1'+struct.pack('<I',RUNNER+0xd100)+b'\xc3')
n.cpu.mem_write(0x418f94,b'\xa1'+struct.pack('<I',RUNNER+0xd104)+b'\xc3')
n.cpu.mem_write(0x42a7a8,b'\xc3');n.cpu.mem_write(0x4182f4,b'\xc3');n.cpu.mem_write(0x418e44,b'\xc2\x04\x00')
n.cpu.hook_add(UC_HOOK_CODE,lambda cpu,a,size,data:sounds.append(cpu.reg_read(UC_X86_REG_EAX)),begin=0x4182f4,end=0x4182f4)
n.cpu.hook_add(UC_HOOK_CODE,lambda cpu,a,size,data:damage.append(n.read(cpu.reg_read(UC_X86_REG_ESP)+4,'f')[0]),begin=0x418e44,end=0x418e44)
for yaw in [0,30,135,270]:
 for speed in [0,2,10,50,50.001,90,-20]:
  for angle in [0,45,-45,90]:
   for variant in ['ordinary','rejected','startup','ceiling','specialCeiling','jump','nitro','verticalOnly']:
    r=dict(x=30,y=5,z=40,yaw=f32(yaw)*math.pi/180,speed=f32(speed),lateralSpeed=4 if angle else 0,localVerticalSpeed=5 if variant in ['ceiling','specialCeiling'] else 0,turn=15*math.pi/180,frontVelocity=3,sideVelocity=4,movementEnabled=variant!='startup',actionMode=2 if variant=='jump' else 1,previousActionMode=1,collisionMinimumSpeed=20,nitro=1 if variant=='nitro' else 0)
    rad=yaw*3.141592654/180;c=f32(math.cos(rad));s=f32(math.sin(rad));r['worldVelocity']=dict(x=f32(c*r['lateralSpeed']-s*speed),y=r['localVerticalSpeed'],z=f32(-s*r['lateralSpeed']-c*speed));r['forwardVector']=dict(x=-s,y=0,z=-c);r['previousPosition']=dict(x=29.8,y=5,z=40.5);r['previousForwardVector']=dict(x=0,y=0,z=-1);r['previousPlanarForwardVector']=dict(x=0,z=-1)
    normal=dict(x=f32(math.sin(angle*math.pi/180)),y=-.2 if variant in ['ceiling','specialCeiling'] else 0,z=f32(math.cos(angle*math.pi/180)))
    if variant=='verticalOnly':normal=dict(x=0,y=-1,z=0)
    contact=dict(normal=normal,point=dict(x=30,y=6,z=35),endpoint=dict(x=31,y=8,z=32));f=dict(r=r,contact=contact,rejected=variant=='rejected',special=variant=='specialCeiling',human=True,dt=f32(1/60),variant=variant);fixtures.append(f)
    n.cpu.mem_write(RUNNER,b'\0'*0x1000);sounds.clear();damage.clear();n.write(RUNNER+0xd100,'II',int(f['rejected']),1);n.write(0x518aa8,'f',f['dt']);n.write(0x48f16c,'B',int(f['special']));n.write(RUNNER+8,'BB',r['actionMode'],1)
    for offset,value in [(0x2c,[r['x'],r['y'],r['z']]),(0x38,list(r['previousPosition'].values())),(0x8c,list(r['forwardVector'].values())),(0x98,[0,0,-1]),(0xa4,[0,0,-1]),(0xb0,[31,8,32]),(0x184,list(r['worldVelocity'].values())),(0x190,[r['lateralSpeed'],r['localVerticalSpeed'],-r['speed']])]:n.write(RUNNER+offset,'fff',*value)
    n.write(RUNNER+0xe4,'f',15);n.write(RUNNER+0xf8,'f',20);n.write(RUNNER+0x104,'f',yaw);n.write(RUNNER+0x144,'ff',3,4);n.write(RUNNER+0x15c,'B',int(r['movementEnabled']));n.write(RUNNER+0x6e4,'ff',r['nitro'],1)
    n.write(SCRATCH,'fff',*normal.values());n.write(SCRATCH+0xc,'fff',*contact['point'].values());n.write(SCRATCH+0x2c,'fff',*contact['endpoint'].values());n.call(0x432bb8,eax=RUNNER,edx=SCRATCH)
    native.append(dict(position=list(n.read(RUNNER+0x2c,'fff')),world=list(n.read(RUNNER+0x184,'fff')),local=list(n.read(RUNNER+0x190,'fff')),turn=n.read(RUNNER+0xe4,'f')[0],minimum=n.read(RUNNER+0xf8,'f')[0],front=n.read(RUNNER+0x144,'f')[0],side=n.read(RUNNER+0x148,'f')[0],mode=n.read(RUNNER+8,'B')[0],probe=list(n.read(RUNNER+0xb0,'fff')),delta=list(n.read(RUNNER+0xec,'fff'))[::2],sounds=list(sounds),damage=list(damage)))
js="""
import {collisionResponse} from './src/collision-response.ts';let s='';for await(let b of process.stdin)s+=b;console.log(JSON.stringify(JSON.parse(s).map(f=>{let r=f.r;r.collisionProbe={x:31,y:8,z:32};r.deltaX=0;r.deltaZ=0;let e=collisionResponse(r,f.contact,f);return {position:[r.x,r.y,r.z],world:Object.values(r.worldVelocity),local:[r.lateralSpeed,r.localVerticalSpeed,-r.speed],turn:r.turn*180/Math.PI,minimum:r.collisionMinimumSpeed,front:r.frontVelocity,side:r.sideVelocity,mode:r.actionMode,probe:Object.values(r.collisionProbe),delta:[r.deltaX,r.deltaZ],sounds:e.landingCalls?[1]:[],damage:e.damage?[-Math.fround(e.damage)]:[]}})));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT));mismatches=[];maxerr=0
for i,(a,b) in enumerate(zip(native,rebuilt)):
 for key in a:
  av=a[key] if isinstance(a[key],list) else [a[key]];bv=b[key] if isinstance(b[key],list) else [b[key]]
  err=max([abs(x-y) for x,y in zip(av,bv)]+[0]);maxerr=max(maxerr,err)
  if len(av)!=len(bv) or err>1e-10:mismatches.append(dict(fixture=i,field=key,native=a[key],rebuild=b[key]))
report=dict(scope='Real 432bb8 response and real vector helpers; supplied collision record and candidate rejection result.',sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,fixtures=fixtures,native=native,rebuild=rebuilt,maxNumericError=maxerr,tolerance=1e-10,mismatches=mismatches,passed=not mismatches,limitations=['Contact normal/point/sweep endpoint and 433048 candidate rejection are supplied; scene traversal and contact eligibility are excluded.','Profile health delivery, impact visuals and audio playback are stubs; damage delta and landing call IDs are captured. Unit armor factor supplied.','This audit exercises isolated response, not the following skid pass or full physical callback with scene collisions.'])
(ROOT/'private/verification/collision-response-native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(fixtures=len(fixtures),maxNumericError=maxerr,mismatches=len(mismatches),firstMismatches=mismatches[:12],passed=not mismatches),indent=2))
if mismatches:raise SystemExit(1)
