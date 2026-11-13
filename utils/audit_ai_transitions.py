"""Original complete AI wrapper with real path/attack/recovery and route-push routines.

Supplies clocks, actor poses/contact flags, forward-probe visibility and target
acquisition results. Physical movement and weapon launch effects do not run.
"""
import hashlib,json,struct,subprocess
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EDX
from native_ai_audit import ROOT,EXE,RUNNER,NODE_POOL,SCRATCH,f32
from native_ai_activity import ActivityNative
from native_ai_attack import aggression_rows

GRAPH=[dict(id=i,color=12,position=p,links=links) for i,(p,links) in enumerate([
 ([100.,0.,-100.],[1,3,-1]),([200.,0.,-100.],[2,0,-1]),([200.,0.,0.],[3,1,-1]),([100.,0.,0.],[0,2,-1])])]
TARGET=RUNNER+0x6000
next_float=lambda v:struct.unpack('<f',struct.pack('<I',struct.unpack('<I',struct.pack('<f',v))[0]+1))[0]

class TransitionNative(ActivityNative):
 def __init__(self,f):
  super().__init__(mode=0 if f['variant'].startswith('acquire') else 1);self.graph(GRAPH);self.pushes=[];self.shots=0
  data=EXE.read_bytes()
  for address in [0x42d0e8,0x42befc,0x42c8ec]:self.cpu.mem_write(address,data[address-0x410000+0x400:address-0x410000+0x401])
  for i,row in enumerate(aggression_rows()):self.write(0x48f020+i*32,'8f',*row)
  for address in [0x431d88,0x4156d0,0x43753c]:self.cpu.mem_write(address,b'\xc3')
  self.cpu.mem_write(0x434ad4,b'\xb8'+struct.pack('<I',RUNNER)+b'\xc3')
  self.cpu.hook_add(UC_HOOK_CODE,lambda c,a,s,d:self.pushes.append(self.node_id(c.reg_read(UC_X86_REG_EDX))),begin=0x42c6d0,end=0x42c6d0)
  self.cpu.hook_add(UC_HOOK_CODE,self.fire,begin=0x43753c,end=0x43753c)
  self.write(0x48f018,'I',f['level']);self.write(0x48f00c,'I',1);self.write(0x48f19c,'f',100)
  self.write(RUNNER+0x2c,'3f',100,0,-30);self.write(RUNNER+0x80,'6f',0,0,-1,0,0,-1);self.write(RUNNER+0xfc,'2f',185,80);self.write(RUNNER+0x180,'f',-23)
  self.write(RUNNER+0x1f4,'f',0 if f['variant']=='refresh' else 1000);self.write(RUNNER+0x1f8,'3f',0,0,-1);self.write(RUNNER+0x204,'3f',0,0,-1)
  self.write(RUNNER+0x21c,'f',f['deadline']);self.write(RUNNER+0x220,'f',0);self.write(RUNNER+0x224,'f',f['start']);self.write(RUNNER+0x228,'I',10 if f['variant'].startswith('wall') else 0)
  self.write(RUNNER+0x234,'I',TARGET);self.write(RUNNER+0x498,'4I',4,0,0,0);self.write(RUNNER+0x4a8,'2I',0,1);self.write(RUNNER+0x448,'f',float('inf'))
  self.write(TARGET+0x2c,'3f',100,0,-60);self.write(TARGET+0x198,'f',-30)
 def fire(self,c,a,s,d):self.shots+=1
 def transition(self,f):
  self.pushes=[];self.shots=0;self.write(0x518aa4,'2f',f['clock'],f32(1/60));self.write(SCRATCH+0x800,'f',100);self.write(0x518a70,'2I',1,1);self.write(RUNNER+0xd8,'I',1)
  self.write(TARGET+0x15e,'B',int(f['active']));self.write(RUNNER+0x244,'B',int(not f['wall'] and not f['runner']));self.write(RUNNER+0x2d4,'I',TARGET if f['runner'] else 0);self.write(RUNNER+0x360,'3f',1,0,0);self.write(RUNNER+0x37c,'I',int(f['wall']));self.visibility(not f['probeWall'])
  code=b'\xc7\x02'+struct.pack('<I',TARGET)+b'\xb8\x01\x00\x00\x00\xc2\x04\x00' if f['active'] else b'\x31\xc0\xc2\x04\x00'
  self.cpu.mem_write(0x42c9bc,code);self.call(0x42bb3c,eax=RUNNER)
  mode=self.read(RUNNER+0x1ea,'B')[0];route=self.snapshot(GRAPH)
  return dict(mode=mode,attackAfter=self.read(RUNNER+0x21c,'f')[0],recoverUntil=self.read(RUNNER+0x220,'f')[0],shotAt=self.read(RUNNER+0x224,'f')[0],attackCollisions=self.read(RUNNER+0x228,'I')[0],pushes=list(self.pushes),shots=self.shots,current=route['current'],next=route['next'],chain=route['chain'],pool=route['pool'],refreshAt=route['refreshAt'])

