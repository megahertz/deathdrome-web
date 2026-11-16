"""Compare loaded original runner chassis boxes with production scene queries.

RUNNER_X.GW's SetIntersectBBOX on chassis is applied to real original-loaded
models. Supplied yaw/chassis/cockpit poses drive native bounds updates and ray
queries. JavaScript imports independently decoded hierarchy bounds. Other
actors, domain geometry, scene scheduling and full runner physics are excluded.
"""
import json,hashlib,random,subprocess,math
from native_runner_queries import RunnerQueries
from native_ai_audit import ROOT,EXE,f32
NAMES=['redrunr','blurunr','ylwrunr','whtrunr','prprunr','grnrunr','pnkrunr','orgrunr']

def main():
    fixtures=[]
    for name in NAMES:
        n=RunnerQueries(name)
        for case in range(15):
            yaw=[0,30,90,180,270][case%5];pitch=[0,7.5,-7.5][case%3];roll=[0,5,-5][case%3];turn=[0,200,-200][case%3];cockpit=f32(f32(turn)*f32(.12));bounds=n.pose(yaw,pitch,roll,cockpit)
            rays=[]
            for j in range(24):
                angle=math.tau*j/24;y=f32([.5,1.5,3,5][j%4]);offset=[0,.75,-.75,2.5,-2.5,5][j%6]
                a={'x':f32(100+math.cos(angle)*25),'y':y,'z':f32(100+math.sin(angle)*25)};b={'x':f32(100+offset),'y':y,'z':f32(100+offset*.5)}
                hits=n.query('sweep',**{'from':a,'to':b});rays.append({'from':a,'to':b,'native':[{'point':h['point'],'normal':h['normal']} for h in hits]})
            fixtures.append({'name':name,'pose':{'yaw':yaw,'pitch':pitch,'roll':roll,'turn':turn},'nativeBounds':bounds,'rays':rays})
        print(name,'complete',flush=True)
    js="""import fs from 'node:fs';import {makeRunnerModel,poseRunnerModel} from './src/renderer.ts';import {segmentFacetHits} from './src/scene-geometry.ts';import {runnerQueryBounds} from './src/runner-query.ts';let input='';for await(const c of process.stdin)input+=c;const fixtures=JSON.parse(input),models=new Map();console.log(JSON.stringify(fixtures.map(f=>{let entry=models.get(f.name);if(!entry){const data=JSON.parse(fs.readFileSync('private/assets/models/'+f.name+'.json'));data.meshes=data.meshes.map(p=>({...p,texture:null,cycle:undefined}));entry={data,model:makeRunnerModel(data)};models.set(f.name,entry)}const p=f.pose,r={id:0,x:100,y:0,z:100,yaw:p.yaw*Math.PI/180,chassisPitchDegrees:p.pitch,chassisRollDegrees:p.roll,turn:p.turn*Math.PI/180,health:100,dead:0,actionMode:1};poseRunnerModel(entry.model,r);const rig=entry.model.userData.runnerRig,bounds=runnerQueryBounds(entry.data.attachments.chassis.collisionBounds,{pitch:rig.cockpit.rotation.x,roll:rig.cockpit.rotation.z});return {bounds,rays:f.rays.map(ray=>segmentFacetHits(entry.model,ray.from,ray.to).map(h=>({point:h.point,normal:h.normal})))}})));"""
    actual=json.loads(subprocess.run(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],cwd=ROOT,input=json.dumps(fixtures),text=True,capture_output=True,check=True).stdout)
    bounds_errors=[];count_errors=[];maximum=0;numeric_errors=[]
    for i,(fixture,got) in enumerate(zip(fixtures,actual)):
        if fixture['nativeBounds']!=got['bounds']:bounds_errors.append({'case':i,'expected':fixture['nativeBounds'],'actual':got['bounds']})
        for j,(ray,hits) in enumerate(zip(fixture['rays'],got['rays'])):
            if len(ray['native'])!=len(hits):count_errors.append({'case':i,'ray':j,'expected':len(ray['native']),'actual':len(hits)});continue
            for a,b in zip(ray['native'],hits):
                error=max(abs(a[k][axis]-b[k][axis]) for k in ['point','normal'] for axis in 'xyz');maximum=max(maximum,error)
                if error>.0001:numeric_errors.append({'case':i,'ray':j,'error':error,'expected':a,'actual':b})
    report={'scope':__doc__,'executableSha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'poseCases':len(fixtures),'rayCases':sum(len(f['rays']) for f in fixtures),'boundsMismatchCount':len(bounds_errors),'hitCountMismatchCount':len(count_errors),'maximumNumericError':maximum,'numericTolerance':.0001,'numericMismatchCount':len(numeric_errors),'boundsMismatches':bounds_errors[:8],'hitCountMismatches':count_errors[:12],'numericMismatches':numeric_errors[:8],'passed':not bounds_errors and not count_errors and not numeric_errors,'fixtures':fixtures}
    (ROOT/'private/verification/runner-queries-native.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['poseCases','rayCases','boundsMismatchCount','hitCountMismatchCount','maximumNumericError','numericMismatchCount','boundsMismatches','hitCountMismatches','numericMismatches','passed']},indent=2))
    if not report['passed']:raise SystemExit(1)
if __name__=='__main__':main()
