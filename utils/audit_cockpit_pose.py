#!/usr/bin/env python3
"""Compare live procedural cockpit roll and native Euler rotation bases."""
import hashlib,json,struct,subprocess,re
from unicorn import __version__
from native_ai_audit import Native,ROOT,EXE,RUNNER,SCRATCH,f32
script=(ROOT/'private/original/game/RUN/DYNAMICS.GW').read_text();active=re.sub(r'#.*','',script)
ratio=f32(float(re.search(r'(?m)^RunDynSetCockpitRollRatio\s+([-\d.]+)',active)[1]));limit=f32(float(re.search(r'(?m)^RunDynSetMaxCockpitRot\s+([-\d.]+)',active)[1]))
fixtures=[dict(turn=f32(t),yaw=f32(y),fold=f32(p)) for t,y,p in [
 (-500,0,0),(-250.001,0,0),(-250,0,0),(-249.999,0,0),(-200,0,0),(-.01,0,0),(0,0,0),(.01,0,0),(200,0,0),(249.999,0,0),(250,0,0),(250.001,0,0),(500,0,0),
 (-200,292.5,0),(200,247.5,0),(-300,22.5,45),(300,337.5,89.8),(125,112.5,20)]]
native=[]
for f in fixtures:
 n=Native();node=RUNNER+0x2000;data=RUNNER+0x8000;n.write(RUNNER+0x10,'I',node);n.write(node+0x44,'I',data);n.write(node+0x28,'I',1);n.write(RUNNER+0xe4,'f',f['turn']);n.write(0x48f174,'ff',ratio,limit)
 n.call(0x42fe38,eax=RUNNER);roll=n.read(RUNNER+0x140,'f')[0];angles=list(n.read(data+0xc,'fff'))
 out=SCRATCH+0x400;pointer=struct.unpack('<f',struct.pack('<I',out))[0];n.call(0x457764,[f['fold'],f['yaw'],roll,pointer],ecx=12)
 native.append(dict(roll=roll,angles=angles,basis=list(n.read(out,'9f'))))
js="""
import {cockpitRollDegrees} from './src/runner-pose.ts';import {runnerAttachmentMatrix} from './src/renderer.ts';
let fixtures=JSON.parse(await new Promise(resolve=>{let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>resolve(s))}));
console.log(JSON.stringify(fixtures.map(f=>{let roll=cockpitRollDegrees(f.turn*Math.PI/180),data={attachments:Object.fromEntries(['yaw','chassis','cockpit'].map(k=>[k,{matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}]))},r={id:0,x:0,y:0,z:0,yaw:f.yaw*Math.PI/180,turn:f.turn*Math.PI/180},e={runner:0,foldDegrees:f.fold,cockpitRollDegrees:roll},m=runnerAttachmentMatrix(data,r,'cockpit',e).elements;return {roll,angles:[0,0,roll],basis:[m[0],m[1],m[2],m[4],m[5],m[6],m[8],m[9],m[10]]}})));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT));mismatches=[];maxerr=0
for i,(a,b) in enumerate(zip(native,rebuilt)):
 err=max([abs(a['roll']-b['roll'])]+[abs(x-y) for k in ['angles','basis'] for x,y in zip(a[k],b[k])]);maxerr=max(maxerr,err)
 if err>1e-6:mismatches.append(dict(fixture=i,native=a,rebuild=b,error=err))
report=dict(scope='Original 42fe38 cockpit roll action and 457764 Euler basis builder. Actual scene angle setter executes on a supplied node. Active DYNAMICS.GW values override executable defaults.',executable=str(EXE.relative_to(ROOT)),sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),script='private/original/game/RUN/DYNAMICS.GW',scriptSha256=hashlib.sha256((ROOT/'private/original/game/RUN/DYNAMICS.GW').read_bytes()).hexdigest(),ratio=ratio,maximum=limit,emulator='Unicorn '+__version__,fixtures=fixtures,native=native,rebuild=rebuilt,maxNumericError=maxerr,mismatches=mismatches,passed=not mismatches,limitations=['Does not run complete native scene traversal or render frames.','Static pivot placement comes from separately decoded model assets; full native hierarchy/matrix propagation is not executed.','Suspension pitch/roll, chassis height, emitter transforms and full collision ordering remain incomplete.'])
(ROOT/'private/verification/cockpit-pose-native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(fixtures=len(fixtures),maxNumericError=maxerr,mismatches=mismatches,passed=report['passed']),indent=2))
if mismatches:raise SystemExit(1)
