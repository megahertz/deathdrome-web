#!/usr/bin/env python3
"""Compare active actor updates, deactivation/frozen slots and setup reset."""
import hashlib,json,struct,subprocess
from unicorn import __version__,UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX,UC_X86_REG_EDX
from native_ai_audit import Native,ROOT,EXE,RUNNER,f32
fixtures=[];native=[]
for mask in [0,1,2,0x555,0xaaa,0xfff]:
 for dt in [f32(1/30),f32(1/60),f32(1/120)]:
  fixtures.append(dict(slots=[dict(slot=i,kind='Missile' if i%2 else 'Laser',age=f32(.2)) for i in range(12) if mask&(1<<i)],dt=dt))
for fixture in fixtures:
 n=Native();node=RUNNER+0x9000;visible={};n.write(node+0x4c,'I',RUNNER);n.write(RUNNER,'I',1);n.write(RUNNER+8,'B',3);n.write(RUNNER+0x15e,'B',1);n.write(RUNNER+0x6e0,'I',12);n.write(RUNNER+0x494,'I',len(fixture['slots']));n.write(RUNNER+0x498,'I',4);n.write(0x518aa8,'f',fixture['dt']);n.write(0x49064c,'f',fixture['dt']);n.write(0x48f160,'B',0);n.write(0x48f1b4,'B',0);n.write(0x518ec0,'I',1);n.write(0x518ed0,'I',4)
 for address in [0x44b628,0x44b4f0,0x468928,0x41837c,0x440674,0x43360c]:n.cpu.mem_write(address,b'\xc3')
 n.cpu.mem_write(0x418f94,b'\x31\xc0\xc3')
 for address in [0x45a6bc,0x45a5fc,0x468a0c]:n.cpu.mem_write(address,b'\xc2\x0c\x00')
 for address in [0x418720,0x418728]:n.cpu.mem_write(address,b'\xd9\xee\xc3')
 n.cpu.mem_write(0x435d68,b'\x31\xc0\xc2\x04\x00')
 for address in [0x4357bc,0x435788,0x4357f0]:n.cpu.mem_write(address,b'\x31\xc0\xc3')
 for i in range(12):
  n.write(RUNNER+0x4fc+i*4,'I',0x600000+i*0x100);n.write(RUNNER+0x52c+i*4,'I',0x610000+i*0x100)
 for p in fixture['slots']:
  i=p['slot'];visible[0x600000+i*0x100]=1;visible[0x610000+i*0x100]=1;n.write(RUNNER+0x4bc+i,'B',1);n.write(RUNNER+0x6ac+i*4,'I',1 if p['kind']=='Missile' else 4);n.write(RUNNER+0x4cc+i*4,'f',p['age']);n.write(RUNNER+0x58c+i*12,'fff',100,10,100);n.write(RUNNER+0x61c+i*12,'fff',-90,0,-120)
 # A null target isolates lifecycle from missile steering.
 n.write(RUNNER+0x6f8,'I',0)
 def visibility(cpu,address,size,data):visible[cpu.reg_read(UC_X86_REG_EAX)]=cpu.reg_read(UC_X86_REG_EDX)
 n.cpu.hook_add(UC_HOOK_CODE,visibility,begin=0x44b4f0,end=0x44b4f0)
 def snapshot():
  return dict(count=n.read(RUNNER+0x494,'I')[0],slots=[dict(slot=i,position=list(n.read(RUNNER+0x58c+i*12,'fff')),age=n.read(RUNNER+0x4cc+i*4,'f')[0],visible=bool(visible.get(0x600000+i*0x100))) for i in range(12) if n.read(RUNNER+0x4bc+i,'B')[0]])
 n.call(0x42f2d0,eax=node);samples=[snapshot()]
 n.call(0x43781c,eax=RUNNER);samples.append(snapshot())
 for _ in range(10):n.call(0x42f2d0,eax=node);samples.append(snapshot())
 n.call(0x437434,eax=RUNNER);n.call(0x4356f4,eax=RUNNER);samples.append(snapshot());native.append(samples)
js="""
import {stepRunnerProjectiles,hideRunnerProjectiles,resetRunnerProjectiles} from './src/projectiles.ts';
import {resetInventory} from './src/inventory.ts';let s='';for await(let x of process.stdin)s+=x;
console.log(JSON.stringify(JSON.parse(s).map(({slots,dt})=>{let r={id:1,dead:0,weapon:null,weapons:[null]},sim={runners:[{},r],projectiles:slots.map(p=>({...p,owner:1,x:100,y:10,z:100,vx:-90,vy:0,vz:-120,life:(p.kind==='Missile'?4:1)-p.age,lifetime:p.kind==='Missile'?4:1}))};const snapshot=()=>({count:sim.projectiles.filter(p=>p.life>0).length,slots:sim.projectiles.filter(p=>p.life>0).sort((a,b)=>a.slot-b.slot).map(p=>({slot:p.slot,position:[p.x,p.y,p.z],age:p.age,visible:!p.hidden}))});stepRunnerProjectiles(sim,r,dt);let samples=[snapshot()];r.dead=2.5;hideRunnerProjectiles(sim,r);samples.push(snapshot());for(let i=0;i<10;i++){stepRunnerProjectiles(sim,r,dt);samples.push(snapshot())}resetInventory(r);resetRunnerProjectiles(sim,r);samples.push(snapshot());return samples})));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT));mismatches=[dict(fixture=i,native=a,rebuild=b) for i,(a,b) in enumerate(zip(native,rebuilt)) if a!=b]
report=dict(scope='Actual 42f2d0 actor callback executes live initialized primary flight once, then actual 43781c hides/disables the runner, ten actor callbacks skip weapon updates, and actual 437434/4356f4 setup resets the active pool.',sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,fixtures=fixtures,native=native,rebuild=rebuilt,samples=sum(len(x) for x in native),actorUpdates=len(fixtures)*11,mismatches=mismatches,passed=not mismatches,limitations=['Synthetic scene actor in action mode 3 omits physics/input/controller actions. Owner death entry 4336cc -> 43495c -> 43781c is established from disassembly, not a complete native damage/scene traversal execution.','Target pointer is null: no steering. Collision, rendering, sound, HUD, other actor actions and model-node lookup for reset are stubs. Visibility arguments are captured.','Pool flags/count and active position/age/visibility are compared. Inactive node data and full native destruction/respawn scheduling are not compared.'])
(ROOT/'private/verification/projectile-lifecycle-native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(fixtures=len(fixtures),samples=report['samples'],mismatches=len(mismatches),passed=not mismatches),indent=2))
if mismatches:raise SystemExit(1)
