#!/usr/bin/env python3
"""Execute native 43b060 with transform storage substituted for the scene graph."""
import hashlib,json,struct,subprocess
from unicorn import UC_HOOK_CODE,__version__
from unicorn.x86_const import UC_X86_REG_EAX,UC_X86_REG_EDX,UC_X86_REG_EBX,UC_X86_REG_ECX,UC_X86_REG_ESP
from native_ai_audit import Native,ROOT,EXE,RUNNER,SCRATCH,f32
fixtures=[dict(door=f32(y),sign=f32(y*.3),active=a,dt=f32(dt),frames=frames) for y,a,dt,frames in [
 (0,1,1/60,90),(20.99,1,1/60,2),(21,1,1/60,2),(21.1,1,.1,2),
 (21,0,1/60,90),(.35,0,1/60,1),(.350001,0,1/60,1),(.1,0,.1,1),
 (0,2,1/60,30),(12,2,1/60,30),(12,0,.1,10)]]
native=[]
for f in fixtures:
 n=Native();pos={RUNNER:[0.,f['door'],0.],RUNNER+0x1000:[0.,f['sign'],0.]};moving=[True]
 n.write(0x48f3c8,'I',RUNNER);n.write(0x48f3d0,'I',RUNNER+0x1000);n.write(0x48f3e4,'i',f['active']);n.write(SCRATCH,'f',f['dt'])
 n.cpu.mem_write(0x44ca3c,b'\xd9\x05'+struct.pack('<I',SCRATCH)+b'\xc3')
 for a,code in [(0x45a6a4,b'\xc3'),(0x45a754,b'\xc2\x0c\x00'),(0x45a6bc,b'\xc2\x0c\x00'),(0x44b628,b'\xc3')]:n.cpu.mem_write(a,code)
 def scene(cpu,a,size,user):
  obj=cpu.reg_read(UC_X86_REG_EAX)
  if a==0x45a6a4:
   for reg,val in zip([UC_X86_REG_EDX,UC_X86_REG_EBX,UC_X86_REG_ECX],pos[obj]):n.write(cpu.reg_read(reg),'f',val)
  elif a in [0x45a754,0x45a6bc]:
   xyz=n.read(cpu.reg_read(UC_X86_REG_ESP)+4,'fff')
   pos[obj]=[f32(x+y) for x,y in zip(pos[obj],xyz)] if a==0x45a754 else list(xyz)
  elif a==0x44b628 and obj==RUNNER:moving[0]=False
 for a in [0x45a6a4,0x45a754,0x45a6bc,0x44b628]:n.cpu.hook_add(UC_HOOK_CODE,scene,begin=a,end=a)
 samples=[]
 for i in range(f['frames']):
  if moving[0]:n.call(0x43b060)
  samples.append(dict(door=pos[RUNNER][1],sign=pos[RUNNER+0x1000][1],moving=moving[0]))
 native.append(samples)
js="""
import {stepExitHangar} from './src/exit-hangar.ts';
let fixtures=JSON.parse(await new Promise(resolve=>{let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>resolve(s))}));
console.log(JSON.stringify(fixtures.map(f=>{let s={exitHangar:{door:f.door,sign:f.sign,moving:true},runners:Array.from({length:f.active},()=>({opponentExit:{}}))},out=[];for(let i=0;i<f.frames;i++){stepExitHangar(s,f.dt);out.push({...s.exitHangar})}return out})));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT))
mismatches=[];maxerr=0
for i,(ns,rs) in enumerate(zip(native,rebuilt)):
 for j,(a,b) in enumerate(zip(ns,rs)):
  err=max(abs(a[k]-b[k]) for k in ['door','sign']);maxerr=max(maxerr,err)
  if err>1e-6 or a['moving']!=b['moving']:mismatches.append(dict(fixture=i,frame=j,native=a,rebuild=b))
report=dict(scope='Native hangar door/sign action 43b060, including height overshoot, concurrent exits and closing snap. Scene getter/setter/translation calls use float storage stubs.',executable=str(EXE.relative_to(ROOT)),sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,fixtures=fixtures,native=native,rebuild=rebuilt,maxNumericError=maxerr,mismatches=mismatches,passed=not mismatches,limitations=['Does not execute original scene scheduling, renderer, or qualification/light animation. No overall fidelity percentage inferred.'])
(ROOT/'private/verification/exit-hangar-native-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(fixtures=len(fixtures),frames=sum(f['frames'] for f in fixtures),maxNumericError=maxerr,mismatches=len(mismatches),passed=report['passed'])))
if mismatches:raise SystemExit(1)
