#!/usr/bin/env python3
"""Run original exit state actions with real transform getters/setters and math."""
import hashlib,json,struct,subprocess
from unicorn import UC_HOOK_MEM_INVALID,UC_HOOK_CODE,__version__
from unicorn.x86_const import UC_X86_REG_EIP,UC_X86_REG_EAX,UC_X86_REG_EDX
from native_ai_audit import Native,ROOT,EXE,RUNNER,SCRATCH,f32
CAMERA,YAW=RUNNER+0x1000,RUNNER+0x2000
ROOT_DATA,CAMERA_DATA,YAW_DATA=RUNNER+0x8000,RUNNER+0x8400,RUNNER+0x8800
ACTIONS={0x43b350:'delay',0x43b170:'center',0x43adec:'fold',0x43abf8:'rise',0x43aa4c:'complete'}
fixtures=[dict(human=human,position=pos,camera=cam,dt=f32(dt),frames=frames) for human,pos,cam,dt,frames in [
 (True,[12,0,5],[18,3,10],1/60,360),(True,[-6,.1,-9],[-12,8,-15],1/60,360),
 (True,[0,0,0],[0,3,7],1/30,185),(True,[1,0,2],[1,4,7],.1,65),
 (False,[12,0,5],[18,3,10],1/60,360),(False,[-6,.1,-9],[-12,8,-15],1/30,185)]]
native=[]
for f in fixtures:
 n=Native();action=[0x43b350]
 n.write(SCRATCH,'f',f['dt']);n.write(0x5192b0,'f',.25);n.write(0x48f3e0,'I',CAMERA);n.write(0x48f3e4,'I',1)
 for obj,data in [(RUNNER,ROOT_DATA),(CAMERA,CAMERA_DATA),(YAW,YAW_DATA)]:n.write(obj+0x44,'I',data);n.write(obj+0x28,'I',1)
 n.write(ROOT_DATA+0x24,'fff',*f['position']);n.write(CAMERA_DATA+8,'fff',*f['camera'])
 n.cpu.mem_write(0x44ca3c,b'\xd9\x05'+struct.pack('<I',SCRATCH)+b'\xc3')
 n.cpu.mem_write(0x42b468,b'\x31\xc0\xc3')
 n.cpu.mem_write(0x418f94,b'\xb0'+bytes([f['human']])+b'\xc3')
 n.cpu.mem_write(0x44b434,b'\xb8'+struct.pack('<I',YAW)+b'\xc3')
 for a in [0x4377c8,0x412c44,0x44b628,0x44b4f0,0x43a9e8,0x4182f4,0x468928,0x4451d0,0x445250,0x44cd24]:n.cpu.mem_write(a,b'\xc3')
 n.cpu.mem_write(0x418490,b'\xc2\x04\x00')
 for a in [0x411ee8,0x459580,0x434ad4]:n.cpu.mem_write(a,b'\x31\xc0\xc3')
 def installed(cpu,address,size,user):
  if cpu.reg_read(UC_X86_REG_EAX)==RUNNER:action[0]=cpu.reg_read(UC_X86_REG_EDX)
 n.cpu.hook_add(UC_HOOK_CODE,installed,begin=0x44b628,end=0x44b628)
 samples=[]
 def invalid(cpu,access,address,size,value,user):
  print('invalid',hex(cpu.reg_read(UC_X86_REG_EIP)),hex(address),'action',hex(action[0]),'fixture',f,'frame',len(samples));return False
 n.cpu.hook_add(UC_HOOK_MEM_INVALID,invalid)
 for i in range(f['frames']):
  if ACTIONS.get(action[0])!='complete':n.call(action[0],eax=RUNNER)
  phase=ACTIONS.get(action[0],'complete') if f['human'] else ('complete' if n.read(0x5192b0,'f')[0]<=0 and action[0]==0x43abf8 else ACTIONS[action[0]])
  samples.append(dict(phase=phase,remaining=n.read(0x5192b0,'f')[0],position=list(n.read(ROOT_DATA+0x24,'fff')),fold=n.read(YAW_DATA+0xc,'f')[0],cameraPosition=list(n.read(CAMERA_DATA+8,'fff')),cameraAngles=list(n.read(CAMERA_DATA+0x14,'fff'))))
  if phase=='complete':break
 native.append(samples)
js="""
import {stepExitPose} from './src/exit-pose.js';
let fixtures=JSON.parse(await new Promise(resolve=>{let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>resolve(s))}));
console.log(JSON.stringify(fixtures.map(f=>{let r={x:f.position[0],y:Math.fround(f.position[1]),z:f.position[2]},e={phase:'delay',remaining:.25,foldDegrees:0,camera:{x:f.camera[0],y:f.camera[1],z:f.camera[2],pitchDegrees:0,yawDegrees:0,rollDegrees:0}},sim={exitHangar:{}},out=[];for(let i=0;i<f.frames;i++){let done=stepExitPose(sim,r,e,f.dt,f.human);out.push({phase:e.phase,remaining:e.remaining,position:[r.x,r.y,r.z],fold:e.foldDegrees,cameraPosition:[e.camera.x,e.camera.y,e.camera.z],cameraAngles:[e.camera.pitchDegrees,e.camera.yawDegrees,e.camera.rollDegrees]});if(done)break}return out})));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT))
mismatches=[];maxerr=0;numeric=0
for i,(ns,rs) in enumerate(zip(native,rebuilt)):
 if len(ns)!=len(rs):mismatches.append(dict(fixture=i,lengths=[len(ns),len(rs)]))
 for j,(a,b) in enumerate(zip(ns,rs)):
  err=max(abs(x-y) for k in ['position','cameraPosition','cameraAngles'] for x,y in zip(a[k],b[k]));err=max(err,abs(a['fold']-b['fold']),abs(a['remaining']-b['remaining']));maxerr=max(maxerr,err);numeric+=11
  if err>.0002 or a['phase']!=b['phase']:mismatches.append(dict(fixture=i,frame=j,error=err,native=a,rebuild=b))
report=dict(scope='Original exit delay/center/fold/rise actions with original transform getters/setters and trigonometric/look-at helpers. Synthetic root/yaw/camera objects; scene actions, UI/audio/profile and completion notifications stubbed.',executable=str(EXE.relative_to(ROOT)),sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,originalFunctions=[hex(a) for a in ACTIONS if a!=0x43aa4c],fixtures=fixtures,native=native,rebuild=rebuilt,numericFields=numeric,maxNumericError=maxerr,mismatches=mismatches,passed=not mismatches,limitations=['Does not execute original scene traversal/scheduling or renderer.','Initial camera/runner poses are supplied fixtures, not captured native gameplay.','Does not audit bonuses, native light/shadow actions, or complete round flow.','Camera fixtures begin outside radius 2, as the chase camera does. Native fold action leaves horizontal delta locals unwritten when already within radius 2; those stack-dependent values are not reproduced.'])
(ROOT/'private/verification/exit-pose-native-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(fixtures=len(fixtures),nativeFrames=[len(x) for x in native],rebuiltFrames=[len(x) for x in rebuilt],numericFields=numeric,maxNumericError=maxerr,mismatches=len(mismatches),firstMismatch=mismatches[:1],passed=report['passed']),indent=2))
if mismatches:raise SystemExit(1)
