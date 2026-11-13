#!/usr/bin/env python3
"""Compare exit entry, health protection and the final primary actor pass."""
import hashlib,json,struct,subprocess
from unicorn import __version__,UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX,UC_X86_REG_EDX
from native_ai_audit import Native,ROOT,EXE,RUNNER,f32
variants=['none','pendingLaser','pendingMissile','initializedLaser','initializedMissile','expiringLaser']
fixtures=[dict(human=human,health=f32(health),variant=variant,time=f32(36 if gate=='late' else 35),kills=1 if gate=='quota' else 2,dt=f32(1/60)) for human in [True,False] for health in [0,.5,.8999,.9,.95,.99999,1,100] for variant in variants for gate in ['eligible','late','quota']]
n=Native();rows=[RUNNER,RUNNER+0x1000];nodes=[RUNNER+0x8000,RUNNER+0x8100];hits=RUNNER+0xc000;time=RUNNER+0xd000;visible={};sounds=[];entered=[];deaths=[]
n.cpu.mem_write(0x411ee8,b'\x31\xc0\xc3')
n.cpu.mem_write(0x43c160,b'\xd9\x05'+struct.pack('<I',time)+b'\xc3')
n.cpu.mem_write(0x468f17,b'\x31\xc0\xc3') # supplied exitspot intersection/name
for address in [0x42e128,0x42df0c,0x42cc4c,0x44b628,0x44b4f0,0x44b67c,0x45bddc,0x41837c,0x415ac8,0x415a50,0x4182f4,0x419008,0x42ed54,0x468928,0x4156d0,0x4162fc,0x433928,0x434b94,0x42b0e4,0x43b3cc,0x45bf10,0x45bea8]:n.cpu.mem_write(address,b'\xc3')
for address in [0x45a54c,0x45a6bc,0x468a0c,0x45bec0,0x45be08]:n.cpu.mem_write(address,b'\xc2\x0c\x00')
n.cpu.mem_write(0x434bbc,b'\xb8'+struct.pack('<I',RUNNER+0xa000)+b'\xc3');n.cpu.mem_write(0x459580,b'\xb8'+struct.pack('<I',RUNNER+0xb000)+b'\xc3');n.cpu.mem_write(0x433df4,b'\x31\xc0\xc3');n.cpu.mem_write(0x435d68,b'\x31\xc0\xc2\x04\x00')
# Controlled physical action: call real eligibility/entry, preserving the
# actor caller's registers. Movement/collision arithmetic is not compared.
code=b'\x60\xbb'+struct.pack('<I',hits)+b'\x6a\x00\x6a\x00\x6a\x00\xe8'
code+=struct.pack('<i',0x434e9c-(0x42f39c+len(code)+4))+b'\x61\xc3';n.cpu.mem_write(0x42f39c,code)
def visibility(cpu,address,size,data):visible[cpu.reg_read(UC_X86_REG_EAX)]=bool(cpu.reg_read(UC_X86_REG_EDX))
n.cpu.hook_add(UC_HOOK_CODE,visibility,begin=0x44b4f0,end=0x44b4f0)
n.cpu.hook_add(UC_HOOK_CODE,lambda cpu,address,size,data:sounds.append(cpu.reg_read(UC_X86_REG_EAX)),begin=0x4182f4,end=0x4182f4)
n.cpu.hook_add(UC_HOOK_CODE,lambda cpu,address,size,data:entered.append(True),begin=0x43b3cc,end=0x43b3cc)
n.cpu.hook_add(UC_HOOK_CODE,lambda cpu,address,size,data:deaths.append(True),begin=0x4336cc,end=0x4336cc)
native=[]
for f in fixtures:
 n.cpu.mem_write(RUNNER,b'\0'*0x10000);visible.clear();sounds.clear();entered.clear();deaths.clear();subject=0 if f['human'] else 1;r=rows[subject]
 n.write(0x48f104,'2I',*nodes);n.write(0x48f158,'I',2);n.write(0x518aa8,'f',f['dt']);n.write(0x49064c,'f',f['dt']);n.write(0x490650,'I',1);n.write(0x48f1b4,'B',0);n.write(0x48f160,'B',0);n.write(0x48d8b8,'B',0);n.write(0x4b5d50,'B',0);n.write(0x48d89c,'I',0);n.write(0x48d8a8,'I',0);n.write(time,'f',f['time']);n.write(hits,'I',1);n.write(hits+0x20,'I',RUNNER+0xa000)
 for i in range(8):n.write(0x48d8d8+i*80,'I',2);n.write(0x48d8e0+i*80,'I',0xffffffff)
 for i,(address,node) in enumerate(zip(rows,nodes)):
  n.write(address,'II',i,i);n.write(address+8,'B',1);n.write(address+0xc,'I',node);n.write(address+0x20,'I',RUNNER+0xe000+i*0x100);n.write(node+0x4c,'I',address);n.write(address+0x14d,'B',1);n.write(address+0x15e,'B',1);n.write(address+0x15c,'B',1);n.write(address+0x1b5,'B',int(i==0));n.write(address+0xd8,'I',1);n.write(address+0x2c,'fff',0 if i==subject else 200,0,0 if i==subject else 200);n.write(address+0x8c,'fff',0,0,-1);n.write(address+0x80,'fff',0,0,-1);n.write(address+0x498,'4I',4,0,0,0);n.write(address+0x4a8,'II',0,1);n.write(address+0x6e0,'I',12);n.write(address+0x6e8,'ff',1,1);n.write(0x48d8d8+i*80,'I',i);n.write(0x48d8e0+i*80,'I',i);n.write(0x48d8d0+i*80,'f',100);n.write(0x48d8d4+i*80,'I',3);n.write(0x48d8c4+i*80,'I',f['kills'] if i==subject else 0);n.write(0x48d8e5+i*80,'B',0)
  for slot in range(12):n.write(address+0x4fc+slot*4,'I',0x600000+i*0x1000+slot*0x20);n.write(address+0x52c+slot*4,'I',0x610000+i*0x1000+slot*0x20)
 if f['variant']!='none':
  missile='Missile' in f['variant']
  if missile:n.write(r+0x49c,'I',1);n.write(r+0x4a8,'II',1,2)
  n.call(0x43753c,eax=r)
  if f['variant'].startswith('initialized') or f['variant']=='expiringLaser':n.call(0x4371d0,eax=r)
  if f['variant']=='expiringLaser':
   for slot in range(2):n.write(r+0x4cc+slot*4,'f',.999)
 n.write(0x48d8d0+subject*80,'f',f['health']);sounds.clear()
 def snapshot():
  selected,count=n.read(r+0x4a8,'II');return dict(health=n.read(0x48d8d0+subject*80,'f')[0],active=[bool(n.read(a+0x15e,'B')[0]) for a in rows],controls=[bool(n.read(a+0x14d,'B')[0]) for a in rows],mode=n.read(r+8,'B')[0],cells=list(n.read(r+0x498,'4I')),items=count,selected=selected,count=n.read(r+0x494,'I')[0],slots=[dict(slot=i,kind=n.read(r+0x6ac+i*4,'I')[0],age=n.read(r+0x4cc+i*4,'f')[0],visible=visible.get((0x600000 if n.read(r+0x6ac+i*4,'I')[0]==1 else 0x610000)+subject*0x1000+i*0x20,False)) for i in range(12) if n.read(r+0x4bc+i,'B')[0]],sounds=list(sounds),entered=bool(entered),deaths=len(deaths))
 before=snapshot();n.call(0x42f2d0,eax=nodes[subject]);native.append(dict(before=before,after=snapshot()))
