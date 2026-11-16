"""Compare consecutive original periodic AI actions, RNG draws and inventory delivery.

The original 42bb3c controller runs with counted steering/action bodies and
supplied clocks, region admission and random streams. Barrier input setters,
weapon rolling, duplicate scans and inventory append execute original code.
"""
import hashlib,json,struct,subprocess
from unicorn import UC_HOOK_CODE
from native_ai_audit import ROOT,EXE,RUNNER,NODE_POOL,SCRATCH,f32
from native_ai_activity import ActivityNative
from native_ai_attack import aggression_rows

class PeriodicNative(ActivityNative):
 def __init__(self,f):
  super().__init__(mode=f['mode'])
  for i,row in enumerate(aggression_rows()):self.write(0x48f020+i*32,'8f',*row)
  self.write(0x48f018,'I',f['level']);self.write(RUNNER+0xd8,'I',1);self.write(0x518a70,'2I',1,0);self.write(SCRATCH+0x800,'f',100)
  self.write(RUNNER+0x30,'f',1);self.write(RUNNER+0x14d,'B',1);self.write(RUNNER+0x198,'f',-30)
  self.write(RUNNER+0x490,'B',int(f['held']));self.write(RUNNER+0x498,'4I',*f['cells']);self.write(RUNNER+0x4ac,'I',f['count'])
  for offset in [0x214,0x218,0x44c]:self.write(RUNNER+offset,'f',8)
  self.cpu.mem_write(0x418f68,b'\xb8\x01\x00\x00\x00\xc3')
  self.cpu.mem_write(0x434ad4,b'\xb8'+struct.pack('<I',RUNNER)+b'\xc3')
  self.cpu.mem_write(0x430f18,b'\xc3');self.cpu.hook_add(UC_HOOK_CODE,lambda c,a,s,d:self.events.append('jump'),begin=0x430f18,end=0x430f18)
  if 'modeAfter' in f:self.cpu.mem_write(0x42c8ec,b'\xc6\x80\xea\x01\x00\x00\x00\xc3')
  self.counter=SCRATCH+0x900;self.table=SCRATCH+0xa00
  self.write(self.table,'128I',*(f['stream']*16));self.write(self.counter,'I',0)
  self.cpu.mem_write(0x45a8e6,b'\xa1'+struct.pack('<I',self.counter)+b'\xff\x05'+struct.pack('<I',self.counter)+b'\x8b\x04\x85'+struct.pack('<I',self.table)+b'\xc3')
 def step_periodic(self,clock):
  self.events=[];self.write(0x518aa4,'f',clock);self.call(0x42bb3c,eax=RUNNER)
  return dict(mode=self.read(RUNNER+0x1ea,'B')[0],jump='jump' in self.events,barrier=bool(self.read(RUNNER+0x490,'B')[0]),jumpAt=self.read(RUNNER+0x214,'f')[0],barrierAt=self.read(RUNNER+0x218,'f')[0],enhancerAt=self.read(RUNNER+0x44c,'f')[0],draws=self.read(self.counter,'I')[0],cells=list(self.read(RUNNER+0x498,'4I')),count=self.read(RUNNER+0x4ac,'I')[0])
 def initialize(self,clock):
  self.cpu.mem_write(0x42d5ec,b'\xb8'+struct.pack('<I',NODE_POOL)+b'\xc3');self.cpu.mem_write(0x42c6d0,b'\xc3')
  segment=SCRATCH+0xd00;self.write(NODE_POOL+0x1c,'I',segment);self.write(segment+4,'3f',0,0,-1)
  self.write(0x518aa4,'f',clock);self.call(0x42c780,eax=RUNNER)
  return dict(attackAfter=self.read(RUNNER+0x21c,'f')[0],jumpAt=self.read(RUNNER+0x214,'f')[0],barrierAt=self.read(RUNNER+0x218,'f')[0],enhancerAt=self.read(RUNNER+0x44c,'f')[0],lockActive=bool(self.read(RUNNER+0x6fc,'B')[0]),draws=self.read(self.counter,'I')[0])

fixtures=[]
for level in range(8):
 for mode in [0,1,3]:
  for cells,count in [([4,0,0,0],1),([4,6,2,3],2),([4,1,3,5],4),([4,6,6,6],1)]:
   for held in [False,True]:
    for stream in [[0,2,4,32767,12345,1,6,5],[32767,2,2,1,0,32766,3,4]]:
     fixtures.append(dict(level=level,mode=mode,cells=cells,count=count,held=held,stream=stream,clocks=list(map(f32,[7,7.9999995,8,8.000001,11.999999,12,12.000001,13,17,20,30,31,40,100,100.00001,1000000,1000001]))))
