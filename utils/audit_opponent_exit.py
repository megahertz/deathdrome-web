#!/usr/bin/env python3
"""Audit original AI exit eligibility/dispatch under controlled profile/scene fixtures.
Optional dependency: Unicorn 2.x, confined to verification.
"""
import hashlib,json,struct,subprocess
from unicorn import UC_HOOK_CODE,__version__ as unicorn_version
from unicorn.x86_const import UC_X86_REG_EAX
from native_ai_audit import Native,ROOT,EXE,RUNNER,SCRATCH,f32
NEXT=RUNNER+0x6000
fixtures=[dict(time=f32(t),x=f32(x),y=f32(y),kills=kills,replacement=replacement)
          for t,x,y,kills,replacement in [(36,0,0,2,True),(35,0,0,2,True),(34,0,0,2,True),
          (35,18,0,2,True),(35,18.001,0,2,True),(35,0,.1,2,True),(35,0,.10001,2,True),
          (35,0,0,1,True),(35,0,0,2,False)]]
native=[]
for f in fixtures:
 n=Native();events=[]
 def capture(cpu,address,size,user):
  names={0x43495c:'retire',0x433df4:'scan',0x433c88:'materialize',0x43b3cc:'visual'}
  events.append(names[address])
 for addr in [0x43495c,0x433df4,0x433c88,0x43b3cc]:n.cpu.hook_add(UC_HOOK_CODE,capture,begin=addr,end=addr)
 # Single-player, AI profile, and an explicitly supplied exitspot contact.
 stubs={0x411ee8:b'\x31\xc0\xc3',0x418f68:b'\xb8\x01\x00\x00\x00\xc3',
  0x418848:b'\xb0'+bytes([int(f['kills']>=2)])+b'\xc3',0x468f17:b'\x31\xc0\xc3',
  0x43495c:b'\xc3',0x433df4:b'\xb8'+struct.pack('<I',NEXT if f['replacement'] else 0)+b'\xc3',
  0x433c88:b'\xc3',0x44b4f0:b'\xc3',0x45bf10:b'\xc3',0x45bea8:b'\xc3',
  0x459580:b'\xc3',0x45bec0:b'\xc2\x0c\x00',0x45be08:b'\xc2\x0c\x00',0x45bddc:b'\xc3',
  0x43b3cc:b'\xc3',0x434bbc:b'\xc3',0x418dc0:b'\xd9\x05'+struct.pack('<I',SCRATCH+0x210)+b'\xc3',
  0x418dd4:b'\xc2\x04\x00',0x43c160:b'\xd9\x05'+struct.pack('<I',SCRATCH+0x214)+b'\xc3'}
 for a,data in stubs.items():n.cpu.mem_write(a,data)
 n.write(SCRATCH+0x210,'ff',100.,f['time']);n.write(RUNNER,'II',1,1);n.write(RUNNER+8,'B',1)
 n.write(RUNNER+0x2c,'fff',f['x'],f['y'],0.);n.write(RUNNER+0xc,'I',RUNNER+0x8000);n.write(RUNNER+0x20,'I',RUNNER+0x8000)
 n.write(NEXT+0xc,'I',RUNNER+0x9000);n.write(RUNNER+0x440,'I',40)
 n.write(0x518a78,'IIIII',0,2,2,0,0);n.write(SCRATCH,'I',1);n.write(SCRATCH+0x20,'I',RUNNER+0x5000)
 n.call(0x434e9c,args=[0.,0.,0.],eax=RUNNER,ebx=SCRATCH)
 native.append(dict(started='visual' in events,events=events,mode=n.read(RUNNER+8,'B')[0],savedGoalColor=n.read(RUNNER+0x440,'I')[0],counts=list(n.read(0x518a78,'IIIII'))))
