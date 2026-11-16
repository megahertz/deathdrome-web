"""Run real 42f39c physical callback with 436078 enabled on analytic flat ground.

Held controller rates, terrain intersections and profile mapping are supplied.
No primary weapons or destruction callbacks run in this component audit.
"""
import hashlib,json,math,struct,subprocess
from audit_keep_moving import KeepMovingNative
from native_ground_audit import GroundNative
from native_ai_audit import ROOT,EXE,RUNNER,f32

class KeepMovingGround(KeepMovingNative,GroundNative):pass

def main():
 tables=json.loads((ROOT/'private/assets/game-tables.json').read_text());fixtures=[];native=[];n=KeepMovingGround()
 for address in [0x431280,0x41837c,0x43f1cc,0x440198]:n.cpu.mem_write(address,b'\xc3')
 for address in [0x45a54c,0x45a6bc]:n.cpu.mem_write(address,b'\xc2\x0c\x00')
 for address in [0x4185f0,0x418b28,0x45a8e6]:n.cpu.mem_write(address,b'\x31\xc0\xc3')
 n.cpu.mem_write(0x418f68,b'\xa1'+struct.pack('<I',RUNNER+0xd104)+b'\xc3');n.cpu.mem_write(0x44ca3c,b'\xd9\x05'+struct.pack('<I',RUNNER+0xd000)+b'\xc3')
 for model in range(8):
  for health in [100,f32(.1)]:
   for shielded in [False,True]:
    for controls in [False,True]:
     f=dict(model=model,profile=(model+3)%8,health=health,armor=tables['runners'][model]['armorFactor'],shielded=shielded,invulnerable=False,timer=f32(10-1/60),previous=[0,0,0],voice=model,variant='physical',controls=controls,dt=f32(1/60),yaw=f32(model*22.5));fixtures.append(f);n.reset(f)
     n.write(RUNNER+0xd000,'f',f['dt']);n.write(RUNNER+0xd100,'2I',1,0)
     for address,value in [(0x518aa8,f['dt']),(0x49064c,f['dt']),(0x48f130,.2),(0x48f134,2),(0x48f138,10),(0x48f13c,98),(0x48f174,.12),(0x48f178,30),(0x48f17c,15),(0x48f180,100),(0x48f184,800),(0x48f188,3),(0x48f18c,.75),(0x48f190,400),(0x48f194,350),(0x48f19c,100),(0x48f1a0,80)]:n.write(address,'f',value)
     n.write(0x490650,'I',1);n.write(0x48f23c,'I',1);n.write(RUNNER+8,'2B',1,1);n.write(RUNNER+0x2c,'3f',0,0,0);n.write(RUNNER+0xfc,'2f',tables['runners'][model]['maxTurnDegrees'],tables['runners'][model]['maxSpeed']);n.write(RUNNER+0x104,'3f',f['yaw'],0,0);n.write(RUNNER+0x14c,'2B',1,int(controls));n.write(RUNNER+0x154,'f',2);n.write(RUNNER+0x15c,'3B',1,1,1);n.write(RUNNER+0x16c,'f',2);n.write(RUNNER+0x450,'I',0xffffffff);n.call(0x42f9cc,eax=RUNNER)
     trace=[]
     for frame in range(3):
      n.events=[];n.call(0x42f39c,eax=RUNNER)
      trace.append(dict(position=list(n.read(RUNNER+0x2c,'3f')),localVelocity=list(n.read(RUNNER+0x190,'3f')),worldVelocity=list(n.read(RUNNER+0x184,'3f')),health=n.read(n.healthAt,'f')[0],timer=n.read(0x48f21c+model*4,'f')[0],baseline=list(n.read(0x48f1bc+model*12,'3f')),controlsEnabled=bool(n.read(RUNNER+0x14d,'B')[0]),disableTimer=n.read(RUNNER+0x154,'f')[0],keepMovingSounds=sum(e.get('id')==74 for e in n.events)))
     native.append(trace)
 js=r"""
import {Simulation} from './src/simulation.ts';import {localToWorld} from './src/suspension.ts';import {heldAIRates} from './src/ai-obstacles.ts';let input='';for await(const c of process.stdin)input+=c;
console.log(JSON.stringify(JSON.parse(input).map(f=>{const sim=new Simulation({player:f.model,maximumRunners:1,ground:()=>0}),r=sim.runners[f.model];sim.countdown=0;Object.assign(r,{x:0,y:0,z:0,yaw:f.yaw*Math.PI/180,speed:0,lateralSpeed:0,localVerticalSpeed:0,acceleration:0,turn:0,turnAcceleration:0,health:f.health,shield:f.shielded?10:0,controlsEnabled:f.controls,disableTimer:2,movementEnabled:true,actionMode:1,previousActionMode:1,chassisPitchDegrees:0,chassisRollDegrees:0,frontVelocity:0,sideVelocity:0,grounded:true,supportContact:true,supportBrake:2,slopeImpulse:0,collisionProbe:{x:0,y:0,z:0},rearProbe:{x:0,y:0,z:0}});r.worldVelocity=localToWorld(r,{x:0,y:0,z:0});r.vy=0;sim.keepMovingState.timers[f.model]=f.timer;sim.keepMovingState.positions[f.model]={x:0,y:0,z:0};sim.keepMovingState.impactVoice=f.voice;sim.stepRunnerWeapons=()=>{};sim.checkRunnerHealth=()=>{};return Array.from({length:3},()=>{sim.step(f.dt,{driveRates:heldAIRates(r)});return {position:[r.x,r.y,r.z],localVelocity:[r.lateralSpeed,r.localVerticalSpeed,-r.speed],worldVelocity:Object.values(r.worldVelocity),health:r.health,timer:sim.keepMovingState.timers[f.model],baseline:Object.values(sim.keepMovingState.positions[f.model]),controlsEnabled:r.controlsEnabled,disableTimer:r.disableTimer,keepMovingSounds:sim.events.filter(e=>e.type==='keepMoving').length}})})));
"""
 rebuild=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],cwd=ROOT,input=json.dumps(fixtures).encode()))
 mismatches=[];maxerror=0
 for i,(a,b) in enumerate(zip(native,rebuild)):
  for j,(x,y) in enumerate(zip(a,b)):
   for key in x:
    if isinstance(x[key],list):
     error=max(abs(u-v) for u,v in zip(x[key],y[key]));maxerror=max(maxerror,error)
     if error<=1e-10:continue
    if x[key]!=y[key]:mismatches.append(dict(fixture=i,frame=j,field=key,native=x[key],rebuild=y[key]))
 report=dict(scope=__doc__,sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),sequences=len(fixtures),updates=3*len(fixtures),fixtures=fixtures,native=native,mismatchCount=len(mismatches),mismatches=mismatches[:12],maximumNumericError=maxerror,tolerance=1e-10,passed=not mismatches,limits=['Collision sweeps are explicitly empty, terrain is supplied flat, render setters, shield visuals, disabled-control color RNG and palette delivery are stubs.','Original physical integration, support, control restoration and idle punishment execute together; primary weapons and final destruction do not execute.','This does not establish full moving-scene scheduling, original rendered frames or complete rounds.'])
 (ROOT/'private/verification/keep-moving-physics-native.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k]for k in ['sequences','updates','mismatchCount','mismatches','maximumNumericError','passed']},indent=2))
 if mismatches:raise SystemExit(1)
if __name__=='__main__':main()
