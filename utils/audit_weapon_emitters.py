#!/usr/bin/env python3
"""Run original 441320 and 458930 against rebuilt weapon emitter frames."""
import hashlib,json,struct,subprocess
from unicorn import __version__
from native_ai_audit import Native,ROOT,EXE,RUNNER,SCRATCH,f32

fixtures=[]
for human in [True,False]:
 for yaw,pitch,roll,cockpit,mode,y,base in [(0,0,0,0,0,0,0),(90,0,0,0,0,10,0),(292.5,0,0,22.8,0,3,0),(247.5,0,0,-22.8,0,1,0),(22.5,17,-12,30,0,4,0),(337.5,-19,13,-30,0,8,0),(112.5,9,5,12,2,15,3),(0,0,0,0,2,20,0),(180,0,0,0,2,0,0),(359.99,-30,30,-30,2,40,8)]:
  fixtures.append(dict(human=human,r=dict(id=0,x=f32(123.456),y=f32(y),z=f32(-87.654),yaw=yaw*3.141592653589793/180,chassisPitchDegrees=f32(pitch),chassisRollDegrees=f32(roll),cockpitRollDegrees=f32(cockpit),actionMode=mode,baseHeight=f32(base))))
native=[];launch_fixtures=[];launch_native=[]
for fixture in fixtures:
 r=fixture['r'];n=Native();n.cpu.mem_write(0x418f68,b'\xb8'+struct.pack('<I',0 if fixture['human'] else 1)+b'\xc3');n.write(0x490650,'I',1)
 n.write(RUNNER,'I',0);n.write(RUNNER+8,'B',r['actionMode']);n.write(RUNNER+0x2c,'fff',r['x'],r['y'],r['z']);n.write(RUNNER+0xe8,'f',r['baseHeight']);n.write(RUNNER+0x104,'fff',f32(r['yaw']*180/3.141592653589793),r['chassisPitchDegrees'],r['chassisRollDegrees']);n.write(RUNNER+0x140,'f',r['cockpitRollDegrees'])
 n.call(0x441320,eax=RUNNER);matrix=list(n.read(0x51a9d4,'12f'));origins=[]
 for address in ([0x4356bc,0x4356c8] if fixture['human'] else [0x4356d4,0x4356e0]):
  n.call(0x458930,eax=address,edx=SCRATCH,ebx=1);origins.append(dict(zip(['x','y','z'],n.read(SCRATCH,'fff'))))
 native.append(dict(matrix=matrix,origins=origins))
 # Execute each original initializer up to its first common update block.
 for missile in [False,True]:
  for side in [0,1]:
   for speed in [-40,75]:
    direction=[f32(.36),f32(.48),f32(-.8)];n.write(RUNNER+0x8c,'fff',*direction);n.write(RUNNER+0x198,'f',-speed);n.write(RUNNER+0x6dc,'I',side);n.write(RUNNER+0x4cc,'f',0)
    for address in [0x44b4f0,0x419008,0x42ed54,0x4182f4,0x468928,0x43738c]:n.cpu.mem_write(address,b'\xc3')
    n.cpu.mem_write(0x434ad4,b'\xb8'+struct.pack('<I',RUNNER)+b'\xc3');n.cpu.mem_write(0x45a54c,b'\xc2\x0c\x00')
    if missile:n.cpu.mem_write(0x436759,b'\x83\xc4\x1c\x5d\x5f\x5e\x59\x5b\xc3')
    else:n.cpu.mem_write(0x435be1,b'\x83\xc4\x54\x5d\x5f\x5e\x59\x5b\xc3')
    n.call(0x436634 if missile else 0x4359e4,eax=RUNNER,edx=0)
    launch_fixtures.append(dict(r={**r,'speed':speed,'muzzleSide':side,'forwardVector':dict(zip(['x','y','z'],direction))},human=fixture['human'],missile=missile))
    launch_native.append(dict(origin=list(n.read(RUNNER+0x58c,'fff')),velocity=list(n.read(RUNNER+0x61c,'fff')),side=n.read(RUNNER+0x6dc,'I')[0]))
js="""
import {emitterMatrix,emitterOrigins} from './src/weapon-emitters.js';
let s='';for await(let x of process.stdin)s+=x;
console.log(JSON.stringify(JSON.parse(s).map(({r,human})=>({matrix:emitterMatrix(r,human),origins:emitterOrigins(r,human)}))));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT));mismatches=[];maxerr=0
for i,(a,b) in enumerate(zip(native,rebuilt)):
 errors=[abs(x-y) for x,y in zip(a['matrix'],b['matrix'])]+[abs(x[k]-y[k]) for x,y in zip(a['origins'],b['origins']) for k in ['x','y','z']];err=max(errors);maxerr=max(maxerr,err)
 if err>0.00003:mismatches.append(dict(fixture=i,native=a,rebuild=b,error=err))
launch_js="""
import {launchProjectiles} from './src/projectiles.js';
let s='';for await(let x of process.stdin)s+=x;
console.log(JSON.stringify(JSON.parse(s).map(({r,human,missile})=>{
 let sim={player:human?0:1,runners:[r],projectiles:Array.from({length:11},()=>({owner:r.id,kind:'Laser',life:1})),emit(){}};
 launchProjectiles(sim,r,missile);let p=sim.projectiles.at(-1);
 return {origin:[p.x,p.y,p.z],velocity:[p.dx,p.dy,p.dz].map(v=>Math.fround(v*p.speed)),side:r.muzzleSide};
})));
"""
# Eleven occupied slots restrict a laser press to the one initializer under test.
launch_rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js','--input-type=module','-e',launch_js],input=json.dumps(launch_fixtures).encode(),cwd=ROOT))
for i,(a,b) in enumerate(zip(launch_native,launch_rebuilt)):
 err=max(abs(x-y) for k in ['origin','velocity'] for x,y in zip(a[k],b[k]));maxerr=max(maxerr,err)
 if err>0.00003 or a['side']!=b['side']:mismatches.append(dict(launchFixture=i,native=a,rebuild=b,error=err))
report=dict(scope='Actual native emitter matrix builder 441320, matrix helpers and point transformer 458930, plus laser 4359e4 and missile 436634 initializer blocks.',sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,fixtures=fixtures,native=native,rebuild=rebuilt,launchFixtures=launch_fixtures,launchNative=launch_native,launchRebuild=launch_rebuilt,maxNumericError=maxerr,tolerance=0.00003,mismatches=mismatches,passed=not mismatches,limitations=['Controlled pose inputs; native suspension and jump state transitions are not executed.','Initializer actions stop at their first common update block. Audio/profile/inventory/render-node setter calls are stubbed; profile type is supplied.','Velocity comparison rounds direction times speed to the original float store; rebuilt subsequent integration remains separate and unverified.','Does not compare full projectile actions, scene traversal, collision or rendering.','Native frame-cache reuse is not compared; each pose forces a fresh matrix.'])
(ROOT/'private/verification/weapon-emitters-native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(fixtures=len(fixtures),launchFixtures=len(launch_fixtures),maxNumericError=maxerr,mismatches=mismatches,passed=not mismatches),indent=2))
if mismatches:raise SystemExit(1)