js=r"""
import {Simulation} from './src/simulation.js';import {beginOpponentExit} from './src/escape.js';
let fixtures=JSON.parse(await new Promise(resolve=>{let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>resolve(s))}));
console.log(JSON.stringify(fixtures.map(f=>{let sim=new Simulation(),r=sim.runners[1],events=[];sim.time=f.time;sim.aiRouteCounts=[0,2,2,0,0];
 Object.assign(r,{x:f.x,y:f.y,z:0,kills:f.kills,navigation:{goalColor:40,routeIndex:1,segment:{startNode:0}}});
 let retire=sim.population.retire.bind(sim.population);sim.population.retire=(...args)=>{events.push('retire');return retire(...args)};
 sim.population.nextInactive=()=>{events.push('scan');return f.replacement?sim.runners[5]:null};let started=beginOpponentExit(sim,r);
 if(started){if(f.replacement)events.push('materialize');events.push('visual')}
 return {started,events,mode:started?4:1,savedGoalColor:r.savedGoalColor??r.navigation.goalColor,counts:sim.aiRouteCounts};
})));"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT))
mismatches=[dict(fixture=i,native=a,rebuild=b) for i,(a,b) in enumerate(zip(native,rebuilt)) if a!=b]
budget_fixtures=[dict(goal=goal,counts=counts,round=round,replacement=replacement) for goal,counts,round,replacement in [
 (40,[0,2,2,0,0],1,True),(12,[0,2,2,0,0],1,True),(0,[0,2,2,0,0],1,True),
 (40,[0,3,3,1,1],1,True),(202,[0,2,2,2,2],3,True),(40,[0,2,2,0,0],1,False)]]
limits=[[0,0,0],[2,2,2],[2,2,2],[0,2,2],[0,0,2]]
native_budgets=[]
for f in budget_fixtures:
 n=Native();calls=[]
 def capture_budget(cpu,address,size,user_data):calls.append('scan' if address==0x433df4 else 'materialize')
 for address in [0x433df4,0x433c88]:n.cpu.hook_add(UC_HOOK_CODE,capture_budget,begin=address,end=address)
 n.cpu.mem_write(0x418f68,b'\xb8\x01\x00\x00\x00\xc3')
 n.cpu.mem_write(0x433df4,b'\xb8'+struct.pack('<I',NEXT if f['replacement'] else 0)+b'\xc3')
 n.cpu.mem_write(0x433c88,b'\xc3');n.cpu.mem_write(0x44b4f0,b'\xc3')
 n.write(0x48d8a8,'I',f['round']-1);n.write(RUNNER+0x440,'I',f['goal']);n.write(RUNNER+0x450,'i',1)
 n.write(0x518a78,'iiiii',*f['counts']);n.write(0x518a8c,'iiiii',*[row[f['round']-1] for row in limits])
 n.call(0x433b2c,eax=RUNNER)
 native_budgets.append(dict(counts=list(n.read(0x518a78,'iiiii')),nextGoal=n.read(NEXT+0x440,'I')[0] if 'materialize' in calls else None,calls=calls))
budget_js=r"""
import {Simulation} from './src/simulation.js';import {GAME_TABLES} from './src/game-tables.js';
let fixtures=JSON.parse(await new Promise(resolve=>{let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>resolve(s))}));
console.log(JSON.stringify(fixtures.map(f=>{let sim=new Simulation({round:f.round}),r=sim.runners[1],calls=[];sim.aiRouteCounts=[...f.counts];r.navigation={goalColor:f.goal,routeIndex:1,segment:{startNode:0}};
 sim.population.nextInactive=()=>{calls.push('scan');return f.replacement?sim.runners[5]:null};let next=sim.population.replace(r);if(next)calls.push('materialize');
 return {counts:sim.aiRouteCounts,nextGoal:next?GAME_TABLES.ai.navigation.routeColors[next.respawn.routeIndex]:null,calls};})));"""
rebuilt_budgets=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js','--input-type=module','-e',budget_js],input=json.dumps(budget_fixtures).encode(),cwd=ROOT))
budget_mismatches=[dict(fixture=i,native=a,rebuild=b) for i,(a,b) in enumerate(zip(native_budgets,rebuilt_budgets)) if a!=b]
report=dict(scope='Controlled single-player AI exit eligibility and dispatch comparison against original x86. Synthetic profile/exitspot and visual/cleanup stubs; not a native rendered exit.',
 emulator='Unicorn '+unicorn_version,executable=str(EXE.relative_to(ROOT)),sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),
 originalFunctions=['0x434e9c','0x42fed4','0x42d9a0','0x433b2c'],budgetFixtures=budget_fixtures,nativeBudgets=native_budgets,rebuildBudgets=rebuilt_budgets,budgetMismatches=budget_mismatches,fixtures=fixtures,native=native,rebuild=rebuilt,discreteMismatches=mismatches,passed=not mismatches and not budget_mismatches,
 stubs=['Runtime mode and AI/qualification profile lookups','Exitspot node-name comparison','Remaining-time getter','Cleanup, inactive-model scan and materialization requests','Renderer/transform/effect actions and health getter/setter'],
 limitations=['Original scene intersection and visual transforms are not executed.','Cleanup and replacement requests are captured as calls; native profile/route reset details and scene update ordering require further comparison.','No overall similarity percentage is inferred.'])
(ROOT/'private/verification/opponent-exit-native-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(fixtures=len(fixtures),budgetFixtures=len(budget_fixtures),mismatches=mismatches,budgetMismatches=budget_mismatches,passed=report['passed']),indent=2))
if not report['passed']:raise SystemExit(1)