for f in list(fixtures):
 if f['mode']==3:fixtures.append(dict(f,modeAfter=0,clocks=[8.,8.]+f['clocks'][2:]))
native=[]
for f in fixtures:
 n=PeriodicNative(f);native.append([n.step_periodic(clock) for clock in f['clocks']])
initializations=[];initialized=[]
for clock in [0,.1,7,23.12345,1000,1000000,8388608,16777216]:
 for stream in [[0,0,0,0,0,0,0,0],[32767,32767,0,0,0,0,0,0],[12345,23456,0,0,0,0,0,0],[1,32766,0,0,0,0,0,0]]:
  f=dict(level=0,mode=0,cells=[4,0,0,0],count=1,held=False,clock=f32(clock),stream=stream);initializations.append(f)
  initialized.append(PeriodicNative(f).initialize(f['clock']))
js=r"""
import {Simulation} from './src/simulation.ts';import {stepAIActions} from './src/ai-actions.ts';import {GAME_TABLES} from './src/game-tables.ts';import {WEAPON_NAMES,inventoryCells} from './src/inventory.ts';let input='';for await(const c of process.stdin)input+=c;
console.log(JSON.stringify(JSON.parse(input).map(f=>{const sim=new Simulation(),r=sim.runners[1];let draws=0;sim.countdown=0;sim.randomInt=()=>f.stream[draws++%f.stream.length];Object.assign(r,{weapons:f.cells.slice(0,f.count).map(id=>WEAPON_NAMES[id]),weaponCells:[...f.cells]});Object.assign(r.aiState,{mode:{0:'path',1:'attack',3:'recover'}[f.mode],jumpAt:8,barrierAt:8,enhancerAt:8,barrierHeld:f.held});return f.clocks.map(clock=>{sim.elapsed=clock-7;const recovering=r.aiState.mode==='recover';if(recovering&&f.modeAfter===0)r.aiState.mode='path';const a=stepAIActions(sim,r,GAME_TABLES.ai.levels[f.level],{recovering});return {mode:{path:0,attack:1,recover:3}[r.aiState.mode],jump:a.jump,barrier:a.barrier,jumpAt:r.aiState.jumpAt,barrierAt:r.aiState.barrierAt,enhancerAt:r.aiState.enhancerAt,draws,cells:[...inventoryCells(r)],count:r.weapons.length}})})));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],cwd=ROOT,input=json.dumps(fixtures).encode()))
mismatches=[dict(fixture=i,step=j,native=a,rebuild=b) for i,(aa,bb) in enumerate(zip(native,rebuilt)) for j,(a,b) in enumerate(zip(aa,bb)) if a!=b]
init_js=r"""
import {Simulation} from './src/simulation.ts';import {resetAI} from './src/ai-actions.ts';let input='';for await(const c of process.stdin)input+=c;
console.log(JSON.stringify(JSON.parse(input).map(f=>{const sim=new Simulation(),r=sim.runners[1];let draws=0;sim.countdown=0;sim.elapsed=f.clock-7;sim.randomInt=()=>f.stream[draws++];resetAI(sim,r);let a=r.aiState;return {attackAfter:a.attackAfter,jumpAt:a.jumpAt,barrierAt:a.barrierAt,enhancerAt:a.enhancerAt,lockActive:a.lockActive,draws}})));
"""
init_rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',init_js],cwd=ROOT,input=json.dumps(initializations).encode()))
init_mismatches=[dict(fixture=i,native=a,rebuild=b) for i,(a,b) in enumerate(zip(initialized,init_rebuilt)) if a!=b]
report=dict(scope=__doc__,sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),sequences=len(fixtures),controllerActions=sum(len(f['clocks']) for f in fixtures),fixtures=fixtures,native=native,initializationCases=len(initializations),initializations=initializations,initialized=initialized,initializationMismatches=init_mismatches,mismatchCount=len(mismatches)+len(init_mismatches),mismatches=mismatches[:10],passed=not mismatches and not init_mismatches,limitations=['Clocks, region admission, profile type and RNG stream are supplied. Actual original periodic branches, weapon roll/duplicate scan/append and barrier held-flag setters execute.','Steering, jump physics and route work are stubs. Barrier generation geometry is excluded by supplied runner height; only its requested held flag is compared.','Initialization runs original 42c780 with supplied route lookup/push; only timer fields, lock latch and draw count are compared, not route or recovery pose.','No global scene ordering, full-round RNG seeding or independent effects/rendering/audio equivalence is established.'])
(ROOT/'private/verification/ai-periodic-native.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['sequences','controllerActions','initializationCases','mismatchCount','mismatches','passed']},indent=2))
if not report['passed']:raise SystemExit(1)
