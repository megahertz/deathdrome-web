#!/usr/bin/env python3
"""Run the native model loop through a human exit, with stationary physics."""
import hashlib,json,struct,subprocess
from unicorn import __version__,UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX
from native_ai_audit import Native,ROOT,EXE,RUNNER,f32

fixtures=[dict(player=p,mask=m,missile=missile,dt=f32(dt)) for p in range(8) for m in [255,85,170] for missile in [False,True] for dt in [1/60,1/30]]
n=Native();rows=[RUNNER+i*0x1000 for i in range(8)];nodes=[RUNNER+0x8000+i*0x100 for i in range(8)];events=[];entered=[];native=[]
for address in [0x438dd0,0x42bb3c,0x42e128,0x42df0c,0x42cc4c,0x44b628,0x44b4f0,0x44b67c,0x45bddc,0x41837c,0x415ac8,0x415a50,0x4182f4,0x419008,0x42ed54,0x468928,0x4156d0,0x4162fc,0x433928,0x434b94,0x42b0e4,0x43b3cc,0x45bf10,0x45bea8]:n.cpu.mem_write(address,b'\xc3')
for address in [0x45a54c,0x45a5fc,0x45a6bc,0x468a0c,0x45bec0,0x45be08]:n.cpu.mem_write(address,b'\xc2\x0c\x00')
n.cpu.mem_write(0x411ee8,b'\x31\xc0\xc3');n.cpu.mem_write(0x468f17,b'\x31\xc0\xc3')
n.cpu.mem_write(0x434bbc,b'\xb8'+struct.pack('<I',RUNNER+0xa000)+b'\xc3');n.cpu.mem_write(0x459580,b'\xb8'+struct.pack('<I',RUNNER+0xb000)+b'\xc3');n.cpu.mem_write(0x433df4,b'\x31\xc0\xc3');n.cpu.mem_write(0x435d68,b'\x31\xc0\xc2\x04\x00')
n.cpu.mem_write(0x444bd8,b'\x8b\x44\x24\x0c\xc7\x00\x01\x00\x00\x00\xc2\x0c\x00')
n.cpu.mem_write(0x44ca3c,b'\xd9\x05'+struct.pack('<I',RUNNER+0xd000)+b'\xc3')
n.cpu.mem_write(0x43c160,b'\xd9\x05'+struct.pack('<I',RUNNER+0xd004)+b'\xc3')
# The supplied physical action invokes real exit eligibility only for the human.
# All other physical actions are stationary and still recorded by the hook.
code=b'\x60\x8b\x08\x3b\x0d'+struct.pack('<I',RUNNER+0xd008)+b'\x75\x10\xbb'+struct.pack('<I',RUNNER+0xc000)+b'\x6a\x00\x6a\x00\x6a\x00\xe8'
code+=struct.pack('<i',0x434e9c-(0x42f39c+len(code)+4))+b'\x61\xc3';n.cpu.mem_write(0x42f39c,code)
def capture(phase):
 def hook(cpu,address,size,data):
  r=cpu.reg_read(UC_X86_REG_EAX);events.append(dict(phase=phase,runner=n.read(r,'I')[0],active=bool(n.read(r+0x15e,'B')[0]),controls=bool(n.read(r+0x14d,'B')[0])))
 return hook
for address,phase in [(0x438dd0,'controller'),(0x42bb3c,'controller'),(0x42f39c,'physics'),(0x4371d0,'weapons'),(0x43360c,'health')]:n.cpu.hook_add(UC_HOOK_CODE,capture(phase),begin=address,end=address)
n.cpu.hook_add(UC_HOOK_CODE,lambda cpu,address,size,data:entered.append(True),begin=0x43b3cc,end=0x43b3cc)
for f in fixtures:
 n.cpu.mem_write(RUNNER,b'\0'*0x10000);events.clear();entered.clear();mask=f['mask']|(1<<f['player'])
 n.write(0x48f104,'8I',*nodes);n.write(0x48f158,'I',8);n.write(0x518aa4,'f',7);n.write(0x49064c,'f',f['dt']);n.write(0x490650,'I',1);n.write(0x48f1b4,'B',0);n.write(0x48f160,'B',0);n.write(0x48d8b8,'B',0);n.write(0x4b5d50,'B',0);n.write(0x48d89c,'I',0);n.write(0x48d8a8,'I',0)
 n.write(RUNNER+0xd000,'ffI',f['dt'],35,f['player']);n.write(RUNNER+0xc000,'I',1);n.write(RUNNER+0xc020,'I',RUNNER+0xa000)
 for i,(r,node) in enumerate(zip(rows,nodes)):
  n.write(r,'II',i,i);n.write(r+8,'B',1);n.write(r+0xc,'I',node);n.write(r+0x20,'I',RUNNER+0xe000+i*0x100);n.write(node+0x4c,'I',r);n.write(r+0xd4,'B',int(i==f['player']));n.write(r+0x14d,'B',1);n.write(r+0x15e,'B',int(bool(mask&(1<<i))));n.write(r+0x15c,'B',1);n.write(r+0x1b5,'B',int(i==f['player']));n.write(r+0xd8,'I',1);n.write(r+0x2c,'fff',0 if i==f['player'] else 100+i*30,0,0 if i==f['player'] else 100);n.write(r+0x80,'fff',0,0,-1);n.write(r+0x8c,'fff',0,0,-1);n.write(r+0x498,'4I',4,1,0,0);n.write(r+0x4a8,'II',int(f['missile']),2 if f['missile'] else 1);n.write(r+0x6e0,'I',12);n.write(r+0x6e8,'ff',1,1)
  n.write(0x48d8d8+i*80,'I',0 if i==f['player'] else 1);n.write(0x48d8e0+i*80,'I',i);n.write(0x48d8d0+i*80,'f',100);n.write(0x48d8d4+i*80,'I',3);n.write(0x48d8c4+i*80,'I',2 if i==f['player'] else 0);n.write(0x48d8e5+i*80,'B',0)
  for slot in range(12):n.write(r+0x4fc+slot*4,'I',0x600000+i*0x1000+slot*0x20);n.write(r+0x52c+slot*4,'I',0x610000+i*0x1000+slot*0x20)
  if mask&(1<<i):n.call(0x43753c,eax=r)
 trace=[]
 for frame in range(3):
  events.clear();n.call(0x42efac)
  trace.append(dict(events=list(events),entered=bool(entered),active=[bool(n.read(r+0x15e,'B')[0]) for r in rows],controls=[bool(n.read(r+0x14d,'B')[0]) for r in rows],slots=[[dict(slot=s,age=n.read(r+0x4cc+s*4,'f')[0]) for s in range(12) if n.read(r+0x4bc+s,'B')[0]] for r in rows]))
 native.append(trace)