fixtures=[];native=[]
for level in range(8):
 for start in [7.,f32(23.12345)]:
  for variant in ['acquire','expiry','lost','lost-expiry','wall','wall-expiry','probe-wall','refresh','acquire-wall','acquire-runner']:
   deadline=start if variant.startswith('acquire') or variant in ['expiry','lost-expiry','wall-expiry'] else f32(start+100)
   end=f32(next_float(start)+aggression_rows()[1][level])
   clocks=[start,next_float(start),f32(start+.01),f32(start+.1),end,next_float(end),f32(end+3),next_float(f32(end+3)),f32(end+4)]
   steps=[dict(clock=clock,active=not variant.startswith('lost'),wall=variant.startswith('wall') or variant=='acquire-wall',runner=variant=='acquire-runner',probeWall=variant=='probe-wall') for clock in clocks]
   f=dict(level=level,start=start,variant=variant,deadline=deadline,steps=steps);fixtures.append(f)
   n=TransitionNative(f);native.append([n.transition(step) for step in steps])
js=r"""
import {Simulation} from './src/simulation.js';import {clearRouteNodes,routeSegment,navigationState,routePoolState} from './src/ai-navigation.js';import {GAME_TABLES} from './src/game-tables.js';let input='';for await(const c of process.stdin)input+=c;const {fixtures,graph}=JSON.parse(input);
console.log(JSON.stringify(fixtures.map(f=>{const sim=new Simulation({paths:graph,maximumRunners:2}),r=sim.runners[1],q=sim.runners[0];sim.countdown=0;clearRouteNodes(sim,r);Object.assign(r,{x:100,y:0,z:-30,yaw:0,speed:30,turn:0,turnAcceleration:0,acceleration:23,zoneMask:1});Object.assign(q,{x:100,y:0,z:-60,speed:30,zoneMask:1});r.navigation={goalColor:12,attackCollisions:f.variant.startsWith('wall')?10:0,refreshAt:f.variant==='refresh'?0:1000,visited:0,temporaryVisited:0,alignment:{x:0,z:-1},segment:routeSegment({x:100,y:0,z:0},{x:100,y:0,z:-100},{startNode:3,endNode:0,color:12})};Object.assign(r.aiState,{mode:f.variant.startsWith('acquire')?'path':'attack',target:0,attackAfter:f.deadline,attackUntil:f.deadline,recoverUntil:0,shotAt:f.start,previousDirection:{x:0,z:-1},jumpAt:Infinity,barrierAt:Infinity,enhancerAt:Infinity});let shots=0;sim.fire=()=>shots++;sim.lineBlocked=()=>false;
 let found=false;for(let a=0;a<8&&!found;a++)for(let b=0;b<3;b++)if(GAME_TABLES.ai.aggression[a][b]===f.level){sim.arena=a+1;sim.round=b+1;found=true;break}
 return f.steps.map(step=>{sim.elapsed=step.clock-7;sim.time=100;shots=0;q.inactive=!step.active;r.aiContact={clear:!step.wall&&!step.runner,...(step.wall?{wall:{x:1,z:0}}:{}),...(step.runner?{runner:0}:{})};sim.sceneContacts=(a,b,source,target)=>target?target.id===0&&step.active?[{kind:'runner',runner:0}]:[]:step.probeWall?[{kind:'wall'}]:[];const before=sim.events.length;sim.ai(r,1/60);const nav=r.navigation,route=navigationState(sim,r);return {mode:{path:0,attack:1,recover:3}[r.aiState.mode],attackAfter:r.aiState.attackAfter,recoverUntil:r.aiState.recoverUntil,shotAt:r.aiState.shotAt,attackCollisions:nav.attackCollisions,pushes:sim.events.slice(before).filter(e=>e.type==='aiBreadcrumb').map(e=>e.next),shots,current:nav.segment.startNode,next:nav.segment.endNode,chain:route.temporaryNodes.map(n=>n.id),pool:routePoolState(sim).temporaryNodes,refreshAt:nav.refreshAt}})})));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js','--input-type=module','-e',js],cwd=ROOT,input=json.dumps(dict(fixtures=fixtures,graph=GRAPH)).encode()))
mismatches=[]
for i,(aa,bb) in enumerate(zip(native,rebuilt)):
 for j,(a,b) in enumerate(zip(aa,bb)):
  for key in a:
   if a[key]!=b[key]:mismatches.append(dict(fixture=i,step=j,key=key,native=a[key],rebuild=b[key]))
report=dict(scope=__doc__,comparedFields=['mode', 'attackAfter', 'recoverUntil', 'shotAt', 'attackCollisions', 'pushes', 'shots', 'current', 'next', 'chain', 'pool', 'refreshAt'],sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),sequences=len(fixtures),controllerActions=sum(len(f['steps']) for f in fixtures),graph=GRAPH,fixtures=fixtures,native=native,mismatchCount=len(mismatches),mismatches=mismatches[:20],passed=not mismatches,limitations=['Native path, attack, recovery, route allocation and wrapper decisions execute. Actors stay at supplied poses; physics, weapon launch side effects, scene-hit collection and target-scan result are supplied.','Periodic jump/barrier/enhancer deadlines are infinite; those branches and RNG draw order have separate coverage.','Complete moving-scene/gameplay and rendering equivalence are not established.'])
(ROOT/'private/verification/ai-transitions-native.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['sequences','controllerActions','mismatchCount','mismatches','passed']},indent=2))
if mismatches:raise SystemExit(1)
