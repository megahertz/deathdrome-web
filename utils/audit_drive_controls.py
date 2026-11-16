#!/usr/bin/env python3
"""Compare original keyboard-style drive request accumulation, before physics."""
import hashlib,json,math,subprocess
from unicorn import __version__
from native_ai_audit import Native,ROOT,EXE,RUNNER,f32
fixtures=[dict(mode=mode,nitro=nitro,speed=f32(speed),state=state,steer=steer,throttle=throttle) for mode in [1,5] for nitro in [0,1] for speed in [-75,-10,-9.999,0,9.999,10,75] for state in [-1,0,1] for steer in [-1,0,1] for throttle in [-1,0,1]]
n=Native();native=[];n.write(0x48f140,'B',0);n.write(0x48f180,'f',100);n.write(0x48f134,'f',2);n.write(0x48f138,'f',10);n.write(0x48f1a4,'f',20)
for f in fixtures:
 n.cpu.mem_write(RUNNER,b'\0'*0x10000);n.write(RUNNER+8,'B',f['mode']);n.write(RUNNER+0xe0,'ff',f['state']*500,f['state']*30);n.write(RUNNER+0x180,'f',-f['state']*80);n.write(RUNNER+0x198,'f',-f['speed']);n.write(RUNNER+0x16c,'f',.2);n.write(RUNNER+0x6e4,'f',f['nitro'])
 trace=[]
 for frame in range(3):
  n.call(0x42f0f0,[f['steer']*100,0],eax=RUNNER);n.call(0x42f200,[-20 if f['throttle']>0 else 0,20 if f['throttle']<0 else 0],eax=RUNNER)
  trace.append(dict(turn=n.read(RUNNER+0xe4,'f')[0],turnAcceleration=n.read(RUNNER+0xe0,'f')[0],acceleration=-n.read(RUNNER+0x180,'f')[0],brake=n.read(RUNNER+0x16c,'f')[0]))
 native.append(trace)
js="""
import {applyDriveControls} from './src/drive.ts';import {DYNAMICS} from './src/simulation.ts';let input='';for await(let s of process.stdin)input+=s;console.log(JSON.stringify(JSON.parse(input).map(f=>{let r={id:0,actionMode:f.mode,nitro:f.nitro,speed:f.speed,turn:f.state*30*Math.PI/180,turnAcceleration:f.state*500*Math.PI/180,acceleration:f.state*80,supportBrake:Math.fround(.2)},trace=[];for(let i=0;i<3;i++){applyDriveControls(r,{steer:f.steer,throttle:f.throttle},DYNAMICS);trace.push({turn:r.turn*180/Math.PI,turnAcceleration:r.turnAcceleration*180/Math.PI,acceleration:r.acceleration,brake:r.supportBrake})}return trace})));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT));mismatches=[];maxerr=0
for i,(a,b) in enumerate(zip(native,rebuilt)):
 for frame,(x,y) in enumerate(zip(a,b)):
  for k in x:
   err=abs(x[k]-y[k]);maxerr=max(maxerr,err)
   if err>3e-5:mismatches.append(dict(fixture=i,frame=frame,field=k,native=x[k],rebuild=y[k],error=err))
report=dict(scope='Real 42f0f0 turn request accumulator and 42f200 forward/reverse request accumulator; three consecutive supplied keyboard-style control callbacks before any physical update.',sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,fixtures=fixtures,native=native,rebuild=rebuilt,mismatches=mismatches,maxNumericError=maxerr,tolerance=3e-5,passed=not mismatches,limitations=['Input request values are supplied, not read from a native keyboard/joystick device. Direct steering/analog mode is excluded.','No physics, complete controller Fire/Jump/barrier/look order or global scene callbacks are executed. Other mode-5 physical behavior remains outside this request-accumulation comparison.'])
(ROOT/'private/verification/drive-controls-native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(fixtures=len(fixtures),callbacks=len(fixtures)*3,mismatches=len(mismatches),maxNumericError=maxerr,firstMismatches=mismatches[:5],passed=not mismatches),indent=2))
if mismatches:raise SystemExit(1)
