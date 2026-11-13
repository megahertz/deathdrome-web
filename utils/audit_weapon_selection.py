#!/usr/bin/env python3
"""Verify weapon-cycle lock clearing and Nitro's shared-lock steering."""
import hashlib,json,math,struct,subprocess
from unicorn import __version__
from native_ai_audit import Native,ROOT,EXE,RUNNER,f32
names=['Nitro Ram','Missile','ShockWave','Disruptor',None,'Ion Sword','NanoShield'];cycles=[];native_cycles=[]
for next_id in range(7):
 n=Native();cells=[4,next_id,0,0];n.write(RUNNER+0x498,'4I',*cells);n.write(RUNNER+0x4a8,'II',0,2);n.write(RUNNER+0x6f8,'I',RUNNER+0x2000);n.cpu.mem_write(0x4156d0,b'\xc3');n.call(0x43733c,eax=RUNNER);cycles.append(dict(selected=0,weapons=[None,names[next_id]]));native_cycles.append(dict(selected=n.read(RUNNER+0x4a8,'I')[0],target=1 if n.read(RUNNER+0x6f8,'I')[0] else None))
nitro=[];native_nitro=[]
for heading in [0,45,112.5,247.5,359.99]:
 for target in [dict(x=100,y=0,z=-100),dict(x=-100,y=50,z=100),dict(x=0,y=0,z=0),None]:
  a=heading*math.pi/180;forward=dict(x=f32(-math.sin(a)),z=f32(-math.cos(a)));r=dict(id=0,x=0,y=0,z=0,yaw=a,nitro=1,planarForwardVector=forward);dt=f32(1/60);n=Native();n.write(RUNNER+0x104,'f',f32(heading));n.write(RUNNER+0x80,'fff',forward['x'],0,forward['z']);n.write(0x49064c,'f',dt)
  if target:n.write(RUNNER+0x6f8,'I',RUNNER+0x2000);n.write(RUNNER+0x202c,'fff',target['x'],target['y'],target['z'])
  n.call(0x4365a0,eax=RUNNER);nitro.append(dict(r=r,target=target,dt=dt));native_nitro.append(n.read(RUNNER+0x104,'f')[0])
js="""
import {Simulation} from './src/simulation.js';import {steerNitro} from './src/runner-contact.js';let s='';for await(let x of process.stdin)s+=x;let data=JSON.parse(s),sim={selectWeapon:Simulation.prototype.selectWeapon,emit(){}};
let cycles=data.cycles.map(({selected,weapons})=>{let r={selectedWeapon:selected,weapons,missileLockTarget:1};Simulation.prototype.cycleWeapon.call(sim,r);return {selected:r.selectedWeapon,target:r.missileLockTarget}});
let nitro=data.nitro.map(({r,target,dt})=>{steerNitro(r,target,dt);return Math.fround(r.yaw*180/Math.PI)});console.log(JSON.stringify({cycles,nitro}));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js','--input-type=module','-e',js],input=json.dumps(dict(cycles=cycles,nitro=nitro)).encode(),cwd=ROOT));mismatches=[]
for i,(a,b) in enumerate(zip(native_cycles,rebuilt['cycles'])):
 if a!=b:mismatches.append(dict(cycle=i,native=a,rebuild=b))
for i,(a,b) in enumerate(zip(native_nitro,rebuilt['nitro'])):
 if a!=b:mismatches.append(dict(nitro=i,native=a,rebuild=b))
report=dict(scope='Actual original 43733c cycles all seven weapon IDs in two-item inventories and applies shared-lock clearing; actual 4365a0 steers Nitro from supplied planar bases and target pointers.',sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,weaponIds=dict((name or 'Laser',i) for i,name in enumerate(names)),cycles=cycles,cycleNative=native_cycles,cycleRebuild=rebuilt['cycles'],nitro=nitro,nitroNative=native_nitro,nitroRebuild=rebuilt['nitro'],mismatches=mismatches,passed=not mismatches,limitations=['Cycle fixtures use valid two-item inventories; these supersede the earlier artificial seven-item fixture, which exceeded the native four-cell layout.','Weapon-cycle HUD refresh is stubbed.','Supplied planar forward basis; native suspension/scene basis generation and full boost dynamics are not compared.','Does not execute complete input timing, pickup consumption, actor scheduling, collision or rendered frames.'])
(ROOT/'private/verification/weapon-selection-native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(cycles=len(cycles),nitro=len(nitro),mismatches=mismatches,passed=not mismatches),indent=2))
if mismatches:raise SystemExit(1)
