#!/usr/bin/env python3
"""Compare real three-probe ground action with supplied terrain intersections."""
import hashlib,json,math,random,struct,subprocess
from unicorn import __version__,UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_ESP,UC_X86_REG_EAX
from native_ai_audit import ROOT,EXE,RUNNER,f32
from native_ground_audit import GroundNative

terrains=[dict(kind='plane',base=10,sx=0,sz=0),dict(kind='plane',base=10,sx=.2,sz=.1),dict(kind='plane',base=10,sx=-.35,sz=.25),dict(kind='step',base=10,height=1.5,edge=30.25),dict(kind='step',base=10,height=4,edge=29.75),dict(kind='plane',base=0,sx=0,sz=0)]
fixtures=[]
for terrain in terrains:
 for dt in [1/30,1/60,1/120]:
  for yaw,pitch,roll,vy,above,mode in [(0,0,0,0,0,1),(45,0,0,-12,2,1),(120,8,-5,15,5,2),(247.5,-12,10,-18,.1,2)]:
   floor=terrain['base']+(terrain['sx']*30+terrain['sz']*40 if terrain['kind']=='plane' else terrain['height'] if 30>=terrain['edge'] else 0)
   fixtures.append(dict(terrain=terrain,dt=f32(dt),r=dict(id=0,x=30,y=f32(max(0,floor)+above),z=40,yaw=yaw*math.pi/180,chassisPitchDegrees=pitch,chassisRollDegrees=roll,vy=vy,frontVelocity=vy,sideVelocity=vy,actionMode=mode,previousActionMode=1,grounded=True,localSpeed=30,lateralSpeed=4)))
rng=random.Random(1996)
for i in range(192):
 terrain=dict(kind='plane',base=60,sx=f32(rng.uniform(-.8,.8)),sz=f32(rng.uniform(-.5,.5))) if i%3 else dict(kind='step',base=10,height=f32(rng.uniform(.1,8)),edge=f32(rng.uniform(29,31)))
 x=f32(rng.uniform(28,32));z=f32(rng.uniform(35,45));floor=terrain['base']+(terrain['sx']*x+terrain['sz']*z if terrain['kind']=='plane' else terrain['height'] if x>=terrain['edge'] else 0)
 fixtures.append(dict(terrain=terrain,dt=f32([1/30,1/60,1/120][i%3]),r=dict(id=0,x=x,y=f32(floor+rng.uniform(-1,8)),z=z,yaw=rng.uniform(0,2*math.pi),chassisPitchDegrees=f32(rng.uniform(-40,40)),chassisRollDegrees=f32(rng.uniform(-40,40)),vy=f32(rng.uniform(-40,40)),frontVelocity=f32(rng.uniform(-40,40)),sideVelocity=f32(rng.uniform(-40,40)),actionMode=1+i%2,previousActionMode=1,grounded=True,localSpeed=f32(rng.uniform(-80,80)),lateralSpeed=f32(rng.uniform(-20,20)),deltaX=f32(rng.uniform(-4,4)),deltaZ=f32(rng.uniform(-4,4)))))
layers=[
 [dict(base=10,sx=0,sz=0),dict(base=12,sx=0,sz=0),dict(base=40,sx=0,sz=0)],
 [dict(base=-1,sx=0,sz=0),dict(base=0,sx=0,sz=0),dict(base=10,sx=0,sz=0)],
 [dict(base=0,sx=0,sz=0),dict(base=12,sx=.2,sz=.1),dict(base=40,sx=0,sz=0)],
 [dict(base=12,sx=0,sz=0),dict(base=12,sx=0,sz=0),dict(base=40,sx=-.2,sz=.1)],
]
for layer in layers:
 for dt in [1/30,1/60,1/120]:
  for i,y in enumerate([10,11.9,12.1,39.7]):
   fixtures.append(dict(terrain=dict(kind='layers',layers=layer),dt=f32(dt),r=dict(id=0,x=30,y=f32(y),z=40,yaw=i*math.pi/4,chassisPitchDegrees=0,chassisRollDegrees=0,vy=-4,frontVelocity=-4,sideVelocity=-4,actionMode=1+i%2,previousActionMode=1,grounded=True,localSpeed=30,lateralSpeed=4,deltaX=.5,deltaZ=.7)))
for fixture_index,item in enumerate(fixtures):
 r=item['r'];r['human']=fixture_index%3!=0;r['grounded']=fixture_index%3!=1;pitch=r['chassisPitchDegrees']*math.pi/180;yaw=r['yaw'];r['forwardVector']=dict(zip(['x','y','z'],[f32(-math.sin(yaw)*math.cos(pitch)),f32(math.sin(pitch)),f32(-math.cos(yaw)*math.cos(pitch))]))
