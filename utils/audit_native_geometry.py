"""Execute original point transforms and first-three-vertex facing decisions.

Matrices and vertices are supplied synthetic fixtures; this does not certify
native scene hierarchy, camera matrix construction or complete draw eligibility.
"""
import json,random,subprocess,hashlib,math
from native_gamegen_loader import GameGenLoader
from native_ai_audit import ROOT,EXE,f32

def main():
    n=GameGenLoader();points=n.reserve(4096);out=n.reserve(4096);normal=n.reserve(16);front=n.reserve(4);rng=random.Random(0x458930)
    facing=[];transforms=[]
    for i in range(3000):
        vertices=[[f32(rng.uniform(-25,25)) for _ in range(3)] for j in range(3)]
        if i%3==0:
            # A plane viewed near the native +/-0.005 rejection thresholds.
            z=f32([0,.005,-.005,.005000001,-.005000001,.004999999,-.004999999][i%7])
            vertices=[[0,0,z],[1,0,z],[0,1,z]]
        two=bool(i%2);n.write(points,'9f',*(x for p in vertices for x in p));n.write(front,'I',0xabcdef12)
        visible=bool(n.call(0x4585e8,eax=points,edx=normal,ebx=front,ecx=int(two))&255)
        facing.append({'vertices':vertices,'twoSided':two,'native':{'visible':visible,'front':bool(n.read(front,'B')[0]) if visible else None,'normal':list(n.read(normal,'3f'))}})
    n.write(0x490340,'I',1)
    for i in range(1000):
        count=1+i%9;vertices=[[f32(rng.uniform(-1000,1000)) for _ in range(3)] for j in range(count)];matrix=[f32(rng.uniform(-2,2)) for _ in range(12)];identity=i%11==0
        if i%5==0:matrix=[1,0,0,0,-f32(math.cos(.1745329252)),-f32(math.sin(.1745329252)),0,f32(math.sin(.1745329252)),-f32(math.cos(.1745329252)),0,f32(.8829928636550903),f32(8.237475395202637)]
        n.write(0x95cb58+1,'B',int(identity));n.write(0x95cb80+48,'12f',*matrix);n.write(points,'f'*(count*3),*(x for p in vertices for x in p))
        n.call(0x458930,eax=points,edx=out,ebx=count)
        transforms.append({'vertices':vertices,'matrix':matrix,'identity':identity,'native':[list(n.read(out+j*12,'3f')) for j in range(count)]})
    js="""import {nativePolygonFacing,transformNativePoints} from './src/native-geometry.js';let input='';for await(const c of process.stdin)input+=c;const q=JSON.parse(input);console.log(JSON.stringify({facing:q.facing.map(f=>nativePolygonFacing(f.vertices,f.twoSided)),transforms:q.transforms.map(f=>transformNativePoints(f.vertices,f.matrix,f))}));"""
    actual=json.loads(subprocess.run(['node','--import','./utils/tests/setup.js','--input-type=module','-e',js],cwd=ROOT,input=json.dumps({'facing':facing,'transforms':transforms}),text=True,capture_output=True,check=True).stdout)
    errors=[]
    for kind,fixtures in [('facing',facing),('transforms',transforms)]:
        for i,(fixture,got) in enumerate(zip(fixtures,actual[kind])):
            if fixture['native']!=got:errors.append({'kind':kind,'case':i,'expected':fixture['native'],'actual':got})
    report={'scope':__doc__,'executableSha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'facingCases':len(facing),'transformCases':len(transforms),'transformedPoints':sum(len(f['vertices']) for f in transforms),'mismatchCount':len(errors),'mismatches':errors[:15],'passed':not errors,'facing':facing,'transforms':transforms}
    (ROOT/'private/verification/native-geometry.json').write_text(json.dumps(report,separators=(',',':'))+'\n');print(json.dumps({k:report[k] for k in ['facingCases','transformCases','transformedPoints','mismatchCount','mismatches','passed']},indent=2))
    if errors:raise SystemExit(1)
if __name__=='__main__':main()