# Historical comparison supplies no-op physical integration; its JavaScript fixture also excludes the physical timer branch.
js="""
import {Simulation} from './src/simulation.ts';let s='';for await(let x of process.stdin)s+=x;
console.log(JSON.stringify(JSON.parse(s).map(f=>{let events=[],sim=new Simulation({player:f.player,maximumRunners:8,ground:()=>0,blocked:()=>false,wallContact(r){events.push({phase:'physics',runner:r.id,active:!r.dead&&!r.inactive,controls:r.controlsEnabled!==false});return null}});sim.stepRunnerControlDisable=()=>{};sim.countdown=0;sim.time=35+f.dt;sim.requiredKills=2;sim.population.nextInactive=()=>null;sim.projectileContact=()=>{};sim.ai=(r)=>{events.push({phase:'controller',runner:r.id,active:!r.dead&&!r.inactive,controls:r.controlsEnabled!==false});return {}};let mask=f.mask|(1<<f.player);for(let r of sim.runners){Object.assign(r,{dead:mask&(1<<r.id)?0:Infinity,inactive:!(mask&(1<<r.id)),x:r.id===f.player?0:100+r.id*30,y:0,z:r.id===f.player?0:100,yaw:0,speed:0,kills:r.id===f.player?2:0,weapons:f.missile?[null,'Missile']:[null],weaponCells:[4,1,0,0],selectedWeapon:f.missile?1:0});sim.selectWeapon(r);if(!r.dead)sim.fire(r,f.missile)}let weapons=sim.stepRunnerWeapons.bind(sim),health=sim.checkRunnerHealth.bind(sim);sim.stepRunnerWeapons=(r,dt,o)=>{events.push({phase:'weapons',runner:r.id,active:!r.dead&&!r.inactive,controls:r.controlsEnabled!==false});weapons(r,dt,o)};sim.checkRunnerHealth=(r,o)=>{events.push({phase:'health',runner:r.id,active:!r.dead&&!r.inactive,controls:r.controlsEnabled!==false});return health(r,o)};let trace=[];for(let frame=0;frame<3;frame++){events=[];if(!sim.runners[f.player].inactive)events.push({phase:'controller',runner:f.player,active:true,controls:true});sim.step(f.dt);if(frame===0){let human=events.shift(),index=events.findIndex(e=>e.runner>=f.player);events.splice(index<0?events.length:index,0,human)}trace.push({events,entered:!!sim.escape,active:sim.runners.map(r=>!r.dead&&!r.inactive),controls:sim.runners.map(r=>r.controlsEnabled!==false),slots:sim.runners.map(r=>sim.projectiles.filter(p=>p.owner===r.id&&p.life>0).sort((a,b)=>a.slot-b.slot).map(p=>({slot:p.slot,age:p.age})))})}return trace})));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT));mismatches=[dict(fixture=i,native=a,rebuild=b) for i,(a,b) in enumerate(zip(native,rebuilt)) if a!=b]
report=dict(scope='Real 42efac model loop through real 434e9c/42fed4 human exit, deactivation and following two motion loops; real primary updates and health checks. Supplied stationary physics, controller acquisition, exit intersection and no replacement.',sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,fixtures=fixtures,native=native,rebuild=rebuilt,events=sum(len(t['events']) for frames in native for t in frames),mismatches=mismatches,passed=not mismatches,limitations=['The global scene engine is not executed. Independent actions, round clock, geometry/collision traversal, exit pose ordering relative to the model loop, rendering/audio/HUD and full original rounds remain outside this audit.','Physical and AI controller calculations are explicit no-op stubs; only callback eligibility/order and primary ages are compared. Human input sampling is stubbed.','Three model loops at 30/60 Hz with supplied occupancy masks and primary pools; large-frame split, replacement during cinematic and other phase transitions are excluded.'])
(ROOT/'private/verification/exit-schedule-native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(fixtures=len(fixtures),events=report['events'],mismatches=len(mismatches),passed=not mismatches),indent=2))
if mismatches:raise SystemExit(1)