# Historical comparison supplies no-op physical integration; its JavaScript fixture also excludes the physical timer branch.
js="""
import {Simulation} from './src/simulation.js';import {inventoryCells} from './src/inventory.js';let s='';for await(let x of process.stdin)s+=x;
console.log(JSON.stringify(JSON.parse(s).map(f=>{let sim=new Simulation({ground:()=>0,blocked:()=>false,wallContact:()=>null}),subject=f.human?0:1,r=sim.runners[subject];sim.stepRunnerControlDisable=()=>{};sim.countdown=0;sim.ai=()=>({});sim.projectileContact=()=>{};sim.population.nextInactive=()=>null;sim.runners.forEach(r=>r.dead=Infinity);for(let i=0;i<2;i++)Object.assign(sim.runners[i],{dead:0,inactive:false,x:i===subject?0:200,y:0,z:i===subject?0:200,yaw:0,speed:0,kills:i===subject?f.kills:0,health:100});sim.time=f.time+f.dt;sim.requiredKills=2;
 if(f.variant!=='none'){let missile=f.variant.includes('Missile');if(missile){r.weapons=[null,'Missile'];r.selectedWeapon=1;sim.selectWeapon(r);sim.secondary(r)}else sim.fire(r);if(f.variant.startsWith('initialized')||f.variant==='expiringLaser')sim.stepRunnerWeapons(r,f.dt);if(f.variant==='expiringLaser')for(let p of sim.projectiles){p.age=Math.fround(.999);p.life=1-p.age}}
 r.health=f.health;let sounds=[],emit=sim.emit.bind(sim);sim.emit=(type,data)=>{if(type==='shot')sounds.push(data.soundId);emit(type,data)};sim.events=[];const snapshot=()=>({health:r.health,active:sim.runners.slice(0,2).map(q=>!q.dead&&!q.inactive),controls:sim.runners.slice(0,2).map(q=>q.controlsEnabled!==false),mode:sim.escape?.runner===subject||r.opponentExit?4:1,cells:[...inventoryCells(r)],items:r.weapons.length,selected:r.selectedWeapon,count:sim.projectiles.filter(p=>p.owner===subject&&p.life>0).length,slots:sim.projectiles.filter(p=>p.owner===subject&&p.life>0).sort((a,b)=>a.slot-b.slot).map(p=>({slot:p.slot,kind:p.weaponId,age:p.age,visible:!p.pending&&!p.hidden})),sounds:[...sounds],entered:!!sim.escape||!!r.opponentExit,deaths:sim.events.filter(e=>e.type==='destroyed'&&e.runner===subject).length});let before=snapshot();sim.step(f.dt);return {before,after:snapshot()}})));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT));mismatches=[dict(fixture=i,native=a,rebuild=b) for i,(a,b) in enumerate(zip(native,rebuilt)) if a!=b]
report=dict(scope='Real actor callback invokes supplied stationary physical action that calls real 434e9c eligibility and 42fed4 exit entry, real profile health, retirement/deactivation/shield cleanup, then its real final primary wrapper and health check. Compare one entering actor before/after the callback across low-health and primary-pool states.',sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,fixtures=fixtures,native=native,rebuild=rebuilt,mismatches=mismatches,passed=not mismatches,limitations=['Supplied exitspot contact/name, stationary poses, single-player profile mapping, remaining time and no replacement model. Movement and complete native scene traversal are not compared.','Visual/camera action installation, renderer transforms, score/HUD/audio playback, navigation cleanup and wreck/debris creation are stubs. Primary visibility and sound calls are captured.','Only the entering actor callback is executed; surrounding actors continuing through the same/frame exit cinematic, independent effect order, collision masks, render-setting changes, full exit animation scheduling and original frames remain unverified.','Human/AI profiles only; native type-2/demonstration exit is excluded.'])
(ROOT/'private/verification/exit-entry-native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(fixtures=len(fixtures),mismatches=len(mismatches),passed=not mismatches),indent=2))
if mismatches:raise SystemExit(1)
