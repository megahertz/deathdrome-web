#!/usr/bin/env python3
"""Compare real original runner-loop ordering with production Simulation.step."""
import hashlib,json,struct,subprocess
from unicorn import __version__,UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX
from native_ai_audit import Native,ROOT,EXE,RUNNER,SCRATCH,f32
fixtures=[dict(player=player,mask=mask,pattern=pattern,dt=f32(dt)) for player in range(8) for mask in [255,85,170] for pattern in [0,1] for dt in [1/60,1/30]]
native=[]
for fixture in fixtures:
 n=Native();addresses=[RUNNER+i*0x1000 for i in range(8)];nodes=[RUNNER+0x9000+i*0x100 for i in range(8)];events=[]
 n.write(0x48f104,'8I',*nodes);n.write(0x48f158,'I',8);n.write(0x518aa4,'f',7);n.write(RUNNER+0xb000,'f',fixture['dt']);n.write(0x49064c,'f',fixture['dt']);n.write(0x490650,'I',1);n.write(0x48f1b4,'B',0);n.write(0x48f160,'B',0)
 n.cpu.mem_write(0x44ca3c,b'\xd9\x05'+struct.pack('<I',RUNNER+0xb000)+b'\xc3')
 # Supplied profile type: the chosen model is human, others are AI.
 n.cpu.mem_write(0x418f68,b'\x3d'+struct.pack('<I',fixture['player'])+b'\x0f\x95\xc0\x0f\xb6\xc0\xc3')
 n.cpu.mem_write(0x411ee8,b'\x31\xc0\xc3')
 # Supply zone masks; the real scheduler writes the queried destination.
 n.cpu.mem_write(0x444bd8,b'\x8b\x44\x24\x0c\xc7\x00\x01\x00\x00\x00\xc2\x0c\x00')
 # AI issues one fire command. Human runs the actual input action with a
 # supplied zeroed input record containing Fire. No real AI/device sampling.
 inputs=RUNNER+0xa000;n.write(inputs+0x20,'I',1)
 n.cpu.mem_write(0x438dd0,b'\x60\xba'+struct.pack('<I',inputs)+b'\xe8'+struct.pack('<i',0x438c10-(0x438dd0+11))+b'\x61\xc3')
 n.cpu.mem_write(0x42bb3c,b'\x60\xe8'+struct.pack('<i',0x43753c-(0x42bb3c+6))+b'\x61\xc3')
 for address in [0x42f0f0,0x42f200]:n.cpu.mem_write(address,b'\xc2\x08\x00')
 for address in [0x42f39c,0x43360c,0x44b4f0,0x419008,0x42ed54,0x4182f4,0x468928,0x4156d0]:n.cpu.mem_write(address,b'\xc3')
 for address in [0x45a54c,0x45a6bc,0x468a0c]:n.cpu.mem_write(address,b'\xc2\x0c\x00')
 n.cpu.mem_write(0x435d68,b'\x31\xc0\xc2\x04\x00')
 for i,(address,node) in enumerate(zip(addresses,nodes)):
  n.write(node+0x4c,'I',address);n.write(address,'II',i,i);n.write(address+8,'B',1);n.write(address+0xc,'I',node);n.write(address+0x15e,'B',int(bool(fixture['mask']&(1<<i))));n.write(address+0xd4,'B',int(i==fixture['player']));n.write(address+0x14d,'B',1);n.write(address+0xd8,'I',1);n.write(address+0x2c,'fff',100+i*30,0,100);n.write(address+0x104,'f',45);n.write(address+0x8c,'fff',f32(-2**-.5),0,f32(-2**-.5));n.write(address+0x80,'fff',f32(-2**-.5),0,f32(-2**-.5));n.write(address+0x498,'4I',4,1,5,6);n.write(address+0x4a8,'II',(i+fixture['pattern'])%2,4);n.write(address+0x6e0,'I',12);n.write(0x518ee8+i*20,'B',1)
 def capture(phase):
  def hook(cpu,address,size,data):
   actor=cpu.reg_read(UC_X86_REG_EAX);events.append(dict(phase=phase,runner=n.read(actor,'I')[0],count=n.read(actor+0x494,'I')[0],inventory=list(n.read(actor+0x498,'4I')),selected=n.read(actor+0x4a8,'I')[0],items=n.read(actor+0x4ac,'I')[0]))
  return hook
 for address,phase in [(0x43753c,'fire'),(0x42f39c,'physics'),(0x4371d0,'weapons'),(0x43360c,'after')]:n.cpu.hook_add(UC_HOOK_CODE,capture(phase),begin=address,end=address)
 n.call(0x42efac);native.append(events)
js="""
import {Simulation} from './src/simulation.js';import {inventoryCells} from './src/inventory.js';let s='';for await(let x of process.stdin)s+=x;
console.log(JSON.stringify(JSON.parse(s).map(f=>{let events=[],sim;const capture=(phase,r)=>events.push({phase,runner:r.id,count:sim.projectiles.filter(p=>p.owner===r.id&&(p.kind==='Laser'||p.kind==='Missile')&&p.life>0).length,inventory:[...inventoryCells(r)],selected:r.selectedWeapon,items:r.weapons.length});sim=new Simulation({player:f.player,maximumRunners:8,ground:()=>0,blocked:()=>false,wallContact(r){capture('physics',r);return null}});sim.countdown=0;sim.ai=()=>({fire:true});sim.projectileContact=()=>{};sim.runners.forEach(r=>{Object.assign(r,{dead:f.mask&(1<<r.id)?0:Infinity,inactive:!(f.mask&(1<<r.id)),x:100+r.id*30,y:0,z:100,yaw:Math.PI/4,speed:0,weapons:[null,'Missile','Ion Sword','NanoShield'],weaponCells:[4,1,5,6],selectedWeapon:(r.id+f.pattern)%2});sim.selectWeapon(r)});let fire=sim.fire.bind(sim),weapons=sim.stepRunnerWeapons.bind(sim);sim.fire=(r,m)=>{capture('fire',r);return fire(r,m)};sim.stepRunnerWeapons=(r,dt)=>{if(!r.dead&&!r.inactive&&!r.respawn){capture('weapons',r);weapons(r,dt);capture('after',r)}};sim.step(f.dt,{fire:true});return events})));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT));mismatches=[dict(fixture=i,native=a,rebuild=b) for i,(a,b) in enumerate(zip(native,rebuilt)) if a!=b]
report=dict(scope='Actual 42efac model-order motion loop, actual 42f2d0 actor gate/dispatch, actual human 438c10 Fire action, actual 43753c allocation, 4371d0 ordered weapons and live first laser/missile actions/consumption. Event order and inventory/pool state are compared with production Simulation.step.',sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,fixtures=fixtures,native=native,rebuild=rebuilt,events=sum(len(x) for x in native),mismatches=mismatches,passed=not mismatches,limitations=['Physics is an explicit no-op stub in native and stationary on supplied flat ground in the rebuild. This tests sequencing, not movement/collision arithmetic.','Human input acquisition is supplied; other human control operations are stubs. AI controller is a supplied Fire command, not the native AI decision routine.','Profile types and occupancy masks are supplied. Scene collisions, node transforms, audio/HUD and post-weapon health action are stubs.','One frame at 30/60 Hz; large-frame human split, float global clock, barrier/Ion/secondary action order and complete scene traversal remain unverified.'])
(ROOT/'private/verification/runner-schedule-native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(fixtures=len(fixtures),events=report['events'],mismatches=len(mismatches),passed=not mismatches),indent=2))
if mismatches:raise SystemExit(1)
