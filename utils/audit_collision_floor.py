#!/usr/bin/env python3
"""Actual 4320e8 floor-following action and conditional forward query."""
import hashlib,json,math,struct,subprocess,itertools
from unicorn import UC_HOOK_CODE,__version__
from unicorn.x86_const import UC_X86_REG_ESP
from native_ai_audit import Native,ROOT,EXE,RUNNER,f32
n=Native();fixtures=[];native=[];queries=[];case={}
n.cpu.mem_write(0x446764,b'\xa1'+struct.pack('<I',RUNNER+0xd100)+b'\xc2\x1c\x00')
def query(cpu,address,size,data):
 sp=cpu.reg_read(UC_X86_REG_ESP);p=n.read(sp+4,'ffffff');out=n.read(sp+28,'I')[0];queries.append(dict(from_=list(p[:3]),to=list(p[3:])));hit=case['hit']>0;n.write(RUNNER+0xd100,'I',int(not hit));n.write(out,'I',int(hit))
 if hit:n.write(out+4,'ffffffII',0,1 if case['hit']==2 else 0,1,35,5,37,7,RUNNER+0x2100)
n.cpu.hook_add(UC_HOOK_CODE,query,begin=0x446764,end=0x446764)
for yaw,speed,lateral,slope,hit in itertools.product([0,30,135],[30,100,100.001,-30],[0,20,20.001,150],[-.4,0,.4],range(3)):
 rad=yaw*3.141592654/180;s=f32(math.sin(rad));c=f32(math.cos(rad));ny=f32(math.sqrt(1-slope*slope));normal=dict(x=f32(slope*s),y=ny,z=f32(slope*c));r=dict(x=30,y=5,z=40,speed=f32(speed),lateralSpeed=f32(lateral),localVerticalSpeed=3,worldVelocity=dict(x=f32(c*lateral-s*speed),y=3,z=f32(-s*lateral-c*speed)),planarForwardVector=dict(x=-s,z=-c),forwardVector=dict(x=-s,y=0,z=-c),frontVelocity=1,sideVelocity=2,maxSpeed=100,collisionProbe=dict(x=29,y=4,z=32),previousCollisionProbe=dict(x=28,y=4.5,z=33))
 fixtures.append(dict(r=r,normal=normal,hit=hit,dt=f32(1/60)))
for case in fixtures:
 r=case['r'];queries.clear();n.cpu.mem_write(RUNNER,b'\0'*0x1000);n.cpu.mem_write(RUNNER+0x2000,b'floor\0');n.cpu.mem_write(RUNNER+0x2100,b'wall\0');n.write(0x518aa8,'f',case['dt']);n.write(0x48f394,'I',0)
 for offset,v in [(0x2c,[r['x'],r['y'],r['z']]),(0x80,[r['planarForwardVector']['x'],0,r['planarForwardVector']['z']]),(0x8c,list(r['forwardVector'].values())),(0xb0,list(r['collisionProbe'].values())),(0xbc,list(r['previousCollisionProbe'].values())),(0x184,list(r['worldVelocity'].values())),(0x190,[r['lateralSpeed'],r['localVerticalSpeed'],-r['speed']])]:n.write(RUNNER+offset,'fff',*v)
 n.write(RUNNER+0x100,'f',100);n.write(RUNNER+0x144,'ff',1,2);n.write(RUNNER+0x328,'ffffffII',*case['normal'].values(),35,5,37,1,RUNNER+0x2000);n.write(RUNNER+0x348,'ffffff',10,2,20,50,3,60)
 n.call(0x4320e8,eax=RUNNER);records={}
 for kind,offset in [('floor',0x328),('wall',0x360)]:
  if n.read(RUNNER+offset+0x1c,'I')[0]:records[kind]=dict(tag=n.read(RUNNER+offset+0x18,'I')[0],normal=list(n.read(RUNNER+offset,'fff')),point=list(n.read(RUNNER+offset+0xc,'fff')),source=list(n.read(RUNNER+offset+0x20,'fff')),endpoint=list(n.read(RUNNER+offset+0x2c,'fff')))
 native.append(dict(queries=[{'from':q['from_'],'to':q['to']} for q in queries],forward=list(n.read(RUNNER+0x8c,'fff')),world=list(n.read(RUNNER+0x184,'fff')),front=n.read(RUNNER+0x144,'f')[0],side=n.read(RUNNER+0x148,'f')[0],probe=list(n.read(RUNNER+0xb0,'fff')),records=records))
js="""
import {followCollisionFloor} from './src/collision-sweep.ts';let s='';for await(let b of process.stdin)s+=b;console.log(JSON.stringify(JSON.parse(s).map(f=>{let r=f.r,records={floor:{tag:1,node:{name:'floor'},normal:f.normal,point:{x:35,y:5,z:37},source:{x:10,y:2,z:20},endpoint:{x:50,y:3,z:60}}},result=followCollisionFloor(r,records,f.dt,(a,b)=>f.hit?[{tag:7,node:{name:'wall'},normal:{x:0,y:f.hit===2?1:0,z:1},point:{x:35,y:5,z:37}}]:[]);return {queries:result.queries.map(q=>({from:Object.values(q.from),to:Object.values(q.to)})),forward:Object.values(r.forwardVector),world:Object.values(r.worldVelocity),front:r.frontVelocity,side:r.sideVelocity,probe:Object.values(r.collisionProbe),records:Object.fromEntries(Object.entries(records).map(([k,v])=>[k,{tag:v.tag,normal:Object.values(v.normal),point:Object.values(v.point),source:Object.values(v.source),endpoint:Object.values(v.endpoint)}]))}})))
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT));mismatches=[];maxerr=0
def compare(a,b,path,fixture):
 global maxerr
 if isinstance(a,dict):
  if a.keys()!=b.keys():mismatches.append(dict(fixture=fixture,field=path,native=a,rebuild=b));return
  for k in a:compare(a[k],b[k],path+'.'+k,fixture)
 elif isinstance(a,list):
  if len(a)!=len(b):mismatches.append(dict(fixture=fixture,field=path,native=a,rebuild=b));return
  for i,(x,y) in enumerate(zip(a,b)):compare(x,y,path+f'[{i}]',fixture)
 else:
  error=abs(a-b);maxerr=max(maxerr,error)
  if error>1e-10:mismatches.append(dict(fixture=fixture,field=path,native=a,rebuild=b))
for i,(a,b) in enumerate(zip(native,rebuilt)):compare(a,b,'',i)
report=dict(scope='Actual 4320e8 floor-following action, real vector math, conditional scene query and real classification. Supplied normal, runner state and ordered intersections.',sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,fixtures=fixtures,native=native,rebuild=rebuilt,maxNumericError=maxerr,tolerance=1e-10,mismatches=mismatches,passed=not mismatches,limitations=['Scene query results and synthetic collision nodes are supplied; facet traversal, dynamic surfaces, controller/physical action integration and rendering are excluded.','Render visibility setters are no-op; actual query endpoints and retained/replaced floor/wall records are compared.'])
(ROOT/'private/verification/collision-floor-native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(fixtures=len(fixtures),maxNumericError=maxerr,mismatches=len(mismatches),firstMismatches=mismatches[:8],passed=not mismatches),indent=2))
if mismatches:raise SystemExit(1)
