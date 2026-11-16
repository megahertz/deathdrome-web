"""Original AI region/dormancy gate and model-action dispatch, with action bodies supplied.

Runs 42bb3c and 42f2d0 consecutively. It does not run native physics, AI
steering, geometry, scene traversal or the global scene scheduler.
"""
import hashlib,json,subprocess
from native_ai_audit import ROOT,EXE,f32

from native_ai_activity import ActivityNative

fixtures=[]
for initial in range(4):
 for mode in [0,1]:
  for enabled in [False,True]:
   for mask,playerMask,entranceMask in [(1,1,0),(1,0,1),(1,2,4),(0,0,0),(0x80000000,0x80000000,0)]:
    steps=[]
    for clock in [7,9.999999,10,11.999999,12,12.01]:steps.append(dict(clock=clock,remaining=100,mask=mask,playerMask=playerMask,entranceMask=entranceMask,enabled=enabled))
    for clock,remaining,m,p,e,on in [(13,100,1,1,0,enabled),(13.25,100,1,2,1,enabled),(14,100,1,2,0,enabled),(18.999998,100,1,2,0,enabled),(19,100,1,2,0,enabled),(20,35.000004,1,2,0,enabled),(21,35,1,2,0,enabled),(22,34,1,2,0,enabled),(23,36,1,2,0,enabled),(24,36,1,2,0,False),(29,36,1,2,0,enabled),(30,36,1,1,0,enabled),(31,36,1,2,0,enabled)]:steps.append(dict(clock=clock,remaining=remaining,mask=m,playerMask=p,entranceMask=e,enabled=on))
    for f in steps:f['clock']=f32(f['clock']);f['remaining']=f32(f['remaining'])
    fixtures.append(dict(initial=initial,mode=mode,steps=steps))
native=[]
for f in fixtures:
 n=ActivityNative(f['initial'],f['mode']);native.append([n.step(step) for step in f['steps']])
js=r"""
import {Simulation} from './src/simulation.ts';import {stepAIActivity} from './src/ai-activity.ts';let input='';for await(const c of process.stdin)input+=c;
console.log(JSON.stringify(JSON.parse(input).map(f=>{let events=[],mask=0;const sim=new Simulation({maximumRunners:2,ground:()=>0,wallContact(){events.push('physics');return null}}),r=sim.runners[1];sim.countdown=0;sim.runners.forEach(q=>q.inactive=q.id!==1);Object.assign(r,{x:100,y:0,z:100,aiActivity:f.initial,aiActivityUntil:10,navigation:{}});sim.regions={maskAt:()=>mask};sim.stepRunnerWeapons=()=>events.push('weapons');sim.checkRunnerHealth=()=>events.push('health');sim.ai=()=>{if(stepAIActivity(sim,r))events.push('action');return {}};return f.steps.map(step=>{events=[];mask=step.mask;sim.runners[0].zoneMask=step.playerMask;sim.entranceZoneMask=step.entranceMask;sim.time=step.remaining;sim.elapsed=step.clock-7;r.controlsEnabled=step.enabled;sim.step(0);return {state:r.aiActivity,deadline:r.aiActivityUntil,events:[...events]}})})));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],cwd=ROOT,input=json.dumps(fixtures).encode()))
mismatches=[dict(fixture=i,step=j,native=a,rebuild=b) for i,(aa,bb) in enumerate(zip(native,rebuilt)) for j,(a,b) in enumerate(zip(aa,bb)) if a!=b]
report=dict(scope=__doc__,sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),sequences=len(fixtures),modelActions=sum(len(f['steps']) for f in fixtures),fixtures=fixtures,native=native,mismatches=mismatches[:12],mismatchCount=len(mismatches),passed=not mismatches,limitations=['Native action bodies, physics, weapons and health are counted return stubs. Scene geometry and region sampling are supplied.','The rebuild uses production Simulation.step with an AI action stub calling the production activity helper, plus counted physical/weapon/health adapters. Actual steering, projectile integration and complete scene scheduling are outside this comparison.','Independent barrier, shield, Ion and scene actions are not gated by this wrapper and are not compared here.'])
(ROOT/'private/verification/ai-activity-native.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['sequences','modelActions','mismatchCount','mismatches','passed']},indent=2))
if mismatches:raise SystemExit(1)
