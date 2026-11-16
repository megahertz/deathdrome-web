#!/usr/bin/env python3
"""Compare the complete physical callback on supplied collision-free terrain."""
import hashlib,json,math,struct,subprocess
from unicorn import __version__
from native_ai_audit import ROOT,EXE,RUNNER,f32
from native_ground_audit import GroundNative

tables=json.loads((ROOT/'private/assets/game-tables.json').read_text());fixtures=[]
variants=['accelerate','coast','coastFast','airborne','disabled','restore','boundary','startupGround','startupAir','nitro','nitroCoast','nitroExpiry','slope','positiveBounds','negativeBounds']
for model in range(8):
 for human in [True,False]:
  for variant in variants:
   for dt in [1/30,1/60]:
    terrain=dict(kind='plane',base=10 if variant=='slope' else 0,sx=.2 if variant=='slope' else 0,sz=-.1 if variant=='slope' else 0)
    r=dict(id=model,x=30,y=12 if variant=='slope' else 5 if variant=='airborne' else 10 if variant=='startupAir' else 0,z=40,yaw=(30+model*22.5)*math.pi/180,chassisPitchDegrees=8 if variant=='airborne' else 5 if variant=='slope' else 0,chassisRollDegrees=-5 if variant=='airborne' else -4 if variant=='slope' else 0,turn=30*math.pi/180,turnAcceleration=100*math.pi/180,acceleration=20,speed=45,lateralSpeed=4,localVerticalSpeed=-12 if variant=='airborne' else 0,frontVelocity=-12 if variant=='airborne' else 0,sideVelocity=-12 if variant=='airborne' else 0,grounded=variant!='airborne',supportContact=True,supportBrake=2,slopeImpulse=0,actionMode=1,previousActionMode=1,movementEnabled=not variant.startswith('startup'),controlsEnabled=variant not in ['disabled','restore','boundary'],disableTimer=2 if variant=='disabled' else f32(dt) if variant=='boundary' else 0,nitro=.4 if variant.startswith('nitro') else 0,aiMaxSpeed=tables['runners'][model]['maxSpeed']*.75)
    if variant in ['coast','coastFast','nitroCoast']:r.update(acceleration=0,turnAcceleration=0)
    if variant=='nitroExpiry':r['nitro']=f32(dt*.5)
    if variant=='coastFast':r['speed']=150
    if variant=='positiveBounds':r.update(x=899,z=899,yaw=225*math.pi/180)
    if variant=='negativeBounds':r.update(x=-899,z=-899,yaw=45*math.pi/180)
    if variant.startswith('startup'):r['acceleration']=-20
    fixtures.append(dict(human=human,variant=variant,terrain=terrain,dt=f32(dt),r=r))
