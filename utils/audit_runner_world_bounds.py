"""Compare loaded/posed runner World AABBs and cell assignment.

Native GameGen import, dirty bounds propagation and World relocation execute.
Poses are supplied; this is not a complete controller/scene scheduling audit.
"""
import json,hashlib,subprocess,math
from native_runner_queries import RunnerQueries
from native_ai_audit import ROOT,EXE,f32
NAMES=['redrunr','blurunr','ylwrunr','whtrunr','prprunr','grnrunr','pnkrunr','orgrunr']
def main():
 fixtures=[];native=[]
 for model,name in enumerate(NAMES):
  n=RunnerQueries(name)
  for i in range(24):
   yaw=[0,30,90,180,270,359.9][i%6];pitch=[0,7.5,-7.5][i%3];roll=[0,5,-5][i%3];turn=[0,200,-200][i%3];cockpit=f32(f32(turn)*f32(.12));position=[[100,0,100],[-128,10,128],[0,0,0],[895,0,-895]][i//6]
   n.pose(yaw,pitch,roll,cockpit);n.call(0x45a6bc,position,eax=n.root);n.update()
   corners=[list(n.read(n.root+0x74+j*12,'3f'))for j in range(8)]
   fixtures.append(dict(model=model,name=name,x=position[0],y=position[1],z=position[2],yaw=yaw,pitch=pitch,roll=roll,turn=turn))
   native.append({'min':[min(p[k]for p in corners)for k in range(3)],'max':[max(p[k]for p in corners)for k in range(3)],'partition':list(n.read(n.root+0x60,'2i'))})
 js=r"""import fs from 'node:fs';import {runnerWorldBounds} from './src/runner-query.js';import {worldPartition} from './src/world-partition.js';let input='';for await(const c of process.stdin)input+=c;const models=new Map();console.log(JSON.stringify(JSON.parse(input).map(f=>{if(!models.has(f.name))models.set(f.name,JSON.parse(fs.readFileSync('private/assets/models/'+f.name+'.json')));const bounds=runnerWorldBounds(models.get(f.name).queryBounds,{id:f.model,x:f.x,y:f.y,z:f.z,yaw:f.yaw*Math.PI/180,chassisPitchDegrees:f.pitch,chassisRollDegrees:f.roll,turn:f.turn*Math.PI/180});return {...bounds,partition:worldPartition(bounds.min,bounds.max)??[-1,-1]}})));"""
 rebuild=json.loads(subprocess.check_output(['node','--input-type=module','-e',js],cwd=ROOT,input=json.dumps(fixtures).encode()))
 mismatches=[];maximum=0
 for i,(a,b)in enumerate(zip(native,rebuild)):
  error=max(abs(a[k][j]-b[k][j])for k in ['min','max']for j in range(3));maximum=max(maximum,error)
  if error>1e-4 or a['partition']!=b['partition']:mismatches.append({'case':i,'native':a,'rebuild':b,'error':error})
 report=dict(scope=__doc__,sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),cases=len(fixtures),fixtures=fixtures,native=native,mismatchCount=len(mismatches),mismatches=mismatches[:8],maximumNumericError=maximum,tolerance=1e-4,passed=not mismatches,limits=['Supplied finite poses; no complete physical controller, hit handling or other actors.','World relocation executes but this audit does not compare multi-actor insertion order.'])
 (ROOT/'private/verification/runner-world-bounds-native.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k]for k in ['cases','mismatchCount','mismatches','maximumNumericError','passed']},indent=2))
 if mismatches:raise SystemExit(1)
if __name__=='__main__':main()
