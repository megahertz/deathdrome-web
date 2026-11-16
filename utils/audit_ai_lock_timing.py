"""Compare consecutive original attack actions across lock acquisition/loss.

Original steering/firing/cycling code runs with supplied poses, lock pointers,
contact flags and clear/blocked forward probes. Dispatch side effects are
counted rather than creating native projectiles. Full scene scheduling and
missile target scanning are separate from this controller timing comparison.
"""
import json,hashlib,subprocess
from native_ai_attack import AttackNative
from native_ai_audit import ROOT,EXE,f32,RUNNER

def main():
    fixtures=[]
    for level in range(8):
      for weapon in range(7):
       for initialHeld in [False,True]:
        steps=[{'clock':7,'lock':0,'contactClear':False},{'clock':7.1,'lock':0,'probeClear':False},{'clock':7.2,'lock':0},{'clock':8,'lock':0},{'clock':10.2,'lock':0},{'clock':10.21,'lock':0},{'clock':10.3,'lock':None},{'clock':10.4,'lock':0},{'clock':13.4,'lock':0},{'clock':13.41,'lock':0},{'clock':14,'lock':None},{'clock':15,'lock':None,'enabled':False},{'clock':16,'lock':0,'enabled':False},{'clock':20,'lock':0}]
        for step in steps:step['clock']=f32(step['clock'])
        n=AttackNative(level,weapon);n.write(RUNNER+0x6fc,'B',int(initialHeld));states=[n.step(**step) for step in steps]
        fixtures.append({'level':level,'weapon':weapon,'initialHeld':initialHeld,'cells':n.cells,'count':n.count,'steps':steps,'native':states})
    js="""import {Simulation} from './src/simulation.ts';import {stepAIAttack} from './src/ai-actions.ts';import {WEAPON_NAMES,weaponCode} from './src/inventory.ts';import {GAME_TABLES} from './src/game-tables.ts';let input='';for await(const c of process.stdin)input+=c;console.log(JSON.stringify(JSON.parse(input).map(f=>{const sim=new Simulation(),r=sim.runners[1],target=sim.runners[0];sim.countdown=7;Object.assign(r,{x:100,y:0,z:100,yaw:0,speed:30,acceleration:100,weapons:f.cells.slice(0,f.count).map(id=>WEAPON_NAMES[id]),weaponCells:[...f.cells],selectedWeapon:f.weapon===4?0:1});sim.selectWeapon(r);Object.assign(target,{x:100,y:0,z:50,speed:30});Object.assign(r.aiState,{shotAt:0,lockActive:f.initialHeld,previousDirection:{x:0,z:-1}});const shots=[];sim.fire=()=>shots.push(4);sim.secondary=()=>shots.push(weaponCode(r.weapon));return f.steps.map(step=>{shots.length=0;sim.elapsed=step.clock;r.missileLockTarget=step.lock;r.aiContact={clear:step.contactClear!==false};sim.sceneContacts=()=>step.probeClear===false?[{kind:'wall'}]:[];stepAIAttack(sim,r,target,{...GAME_TABLES.ai.levels[f.level],shootEnabled:step.enabled!==false});return {shots:[...shots],selected:r.selectedWeapon,shotAt:r.aiState.shotAt,lockActive:r.aiState.lockActive,lockTarget:r.missileLockTarget}})})));"""
    actual=json.loads(subprocess.run(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],cwd=ROOT,input=json.dumps(fixtures),text=True,capture_output=True,check=True).stdout)
    errors=[]
    for i,(fixture,states) in enumerate(zip(fixtures,actual)):
        for step,(expected,got) in enumerate(zip(fixture['native'],states)):
            if expected!=got:errors.append({'fixture':i,'step':step,'expected':expected,'actual':got})
    report={'scope':__doc__,'executableSha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'sequenceCases':len(fixtures),'attackActions':sum(len(f['steps']) for f in fixtures),'mismatchCount':len(errors),'mismatches':errors[:12],'passed':not errors,'fixtures':fixtures}
    (ROOT/'private/verification/ai-lock-timing-native.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['sequenceCases','attackActions','mismatchCount','mismatches','passed']},indent=2))
    if errors:raise SystemExit(1)
if __name__=='__main__':main()
