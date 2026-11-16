"""Actual result presenter with real profile score/life mutations.

424b70, 418990 score awards, 418f28 life cap, 418efc and 418964 getters run.
Input profiles, kills, remaining time, 60Hz clock and display/audio services
are supplied. Complete gameplay and escape scheduling remain outside scope.
"""
import hashlib, json, subprocess
from audit_results_sequence import capture
from native_ai_audit import ROOT, EXE

fixtures=[{'score':s,'lives':l,'kills':k,'time':t} for s,l,k,t in [
    (0,3,2,133.75),(5300,3,2,133.75),(19500,3,3,64.9),
    (18000,3,2,0),(17999,3,2,0),(39950,6,2,133.75),
    (19500,7,3,64.9),(19500,3,20,133.75),(0,3,42,0)]]
native=[]
for fixture in fixtures:
    result=capture(profile=fixture)
    credit=next(label['text'] for frame in result['frames'] for label in frame['labels']
        if label['x']==225 and label['y']==125)
    native.append({'score':result['score'],'lives':result['lives'],'credits':int(credit)})
js="""
import {Simulation} from './src/simulation.ts';
let input='';for await(const b of process.stdin)input+=b;
console.log(JSON.stringify(JSON.parse(input).map(f=>{const sim=new Simulation();sim.score=f.score;sim.lives=f.lives;
 const before=sim.lives;sim.addScore(f.kills*1000);sim.addScore(Math.max(0,Math.trunc(f.time))*10);
 return {score:sim.score,lives:sim.lives,credits:Math.max(0,sim.lives-before)};
})));
"""
rebuild=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],cwd=ROOT,input=json.dumps(fixtures).encode()))
mismatches=[{'fixture':i,'native':a,'rebuild':b} for i,(a,b) in enumerate(zip(native,rebuild)) if a!=b]
report={'scope':__doc__,'sha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'fixtures':fixtures,
    'native':native,'rebuild':rebuild,'mismatches':mismatches,'passed':not mismatches}
(ROOT/'private/verification/result-credits-native.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
if mismatches:raise SystemExit(1)