n=GroundNative();native=[]
for address in [0x431280,0x41837c,0x43f1cc,0x436078]:n.cpu.mem_write(address,b'\xc3')
for address in [0x45a54c,0x45a6bc]:n.cpu.mem_write(address,b'\xc2\x0c\x00')
for address in [0x4185f0,0x418b28]:n.cpu.mem_write(address,b'\x31\xc0\xc3')
n.cpu.mem_write(0x418fd4,b'\xb8\xff\xff\xff\xff\xc3')
n.cpu.mem_write(0x418f68,b'\xa1'+struct.pack('<I',RUNNER+0xd104)+b'\xc3')
n.cpu.mem_write(0x44ca3c,b'\xd9\x05'+struct.pack('<I',RUNNER+0xd000)+b'\xc3')
for f in fixtures:
 r=f['r'];n.terrain=f['terrain'];n.cpu.mem_write(RUNNER,b'\0'*0x10000);n.queries.clear();n.sounds.clear()
 n.write(RUNNER+0xd000,'f',f['dt']);n.write(RUNNER+0xd100,'II',int(f['human']),0 if f['human'] else 1)
 for address,value in [(0x518aa8,f['dt']),(0x49064c,f['dt']),(0x48f130,.2),(0x48f134,2),(0x48f138,10),(0x48f13c,98),(0x48f174,.12),(0x48f178,30),(0x48f17c,15),(0x48f180,100),(0x48f184,800),(0x48f188,3),(0x48f18c,.75),(0x48f190,400),(0x48f194,350),(0x48f19c,100),(0x48f1a0,80)]:n.write(address,'f',value)
 n.write(0x490650,'I',1);n.write(RUNNER,'II',r['id'],0);n.write(RUNNER+8,'BB',r['actionMode'],r['previousActionMode']);n.write(RUNNER+0x2c,'fff',r['x'],r['y'],r['z']);n.write(RUNNER+0xe0,'ff',r['turnAcceleration']*180/math.pi,r['turn']*180/math.pi);n.write(RUNNER+0xfc,'ff',tables['runners'][r['id']]['maxTurnDegrees'],tables['runners'][r['id']]['maxSpeed']);n.write(RUNNER+0x104,'fff',r['yaw']*180/math.pi,r['chassisPitchDegrees'],r['chassisRollDegrees']);n.write(RUNNER+0x144,'ff',r['frontVelocity'],r['sideVelocity']);n.write(RUNNER+0x14c,'BB',int(r['grounded']),int(r['controlsEnabled']));n.write(RUNNER+0x154,'f',r['disableTimer']);n.write(RUNNER+0x15c,'BB',int(r['movementEnabled']),int(r['supportContact']));n.write(RUNNER+0x16c,'f',r['supportBrake']);n.write(RUNNER+0x174,'f',r['slopeImpulse']);n.write(RUNNER+0x180,'f',-r['acceleration']);n.write(RUNNER+0x190,'fff',r['lateralSpeed'],r['localVerticalSpeed'],-r['speed']);n.write(RUNNER+0x444,'f',r['aiMaxSpeed']);n.write(RUNNER+0x6e4,'f',r['nitro']);n.call(0x42f9cc,eax=RUNNER)
 trace=[]
 for frame in range(3):
  n.call(0x42f39c,eax=RUNNER)
  trace.append(dict(position=list(n.read(RUNNER+0x2c,'fff')),yaw=n.read(RUNNER+0x104,'f')[0],pitch=n.read(RUNNER+0x108,'f')[0],roll=n.read(RUNNER+0x10c,'f')[0],turn=n.read(RUNNER+0xe4,'f')[0],turnAcceleration=n.read(RUNNER+0xe0,'f')[0],acceleration=-n.read(RUNNER+0x180,'f')[0],localVelocity=list(n.read(RUNNER+0x190,'fff')),worldVelocity=list(n.read(RUNNER+0x184,'fff')),forward=list(n.read(RUNNER+0x8c,'fff')),planarForward=list(n.read(RUNNER+0x80,'fff')),frontVelocity=n.read(RUNNER+0x144,'f')[0],sideVelocity=n.read(RUNNER+0x148,'f')[0],grounded=bool(n.read(RUNNER+0x14c,'B')[0]),controlsEnabled=bool(n.read(RUNNER+0x14d,'B')[0]),disableTimer=n.read(RUNNER+0x154,'f')[0],movementEnabled=bool(n.read(RUNNER+0x15c,'B')[0]),supportContact=bool(n.read(RUNNER+0x15d,'B')[0]),brake=n.read(RUNNER+0x16c,'f')[0],slopeImpulse=n.read(RUNNER+0x174,'f')[0],nitro=n.read(RUNNER+0x6e4,'f')[0],cockpitRoll=n.read(RUNNER+0x140,'f')[0]))
 native.append(trace)
