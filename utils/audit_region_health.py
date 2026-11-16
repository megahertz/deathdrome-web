"""Run original 43360c region-health checks and 41626c message construction.

Profile mapping, health access/set, timer branches and message record execute.
Destruction effects, HUD/audio delivery and string formatting use host hooks.
"""
import hashlib,json,struct,subprocess
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX,UC_X86_REG_ESP
from native_ai_audit import Native,ROOT,EXE,RUNNER,f32

class RegionHealthNative(Native):
 def __init__(self,f):
  super().__init__();self.events=[];self.calls=0;self.model=f['model'];self.profile=0 if f['human'] else 1
  for i in range(8):self.write(0x48d8d8+i*80,'I',2);self.write(0x48d8e0+i*80,'I',0xffffffff)
  self.write(0x48d8d8,'I',0);self.write(0x48d8e0,'I',f['player'])
  if not f['human']:self.write(0x48d8d8+80,'I',1);self.write(0x48d8e0+80,'I',f['model'])
  self.write(0x48d8d0+self.profile*80,'f',f['health']);self.write(0x48d8e5+self.profile*80,'B',int(f['shielded']))
  self.cpu.mem_write(0x48d8e8+self.profile*80,('RUNNER_'+str(f['model'])).encode()+b'\0')
  self.write(RUNNER,'2I',f['model'],self.profile);self.write(RUNNER+0x15e,'B',1);self.write(RUNNER+0xdc,'f',f['deadline']);self.write(0x4b5d50,'B',0)
  self.cpu.mem_write(0x411ee8,b'\x31\xc0\xc3');self.cpu.mem_write(0x4162fc,b'\xc3')
  self.cpu.mem_write(0x4336cc,b'\xc6\x80\x5e\x01\x00\x00\x00\xc3')
  for address in [0x443f20,0x414ea4,0x414348]:self.cpu.mem_write(address,b'\xc3')
  self.cpu.mem_write(0x4175b8,b'\x31\xc0\xc3')
  self.cpu.hook_add(UC_HOOK_CODE,self.format,begin=0x443f20,end=0x443f20)
  self.cpu.hook_add(UC_HOOK_CODE,self.message,begin=0x414348,end=0x414348)
  self.cpu.hook_add(UC_HOOK_CODE,lambda c,a,s,d:self.events.append(dict(type='destroyed',runner=self.model)),begin=0x4336cc,end=0x4336cc)
 def string(self,address):return bytes(self.cpu.mem_read(address,120)).split(b'\0')[0].decode('ascii')
 def format(self,c,a,s,d):
  dest,fmt,name=self.read(c.reg_read(UC_X86_REG_ESP)+4,'3I');assert self.string(fmt)=='Return to Domain %s'
  self.cpu.mem_write(dest,(self.string(fmt)%self.string(name)).encode()+b'\0')
 def message(self,c,a,s,d):
  record=c.reg_read(UC_X86_REG_EAX);assert self.read(record,'I')[0]==4 and self.read(record+8,'I')[0]==1
  self.events.append(dict(type='returnToDomain',runner=self.model,text=self.string(record+0x14)))
 def step(self,f):
  self.events=[];self.write(0x518aa4,'f',f['clock'])
  if self.read(RUNNER+0x15e,'B')[0]:self.write(RUNNER+0xd8,'I',f['mask']);self.call(0x43360c,eax=RUNNER);self.calls+=1
  return dict(deadline=self.read(RUNNER+0xdc,'f')[0],health=self.read(0x48d8d0+self.profile*80,'f')[0],active=bool(self.read(RUNNER+0x15e,'B')[0]),events=list(self.events))

fixtures=[];native=[];native_calls=0
for player in range(8):
 for human in [False,True]:
  for deadline in [0,7.5,8]:
   for health in [0,f32(.9),100]:
    for shielded in [False,True]:
     for returnEarly in [False,True]:
      model=player if human else (player+1)%8
      steps=[dict(clock=f32(c),mask=m) for c,m in [(7,0),(7.5,0),(8,1 if returnEarly else 0),(8.000001,0),(8.25,0),(9.000001,0),(9.000002,0),(10,0),(11,0x80000000)]]
      f=dict(player=player,model=model,human=human,deadline=deadline,health=health,shielded=shielded,returnEarly=returnEarly,steps=steps);fixtures.append(f)
      n=RegionHealthNative(f);native.append([n.step(step) for step in steps]);native_calls+=n.calls
js=r"""
import {Simulation} from './src/simulation.ts';let input='';for await(const c of process.stdin)input+=c;
console.log(JSON.stringify(JSON.parse(input).map(f=>{const sim=new Simulation({player:f.player,maximumRunners:8,ground:()=>0}),r=sim.runners[f.model];sim.countdown=0;Object.assign(r,{health:f.health,shield:f.shielded?10:0,outsideRegionUntil:f.deadline,profileName:'RUNNER_'+f.model});return f.steps.map(step=>{sim.elapsed=step.clock-7;sim.events=[];if(!r.dead&&!r.inactive){r.zoneMask=step.mask;sim.checkRunnerHealth(r)}return {deadline:r.outsideRegionUntil,health:r.health,active:!r.dead&&!r.inactive,events:sim.events.filter(e=>e.type==='returnToDomain'||e.type==='destroyed').map(e=>({type:e.type,runner:e.runner,...(e.text?{text:e.text}:{})}))}})})));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],cwd=ROOT,input=json.dumps(fixtures).encode()))
mismatches=[dict(fixture=i,step=j,native=a,rebuild=b) for i,(aa,bb) in enumerate(zip(native,rebuilt)) for j,(a,b) in enumerate(zip(aa,bb)) if a!=b]
report=dict(scope=__doc__,sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),sequences=len(fixtures),observations=sum(len(f['steps']) for f in fixtures),nativeHealthCalls=native_calls,fixtures=fixtures,native=native,mismatchCount=len(mismatches),mismatches=mismatches[:10],passed=not mismatches,limitations=['Region masks and frame clocks are supplied; original region grid/lookup has separate coverage. Single-player profile mapping is installed explicitly.','Destruction is observed through an active-flag stub. Original profile health setter/getter, human-model lookup, timer logic and message record run.','Formatting of the original %s string uses a host hook; message queue/drawing, shade selection, audio and destruction effects are not compared.','Complete scene timing, physics and entrance/respawn/exit lifecycle remain unverified.'])
(ROOT/'private/verification/region-health-native.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['sequences','observations','nativeHealthCalls','mismatchCount','mismatches','passed']},indent=2))
if mismatches:raise SystemExit(1)
