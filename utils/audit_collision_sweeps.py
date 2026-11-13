#!/usr/bin/env python3
"""Real native sweep query generator with supplied ordered intersections."""
import hashlib,json,math,struct,subprocess,itertools
from unicorn import UC_HOOK_CODE,__version__
from unicorn.x86_const import UC_X86_REG_ESP,UC_X86_REG_EAX
from native_ai_audit import Native,ROOT,EXE,RUNNER,f32
n=Native();fixtures=[];native=[];queries=[];floor_calls=[];case={}
# Stable stub returns the supplied query outcome; its hook writes native hits.
n.cpu.mem_write(0x446764,b'\xa1'+struct.pack('<I',RUNNER+0xd100)+b'\xc2\x1c\x00')
n.cpu.mem_write(0x4320e8,b'\xc3')
def query(cpu,address,size,data):
 sp=cpu.reg_read(UC_X86_REG_ESP);points=n.read(sp+4,'ffffff');out=n.read(sp+28,'I')[0];queries.append(dict(from_=list(points[:3]),to=list(points[3:])))
 hit=len(queries)==case['hitAt'];n.write(RUNNER+0xd100,'I',int(not hit));n.write(out,'I',int(hit))
 if hit:n.write(out+4,'ffffffII',0,1 if case['floor'] else 0,1,35,5,37,7,RUNNER+0x2000)
n.cpu.hook_add(UC_HOOK_CODE,query,begin=0x446764,end=0x446764)
n.cpu.hook_add(UC_HOOK_CODE,lambda cpu,a,size,data:floor_calls.append(1),begin=0x4320e8,end=0x4320e8)
variants=['idle','slow','threshold','fast','reverse','lateral','turn','slope']
for yaw,variant,human,hitAt,floor in itertools.product([0,30,135,270],variants,[False,True],range(4),[False,True]):
 speed=0 if variant=='idle' else -30 if variant=='reverse' else 30;delta=0 if variant=='idle' else .49 if variant=='slow' else .5 if variant=='threshold' else 1;lateral=40 if variant=='lateral' else 0
 angle=yaw*3.141592654/180;pitch=.3 if variant=='slope' else 0;r=dict(x=30,y=5,z=40,yaw=yaw*math.pi/180,speed=speed,lateralSpeed=lateral,turn=(180 if variant=='turn' else 15)*math.pi/180,frontVelocity=4,worldVelocity=dict(x=0,y=3,z=-30),previousPosition=dict(x=30.2,y=4.8,z=40.3),forwardVector=dict(x=f32(-math.sin(angle)*math.cos(pitch)),y=f32(math.sin(pitch)),z=f32(-math.cos(angle)*math.cos(pitch))),collisionProbe=dict(x=29.5,y=4.7,z=32.5),rearProbe=dict(x=30.7,y=5.2,z=47.5),deltaX=0,deltaY=0,deltaZ=f32(delta))
 f=dict(r=r,human=human,hitAt=hitAt,floor=floor,dt=f32(1/60),variant=variant);fixtures.append(f)
for case in fixtures:
 r=case['r'];n.cpu.mem_write(RUNNER,b'\0'*0x1000);n.cpu.mem_write(RUNNER+0x2000,b'wall\0');queries.clear();floor_calls.clear();n.write(0x518aa8,'f',case['dt']);n.write(0x48f168,'f',7.5);n.write(0x48f394,'I',0)
 for offset,v in [(0x2c,[r['x'],r['y'],r['z']]),(0x38,list(r['previousPosition'].values())),(0x8c,list(r['forwardVector'].values())),(0xb0,list(r['collisionProbe'].values())),(0x68,list(r['rearProbe'].values())),(0xec,[r['deltaX'],r['deltaY'],r['deltaZ']]),(0x184,list(r['worldVelocity'].values())),(0x190,[r['lateralSpeed'],0,-r['speed']])]:n.write(RUNNER+offset,'fff',*v)
 n.write(RUNNER+0xe4,'f',r['turn']*180/math.pi);n.write(RUNNER+0x144,'f',r['frontVelocity']);n.write(RUNNER+0x1b5,'B',int(case['human']));clear=n.call(0x4313f4,eax=RUNNER)&255
 row=dict(queries=[{'from':q['from_'],'to':q['to']} for q in queries],clear=bool(clear),flag=bool(n.read(RUNNER+0x244,'B')[0]),probe=list(n.read(RUNNER+0xb0,'fff')),oldProbe=list(n.read(RUNNER+0xbc,'fff')),center=list(n.read(RUNNER+0x50,'fff')),oldCenter=list(n.read(RUNNER+0x5c,'fff')),rear=list(n.read(RUNNER+0x68,'fff')),oldRear=list(n.read(RUNNER+0x74,'fff')),floorCalls=len(floor_calls),records={})
 for kind,offset in [('hotSpot',0),('key',0x38),('runner',0x70),('enhancer',0xa8),('floor',0xe0),('wall',0x118),('barrier',0x150),('scrub',0x188)]:
  p=RUNNER+0x248+offset
  if n.read(p+0x1c,'I')[0]:row['records'][kind]=dict(normal=list(n.read(p,'fff')),point=list(n.read(p+0xc,'fff')),source=list(n.read(p+0x20,'fff')),endpoint=list(n.read(p+0x2c,'fff')))
 native.append(row)
