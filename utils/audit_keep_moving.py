"""Execute original 436078 timers/gates, 436028 voice rotation, health and kick.

Supplied profile mapping/poses/frame durations. Original warning/death message
records execute; formatting, delivery, effect creation and palette scheduling
are observed through host hooks, not original rendered or audible playback.
"""
import hashlib,json,struct,subprocess
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX,UC_X86_REG_EDX,UC_X86_REG_ESP
from native_ai_audit import Native,ROOT,EXE,RUNNER,f32

class KeepMovingNative(Native):
 def __init__(self):
  super().__init__();self.events=[]
  for address in [0x4182f4,0x42a7a8,0x440294,0x414ea4,0x414348,0x443f20]:self.cpu.mem_write(address,b'\xc3')
  self.cpu.mem_write(0x4175b8,b'\x31\xc0\xc3');self.cpu.mem_write(0x41a298,b'\xb8\x05\x00\x00\x00\xc3')
  for address in [0x4182f4,0x42a7a8,0x440294,0x414348,0x443f20]:self.cpu.hook_add(UC_HOOK_CODE,self.observe,begin=address,end=address)
 def string(self,address):return bytes(self.cpu.mem_read(address,160)).split(b'\0')[0].decode('ascii')
 def observe(self,c,a,s,d):
  eax=c.reg_read(UC_X86_REG_EAX);edx=c.reg_read(UC_X86_REG_EDX)
  if a==0x4182f4:self.events.append(dict(type='sound',id=eax))
  elif a==0x42a7a8:self.events.append(dict(type='impact',point=list(self.read(eax,'3f')),enabled=edx))
  elif a==0x440294:self.events.append(dict(type='paletteFlash',frames=eax))
  elif a==0x443f20:
   dest,fmt=self.read(c.reg_read(UC_X86_REG_ESP)+4,'2I');text=self.string(fmt)
   if '%s' in text:text=text%self.string(self.read(c.reg_read(UC_X86_REG_ESP)+12,'I')[0])
   self.cpu.mem_write(dest,text.encode()+b'\0')
  elif a==0x414348:
   assert self.read(eax,'I')[0]==4
   self.events.append(dict(type='message',text=self.string(eax+0x14)))
 def reset(self,f):
  self.model=f['model'];self.profile=f['profile'];self.healthAt=0x48d8d0+self.profile*80
  self.cpu.mem_write(RUNNER,b'\0'*0x10000)
  for i in range(8):
   self.write(0x48d8d8+i*80,'I',2);self.write(0x48d8e0+i*80,'I',0xffffffff)
   self.write(0x48f21c+i*4,'f',0);self.write(0x48f1bc+i*12,'3f',0,0,0)
  self.write(0x48d8d8+self.profile*80,'I',0);self.write(0x48d8e0+self.profile*80,'I',self.model)
  self.cpu.mem_write(0x48d8e8+self.profile*80,b'PRISONER\0')
  self.write(self.healthAt,'f',f['health']);self.write(0x48d8e5+self.profile*80,'B',int(f['shielded']));self.write(0x48d8b8,'B',int(f['invulnerable']))
  self.write(RUNNER,'2I',self.model,(self.profile+1)%8 if f['variant']=='unselected' else self.profile)
  self.write(RUNNER+0x6e8,'f',f['armor']);self.write(RUNNER+0x450,'I',0xffffffff);self.write(RUNNER+0x4b0,'I',99)
  self.write(0x48f104+self.model*4,'I',RUNNER+0x8000);self.write(RUNNER+0x804c,'I',RUNNER)
  self.write(0x48f21c+self.model*4,'f',f['timer']);self.write(0x48f1bc+self.model*12,'3f',*f['previous']);self.write(0x48f1b8,'I',f['voice'])
  self.write(0x48bf64,'I',int(f['variant']=='multiplayer'));self.write(0x4b5d50,'B',0)
 def step(self,step):
  self.events=[];self.write(0x518aa8,'f',step['dt']);self.write(0x48f23c,'I',int(step['enabled']))
  self.write(RUNNER+0x15e,'B',int(step['active']));self.write(RUNNER+0x15c,'B',int(step['movement']))
  self.write(RUNNER+0x2c,'3f',*step['position']);self.write(RUNNER+0xb0,'3f',*step['probe']);self.write(RUNNER+0x104,'f',step['yaw'])
  self.write(RUNNER+0x190,'3f',*step['velocity']);self.call(0x436078,eax=RUNNER)
  return dict(timer=self.read(0x48f21c+self.model*4,'f')[0],previous=list(self.read(0x48f1bc+self.model*12,'3f')),health=self.read(self.healthAt,'f')[0],voice=self.read(0x48f1b8,'I')[0],velocity=list(self.read(RUNNER+0x190,'3f')),killer=self.read(RUNNER+0x450,'I')[0],weapon=self.read(RUNNER+0x4b0,'I')[0],events=list(self.events))

