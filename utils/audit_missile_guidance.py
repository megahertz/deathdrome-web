#!/usr/bin/env python3
"""Execute original missile guidance math and planar shared-lock acquisition."""
import hashlib,json,struct,subprocess
from unicorn import __version__,UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_ESP
from native_ai_audit import Native,ROOT,EXE,RUNNER,SCRATCH,STACK,f32
fixtures=[];native=[]
for velocity in [[-90,0,-120],[90,0,-120],[120,30,90],[-120,-30,90],[.01,50,-150],[30,-120,-70]]:
 for target in [[100,20,-100],[-100,-20,100],[0,100,0],[20,0,-100]]:
  fixtures.append(dict(p=dict(x=10,y=10,z=20,vx=velocity[0],vy=velocity[1],vz=velocity[2],speed=150),target=dict(x=target[0],y=target[1],z=target[2]),dt=f32(1/60)))
for fixture in fixtures:
 n=Native();p=fixture['p'];target=RUNNER+0x2000;n.write(RUNNER+0x6f8,'I',target);n.write(target+0x2c,'fff',*fixture['target'].values());n.write(RUNNER+0x58c,'fff',p['x'],p['y'],p['z']);n.write(RUNNER+0x61c,'fff',p['vx'],p['vy'],p['vz']);n.write(0x49064c,'f',fixture['dt']);angles=[]
 def capture(cpu,address,size,data):
  if address==0x45a5fc:angles.extend(n.read(cpu.reg_read(UC_X86_REG_ESP)+4,'fff'))
 n.cpu.mem_write(0x45a5fc,b'\xc2\x0c\x00');n.cpu.hook_add(UC_HOOK_CODE,capture,begin=0x45a5fc,end=0x45a5fc);n.call(0x436388,eax=RUNNER,edx=0)
 native.append(dict(velocity=list(n.read(RUNNER+0x61c,'fff')),pitchDelta=angles[0],yawDelta=angles[1]))
undefined_branch=[]
for seed in [[1,2,3],[4,5,6]]:
 n=Native();target=RUNNER+0x2000;n.write(RUNNER+0x6f8,'I',target);n.write(target+0x2c,'fff',50,10,-100);n.write(RUNNER+0x58c,'fff',0,10,0);n.write(RUNNER+0x61c,'fff',0,0,-150);n.write(0x49064c,'f',f32(1/60));n.write(STACK-112,'fff',*seed);n.cpu.mem_write(0x45a5fc,b'\xc2\x0c\x00');n.call(0x436388,eax=RUNNER,edx=0);undefined_branch.append(dict(localStackSeed=seed,velocity=list(n.read(RUNNER+0x61c,'fff'))))
js="""
import {steerMissile} from './src/projectiles.ts';let s='';for await(let x of process.stdin)s+=x;console.log(JSON.stringify(JSON.parse(s).map(({p,target,dt})=>{steerMissile(p,target,dt);return {velocity:[p.vx,p.vy,p.vz],...p.steering}})));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT));maxerr=0;mismatches=[]
for i,(a,b) in enumerate(zip(native,rebuilt)):
 err=max([abs(x-y) for x,y in zip(a['velocity'],b['velocity'])]+[abs(a[k]-b[k]) for k in ['yawDelta','pitchDelta']]);maxerr=max(maxerr,err)
 if err>0.00004:mismatches.append(dict(fixture=i,error=err,native=a,rebuild=b))
report=dict(scope='Actual original missile guidance 436388, 4374d4 normalization, 458d88 vector rotation and native float matrix/point helpers. Only render-node incremental Euler setter 45a5fc is stubbed and captured.',sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,fixtures=fixtures,native=native,rebuild=rebuilt,undefinedZeroHeadingBranch=undefined_branch,maxNumericError=maxerr,mismatches=mismatches,passed=not mismatches,limitations=['Excludes exact-zero current heading: original guidance skips writing its local velocity vector in that branch and later reads those stack slots. Two native stack-seed probes show differing outputs from identical runner/target state. Rebuild preserves incoming velocity there.','Controlled positions and velocities; no complete target acquisition, projectile action, scene scheduling or rendering.'])
(ROOT/'private/verification/missile-guidance-native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['maxNumericError','mismatches','passed']},indent=2))
if mismatches:raise SystemExit(1)