n=GroundNative();queries=n.queries;sounds=n.sounds;native=[]
for f in fixtures:
 n.terrain=f['terrain'];r=f['r'];sounds.clear();n.cpu.mem_write(RUNNER,b'\0'*0x10000);n.write(RUNNER+0xd100,'I',int(r['human']));queries.clear();pitch=r['chassisPitchDegrees']*math.pi/180;yaw=r['yaw'];forward=[f32(-math.sin(yaw)*math.cos(pitch)),f32(math.sin(pitch)),f32(-math.cos(yaw)*math.cos(pitch))]
 n.write(0x518aa8,'f',f['dt']);n.write(0x49064c,'f',f['dt']);n.write(0x490650,'I',1);n.write(0x48f130,'f',.2);n.write(0x48f134,'f',2);n.write(0x48f13c,'f',98)
 n.write(RUNNER,'II',0,0);n.write(RUNNER+8,'BB',r['actionMode'],r['previousActionMode']);n.write(RUNNER+0x2c,'fff',r['x'],r['y'],r['z']);n.write(RUNNER+0x8c,'fff',*forward);n.write(RUNNER+0x104,'fff',yaw*180/math.pi,r['chassisPitchDegrees'],r['chassisRollDegrees']);n.write(RUNNER+0xec,'fff',r.get('deltaX',0),0,r.get('deltaZ',0));n.write(RUNNER+0x144,'ff',r['frontVelocity'],r['sideVelocity']);n.write(RUNNER+0x14c,'BB',int(r['grounded']),1);n.write(RUNNER+0x15c,'B',1);n.write(RUNNER+0x184,'fff',r['lateralSpeed'],r['vy'],-r['localSpeed']);n.write(RUNNER+0x190,'fff',r['lateralSpeed'],r['vy'],-r['localSpeed'])
 n.call(0x430280,eax=RUNNER)
 native.append(dict(position=list(n.read(RUNNER+0x2c,'fff')),pitch=n.read(RUNNER+0x108,'f')[0],roll=n.read(RUNNER+0x10c,'f')[0],frontVelocity=n.read(RUNNER+0x144,'f')[0],sideVelocity=n.read(RUNNER+0x148,'f')[0],worldVelocity=list(n.read(RUNNER+0x184,'fff')),localVelocity=list(n.read(RUNNER+0x190,'fff')),grounded=bool(n.read(RUNNER+0x14c,'B')[0]),supportContact=bool(n.read(RUNNER+0x15d,'B')[0]),mode=n.read(RUNNER+8,'B')[0],slopeImpulse=n.read(RUNNER+0x174,'f')[0],brake=n.read(RUNNER+0x16c,'f')[0],queries=list(queries),sounds=list(sounds)))