js="""
import {collectRunnerContacts} from './src/collision-sweep.js';let s='';for await(let b of process.stdin)s+=b;console.log(JSON.stringify(JSON.parse(s).map(f=>{let r=f.r;r.rearProbe=Object.fromEntries(Object.entries(r.rearProbe).map(([k,v])=>[k,Math.fround(v)]));let queries=0,floorCalls=0,result=collectRunnerContacts(r,f.dt,(a,b)=>++queries===f.hitAt?[{node:{name:'wall'},normal:{x:0,y:f.floor?1:0,z:1},point:{x:35,y:5,z:37}}]:[],{human:f.human,onFloor(){floorCalls++}});return {queries:result.queries.map(q=>({from:Object.values(q.from),to:Object.values(q.to)})),clear:result.clear,flag:r.collisionClear,probe:Object.values(r.collisionProbe),oldProbe:Object.values(r.previousCollisionProbe),center:Object.values(r.collisionCenter),oldCenter:Object.values(r.previousCollisionCenter),rear:Object.values(r.rearProbe),oldRear:Object.values(r.previousRearProbe??{x:0,y:0,z:0}),floorCalls,records:Object.fromEntries(Object.entries(result.records).map(([k,v])=>[k,{normal:Object.values(v.normal),point:Object.values(v.point),source:Object.values(v.source),endpoint:Object.values(v.endpoint)}]))}})))
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT));mismatches=[];maxerr=0

def compare(a,b,path,fixture):
 global maxerr
 if isinstance(a,dict):
  if a.keys()!=b.keys():mismatches.append(dict(fixture=fixture,field=path,native=a,rebuild=b));return
  for k in a:compare(a[k],b[k],path+'.'+k,fixture)
 elif isinstance(a,list):
  if len(a)!=len(b):mismatches.append(dict(fixture=fixture,field=path,native=a,rebuild=b));return
  for i,(x,y) in enumerate(zip(a,b)):compare(x,y,path+f'[{i}]',fixture)
 elif isinstance(a,bool):
  if a!=b:mismatches.append(dict(fixture=fixture,field=path,native=a,rebuild=b))
 else:
  error=abs(a-b);maxerr=max(maxerr,error)
  if error>1e-10:mismatches.append(dict(fixture=fixture,field=path,native=a,rebuild=b))
for i,(a,b) in enumerate(zip(native,rebuilt)):compare(a,b,'',i)
report=dict(scope='Actual native 4313f4 sweep generation, real 431d88 classification and recursive name lookup, supplied ordered scene intersections. Floor-following adjustment 4320e8 is an explicit no-op hook.',sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,fixtures=fixtures,native=native,rebuild=rebuilt,maxNumericError=maxerr,tolerance=1e-10,mismatches=mismatches,passed=not mismatches,limitations=['Original 446764 scene traversal/facet eligibility/hit ordering are supplied query fixtures. Render visibility setters are stubbed.','4320e8 floor-following and its possible extra query are no-op; the audit captures whether that action was requested. Actual collision response, correction rejection and full scene scheduling remain outside this generator audit.'])
(ROOT/'private/verification/collision-sweeps-native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(fixtures=len(fixtures),maxNumericError=maxerr,mismatches=len(mismatches),firstMismatches=mismatches[:8],passed=not mismatches),indent=2))
if mismatches:raise SystemExit(1)