def main():
 tables=json.loads((ROOT/'private/assets/game-tables.json').read_text());fixtures=[];native=[];n=KeepMovingNative()
 variants=['cold','near','boundary','beyond','vertical','shifted','accumulate','overflow','voiceWrap','unselected','disabled','movement','inactive','multiplayer','zeroHealth','invulnerable','gatedResume','yawFraction']
 for model in range(8):
  for health in [100,.1]:
   for shielded in [False,True]:
    for variant in variants:
     position=[0,0,0];previous=[0,0,0]
     if variant=='cold':position=[100,0,100]
     if variant=='near':position=[1,2,2]
     if variant in ['boundary','vertical']:position=[3,1000 if variant=='vertical' else 0,0]
     if variant=='beyond':position=[f32(3+2**-22),0,0]
     if variant=='shifted':position=[f32(110.3),f32(-3.4),-28];previous=[f32(108.3),5,-29]
     f=dict(model=model,profile=(model+3)%8,health=0 if variant=='zeroHealth' else f32(health),armor=tables['runners'][model]['armorFactor'],shielded=shielded,invulnerable=variant=='invulnerable',timer=f32(0 if variant=='accumulate' else 10.25 if variant=='overflow' else 9.5),previous=previous,voice=7 if variant=='voiceWrap' else model,variant=variant,steps=[])
     for j,dt in enumerate([.25,.25,10,10,10]):
      step=dict(dt=f32(dt),position=position,probe=[f32(position[0]+1),f32(position[1]+2),f32(position[2]+3)],yaw=f32(model*22.5+(.123456 if variant=='yawFraction' else 0)),velocity=[f32(5.3),f32(-2.4),f32(-30.2)],enabled=variant!='disabled',movement=variant!='movement',active=variant!='inactive')
      if variant=='gatedResume':step['enabled']=j!=0;step['movement']=j!=1;step['active']=j!=2
      f['steps'].append(step)
     fixtures.append(f);n.reset(f);native.append([n.step(step) for step in f['steps']])
 js=r"""
import {Simulation} from './src/simulation.js';import {stepKeepMoving} from './src/keep-moving.js';let input='';for await(const c of process.stdin)input+=c;
console.log(JSON.stringify(JSON.parse(input).map(f=>{const sim=new Simulation({player:f.variant==='unselected'?(f.model+1)%8:f.model,maximumRunners:8}),r=sim.runners[f.model];Object.assign(sim,{multiplayer:f.variant==='multiplayer',invulnerableHuman:f.invulnerable});Object.assign(r,{health:f.health,shield:f.shielded?10:0,lastHitWeaponCode:99,killedByRunner:0xffffffff,profileName:'PRISONER'});sim.keepMovingState.timers[f.model]=f.timer;sim.keepMovingState.positions[f.model]={x:f.previous[0],y:f.previous[1],z:f.previous[2]};sim.keepMovingState.impactVoice=f.voice;return f.steps.map(step=>{sim.events=[];Object.assign(sim,{keepMovingEnabled:step.enabled});Object.assign(r,{x:step.position[0],y:step.position[1],z:step.position[2],collisionProbe:{x:step.probe[0],y:step.probe[1],z:step.probe[2]},yaw:step.yaw*Math.PI/180,lateralSpeed:step.velocity[0],localVerticalSpeed:step.velocity[1],speed:-step.velocity[2],dead:step.active?0:Infinity,inactive:false,movementEnabled:step.movement});stepKeepMoving(sim,r,step.dt);const events=sim.events.flatMap(e=>e.type==='keepMoving'?[{type:'sound',id:74},{type:'message',text:e.text},{type:'sound',id:e.soundId},{type:'impact',point:[e.point.x,e.point.y,e.point.z],enabled:1}]:e.type==='selfKill'?[{type:'message',text:e.text}]:e.type==='paletteFlash'?[{type:e.type,frames:e.frames}]:[]);return {timer:sim.keepMovingState.timers[f.model],previous:Object.values(sim.keepMovingState.positions[f.model]),health:r.health,voice:sim.keepMovingState.impactVoice,velocity:[r.lateralSpeed,r.localVerticalSpeed,-r.speed],killer:r.killedByRunner===0xffffffff?0xffffffff:f.profile,weapon:r.lastHitWeaponCode,events}})})));
"""
 rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js','--input-type=module','-e',js],cwd=ROOT,input=json.dumps(fixtures).encode()))
 mismatches=[];maxerror=0
 for i,(a,b) in enumerate(zip(native,rebuilt)):
  for j,(x,y) in enumerate(zip(a,b)):
   for k in x:
    if k=='velocity':
     error=max(abs(u-v) for u,v in zip(x[k],y[k]));maxerror=max(error,maxerror)
     if error<=1e-5:continue
    if x[k]!=y[k]:mismatches.append(dict(fixture=i,step=j,field=k,native=x[k],rebuild=y[k]))
 report=dict(scope=__doc__,sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),sequences=len(fixtures),observations=sum(len(f['steps']) for f in fixtures),fixtures=fixtures,native=native,mismatchCount=len(mismatches),mismatches=mismatches[:12],maximumKickError=maxerror,kickTolerance=1e-5,passed=not mismatches,limitations=['Finite supplied stored positions, yaw angles, durations, profile mapping, shield and movement/active flags; no full native controller/physical callback or moving-scene scheduling.','Original timer/gate/history, impact voice rotation, health setter/getter, kick scale/rotation and lethal weapon assignment execute. Warning/death message construction executes with host string formatting.','Audio playback, effect geometry, palette action scheduling and rendered frames are not compared here. Original model state is retained after lethal health until a separately verified destruction gate.','Arrays and impact voice index have process lifetime; other impact callers also rotate this pool, and complete shared-call ordering remains open.'])
 (ROOT/'private/verification/keep-moving-native.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps({k:report[k] for k in ['sequences','observations','mismatchCount','mismatches','maximumKickError','kickTolerance','passed']},indent=2))
 if mismatches:raise SystemExit(1)
if __name__=='__main__':main()