js="""
import {stepSuspension} from './src/suspension.js';let input='';for await(let s of process.stdin)input+=s;
function terrainHits(t,x,z){if(t.kind==='layers')return t.layers.flatMap(layer=>terrainHits({kind:'plane',...layer},x,z));let height=Math.fround(t.base+(t.kind==='plane'?t.sx*x+t.sz*z:x>=t.edge?t.height:0)),sx=t.sx??0,sz=t.sz??0,length=Math.sqrt(1+sx*sx+sz*sz);return [{height,normal:{x:Math.fround(-sx/length),y:Math.fround(1/length),z:Math.fround(-sz/length)}}]}
console.log(JSON.stringify(JSON.parse(input).map(f=>{let r={...f.r},queries=[],t=f.terrain;let query=(x,z)=>{let hits=terrainHits(t,x,z);queries.push({x,z,hits:hits.map(h=>({height:h.height,normal:Object.values(h.normal)}))});return hits};let result=stepSuspension(r,f.dt,query,{x:r.lateralSpeed,y:r.vy,z:-r.localSpeed});return {position:[r.x,r.y,r.z],pitch:r.chassisPitchDegrees,roll:r.chassisRollDegrees,frontVelocity:r.frontVelocity,sideVelocity:r.sideVelocity,worldVelocity:Object.values(result.world),localVelocity:Object.values(result.local),grounded:r.grounded,supportContact:r.supportContact,mode:r.actionMode,slopeImpulse:r.slopeImpulse,brake:r.supportBrake,queries,sounds:r.human?Array(result.landingCalls).fill(1):[]}})));

"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT));mismatches=[];maxerr=0
for i,(a,b) in enumerate(zip(native,rebuilt)):
 for key in a:
  if key in ['grounded','supportContact','mode','sounds']:
   if a[key]!=b[key]:mismatches.append(dict(fixture=i,field=key,native=a[key],rebuild=b[key]))
  elif key!='queries':
   av=a[key] if isinstance(a[key],list) else [a[key]];bv=b[key] if isinstance(b[key],list) else [b[key]];err=max(abs(x-y) for x,y in zip(av,bv));maxerr=max(maxerr,err)
   if err>3e-5:mismatches.append(dict(fixture=i,field=key,native=a[key],rebuild=b[key],error=err))
 if len(a['queries'])!=len(b['queries']):mismatches.append(dict(fixture=i,field='probe count',native=a['queries'],rebuild=b['queries']))
 elif a['queries']!=b['queries']:mismatches.append(dict(fixture=i,field='probes and layers',native=a['queries'],rebuild=b['queries']))
jump_fixtures=[];jump_native=[]
# The jump action uses the support-contact byte and the current action mode,
# adds its impulse to world Y, then transforms back to the local basis.
n.write(RUNNER+0xd100,'I',0)
for i,f in enumerate(fixtures):
 r=f['r'];contact=i%3!=1;jump_fixtures.append(dict(r=r,supportContact=contact));n.cpu.mem_write(RUNNER,b'\0'*0x10000)
 n.write(RUNNER+8,'BB',r['actionMode'],r['previousActionMode']);n.write(RUNNER+0x104,'fff',r['yaw']*180/math.pi,r['chassisPitchDegrees'],r['chassisRollDegrees']);n.write(RUNNER+0x15d,'B',int(contact));n.write(RUNNER+0x144,'ff',r['frontVelocity'],r['sideVelocity']);n.write(RUNNER+0x184,'fff',r['lateralSpeed'],r['vy'],-r['localSpeed']);n.write(RUNNER+0x190,'fff',r['lateralSpeed'],r['vy'],-r['localSpeed']);n.call(0x430f18,eax=RUNNER)
 jump_native.append(dict(mode=n.read(RUNNER+8,'B')[0],previous=n.read(RUNNER+9,'B')[0],front=n.read(RUNNER+0x144,'f')[0],side=n.read(RUNNER+0x148,'f')[0],world=list(n.read(RUNNER+0x184,'fff')),local=list(n.read(RUNNER+0x190,'fff'))))
jump_js="""
import {beginJump} from './src/suspension.js';let input='';for await(let s of process.stdin)input+=s;console.log(JSON.stringify(JSON.parse(input).map(f=>{let r={...f.r,supportContact:f.supportContact,speed:f.r.localSpeed,lateralSpeed:f.r.lateralSpeed,localVerticalSpeed:f.r.vy,worldVelocity:{x:f.r.lateralSpeed,y:f.r.vy,z:-f.r.localSpeed}};beginJump(r);return {mode:r.actionMode,previous:r.previousActionMode,front:r.frontVelocity,side:r.sideVelocity,world:Object.values(r.worldVelocity),local:[r.lateralSpeed,r.localVerticalSpeed,-r.speed]}})));
"""
jump_rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js','--input-type=module','-e',jump_js],input=json.dumps(jump_fixtures).encode(),cwd=ROOT))
for i,(a,b) in enumerate(zip(jump_native,jump_rebuilt)):
 for k in a:
  av=a[k] if isinstance(a[k],list) else [a[k]];bv=b[k] if isinstance(b[k],list) else [b[k]];err=max(abs(x-y) for x,y in zip(av,bv));maxerr=max(maxerr,err)
  if err>3e-5:mismatches.append(dict(jumpFixture=i,field=k,native=a[k],rebuild=b[k],error=err))
report=dict(jumpFixtures=jump_fixtures,jumpNative=jump_native,jumpRebuild=jump_rebuilt,rebuild=rebuilt,mismatches=mismatches,maxNumericError=maxerr,tolerance=3e-5,passed=not mismatches,scope='Real 430280 three-probe ground/suspension action, 430110 support selection, 4301ac vertical response, 430e40 normal selection, damping and matrix helpers, plus actual 430f18 jump eligibility/impulse/projection and human landing sound calls. Terrain intersections are supplied.',sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,fixtures=fixtures,native=native,limitations=['Ground intersection collection is supplied from analytic planes/steps; original facet eligibility, traversal, moving surfaces, special ground contacts and complete scene collision are not executed.','Ground special-contact dispatch, name recognition, visibility, audio playback and view-point helpers are stubs; landing sound call IDs are captured and human recognition is supplied.','Standalone support and real 430f18 jump-action inputs; full planar physical integration, input/release-latch acquisition, repeated jump trajectories and scene callback order remain outside this audit.'])
(ROOT/'private/verification/suspension-native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(fixtures=len(fixtures),jumpFixtures=len(jump_fixtures),maxNumericError=maxerr,mismatches=len(mismatches),firstMismatches=mismatches[:8],passed=not mismatches),indent=2))

if mismatches:raise SystemExit(1)
