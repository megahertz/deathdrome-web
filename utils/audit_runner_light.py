"""Native polygon coverage of the authored runner light; not a raster audit."""
import json,hashlib,math,struct,subprocess
from native_ai_audit import Native,ROOT,EXE,RUNNER,f32
from export_models import decode
names=['redrunr','blurunr','ylwrunr','whtrunr','prprunr','grnrunr','pnkrunr','orgrunr']
paths={p.stem.lower():p for p in (ROOT/'private/original/game/DATA/RUNNERS/MODELS').glob('*') if p.suffix.lower()=='.gam'}
n=Native();fixtures=[];native=[];sources=[];contours=[]
def bits(i):return struct.unpack('<f',struct.pack('<I',i))[0]
for runner,name in enumerate(names):
    data=decode(paths[name],'runners/textures');face=next(f for f in data['meshes'] if '/lcl_lt/lt/' in f['name'].lower());vertices=face['v'];contours.append(data)
    sources.append({'runner':name,'source':str(paths[name].relative_to(ROOT)),'sha256':hashlib.sha256(paths[name].read_bytes()).hexdigest(),'vertices':len(vertices),'bounds':{'minX':min(v[0] for v in vertices),'maxX':max(v[0] for v in vertices),'minZ':min(v[2] for v in vertices),'maxZ':max(v[2] for v in vertices)}})
    points=[(x,z) for x in range(-6,7,2) for z in range(-16,5,2)]
    # Straddle every actual edge, rather than testing only bounding rectangles.
    for i,a in enumerate(vertices):
        b=vertices[(i+1)%len(vertices)];dx,dz=b[0]-a[0],b[2]-a[2];length=math.hypot(dx,dz)
        for sign in [-1,1]:points.append(((a[0]+b[0])/2+sign*.02*dz/length,(a[2]+b[2])/2-sign*.02*dx/length))
    for yaw in [0,.7,math.pi/2,math.pi,5.5]:
        c,s=math.cos(yaw),math.sin(yaw);origin={'x':80,'z':440,'yaw':yaw}
        transformed=[[f32(80+c*v[0]+s*v[2]),0,f32(440-s*v[0]+c*v[2])] for v in vertices]
        n.write(RUNNER,'f'*(len(vertices)*3),*(x for v in transformed for x in v))
        for x,z in points:
            world=[f32(80+c*x+s*z),f32(440-s*x+c*z)]
            n.write(RUNNER+0x900,'3f',world[0],5,world[1]);n.write(RUNNER+0x920,'3f',world[0],-5,world[1])
            hit=bool(n.call(0x46bb8c,[bits(len(vertices)),bits(1)],eax=RUNNER+0x800,edx=RUNNER+0x900,ebx=RUNNER+0x920,ecx=RUNNER)&255)
            fixtures.append({'runner':runner,'x':world[0],'z':world[1],'pose':origin});native.append(hit)
script="""import {runnerLightContour,insideRunnerLight} from './src/runner-light.js';let s='';for await(const c of process.stdin)s+=c;const q=JSON.parse(s),contours=q.models.map(runnerLightContour);console.log(JSON.stringify(q.fixtures.map(f=>insideRunnerLight(contours[f.runner],f.x,f.z,f.pose))));"""
rebuilt=json.loads(subprocess.run(['node','--import','./utils/tests/setup.js','--input-type=module','-e',script],cwd=ROOT,input=json.dumps({'models':contours,'fixtures':fixtures}),text=True,capture_output=True,check=True).stdout)
mismatches=[i for i,(a,b) in enumerate(zip(native,rebuilt)) if a!=b]
old_mismatches=sum(a!=(math.hypot(f['x']-f['pose']['x'],f['z']-f['pose']['z'])<=5.31426) for f,a in zip(fixtures,native))
report={'scope':__doc__,'executableSha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'nativeFunction':'0x46bb8c','sources':sources,'cases':len(fixtures),'fixtures':fixtures,'native':native,'mismatches':mismatches,'oldCircleMismatches':old_mismatches,'passed':not mismatches,'limits':['Source GAM vertices are decoded and analytically posed; the original convex polygon predicate executes.','This does not execute original scene rendering, palette shading, shadow projection, height clipping or the complete light lifecycle.','Brightness gain and vertical range remain provisional; no original-raster equivalence is claimed.']}
(ROOT/'private/verification/runner-light-native.json').write_text(json.dumps(report,separators=(',',':'))+'\n')
print(json.dumps({k:report[k] for k in ['cases','mismatches','oldCircleMismatches','passed']},indent=2))
if mismatches:raise SystemExit(1)