js="""
import {Simulation} from './src/simulation.ts';import {localToWorld} from './src/suspension.ts';import {heldAIRates} from './src/ai-obstacles.ts';let input='';for await(let s of process.stdin)input+=s;
console.log(JSON.stringify(JSON.parse(input).map(f=>{let t=f.terrain,s=new Simulation({player:f.human?f.r.id:(f.r.id+1)%8,maximumRunners:8,ground(x,z,y,support){let height=Math.fround(t.base+t.sx*x+t.sz*z),length=Math.sqrt(1+t.sx*t.sx+t.sz*t.sz);return support?[{height,normal:{x:Math.fround(-t.sx/length),y:Math.fround(1/length),z:Math.fround(-t.sz/length)}}]:height},blocked:()=>false,wallContact:()=>null});s.countdown=0;s.time=300;s.runners.forEach(r=>r.dead=Infinity);let r=s.runners[f.r.id];Object.assign(r,f.r,{dead:0,inactive:false});r.worldVelocity=localToWorld(r,{x:r.lateralSpeed,y:r.localVerticalSpeed,z:-r.speed});r.vy=r.worldVelocity.y;s.ai=r=>({driveRates:heldAIRates(r)});let trace=[];for(let i=0;i<3;i++){s.step(f.dt,{driveRates:heldAIRates(r)});trace.push({position:[r.x,r.y,r.z],yaw:r.yaw*180/Math.PI,pitch:r.chassisPitchDegrees,roll:r.chassisRollDegrees,turn:r.turn*180/Math.PI,turnAcceleration:r.turnAcceleration*180/Math.PI,acceleration:r.acceleration,localVelocity:[r.lateralSpeed,r.localVerticalSpeed,-r.speed],worldVelocity:Object.values(r.worldVelocity),forward:Object.values(r.forwardVector),planarForward:[r.planarForwardVector.x,0,r.planarForwardVector.z],frontVelocity:r.frontVelocity,sideVelocity:r.sideVelocity,grounded:r.grounded,controlsEnabled:r.controlsEnabled,disableTimer:r.disableTimer,movementEnabled:r.movementEnabled,supportContact:r.supportContact,brake:r.supportBrake,slopeImpulse:r.slopeImpulse,nitro:r.nitro,cockpitRoll:Math.max(-30,Math.min(30,Math.fround(Math.fround(r.turn*180/Math.PI)*Math.fround(.12))))})}return trace})));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT));mismatches=[];maxerr=0
for i,(a,b) in enumerate(zip(native,rebuilt)):
 for frame,(x,y) in enumerate(zip(a,b)):
  for key in x:
   if isinstance(x[key],bool):
    if x[key]!=y[key]:mismatches.append(dict(fixture=i,frame=frame,field=key,native=x[key],rebuild=y[key]))
   else:
    av=x[key] if isinstance(x[key],list) else [x[key]];bv=y[key] if isinstance(y[key],list) else [y[key]];err=max(abs(v-w) for v,w in zip(av,bv));maxerr=max(maxerr,err)
    if err>1e-10:mismatches.append(dict(fixture=i,frame=frame,field=key,native=x[key],rebuild=y[key],error=err))
report=dict(scope='Real 42f39c physical callback including native rate integration, basis/projection, position stores, actual ground action, disable-timer restoration and cockpit lean. Supplied held controller rates and collision-free terrain.',sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,fixtures=fixtures,native=native,rebuild=rebuilt,mismatches=mismatches,maxNumericError=maxerr,tolerance=1e-10,passed=not mismatches,limitations=['The scene sweep dispatcher 431280 is an explicit no-op for collision-free motion; actual wall/runner contacts, special terrain contacts and full original scene queries are not compared.','Terrain intersections, profile/human recognition and frame duration are supplied; render setters, audio playback, color restoration and the 436078 periodic selected-profile position check are stubs.','Held input/AI rates are supplied and no projectile pool or post-primary health action is executed. Full input acquisition, complete game actor/scene ordering and independent original frames/rounds remain unverified.'])
(ROOT/'private/verification/physical-action-native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(fixtures=len(fixtures),updates=len(fixtures)*3,maxNumericError=maxerr,mismatches=len(mismatches),firstMismatches=mismatches[:5],passed=not mismatches),indent=2))
if mismatches:raise SystemExit(1)
