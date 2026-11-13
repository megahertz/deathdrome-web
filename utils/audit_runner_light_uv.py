"""Verify stopped production previews' world-registered floor sampling.

Inputs: exported 320x200 lighting-check.html views, NEXUS Z80, headings 0/90.
Camera and viewport come from MENU.GW. A conservative geometry raycast excludes car-covered rays (including
transparent cutouts); camera ray / plane arithmetic predicts UVs independently of the shader.
This does not execute the original texture mapper or rasterizer.
"""
from pathlib import Path
import json,math,subprocess
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
texture=Image.open(ROOT/'private/assets/runners/textures/floora1.png').convert('RGB')
assert texture.size==(128,128)
palette=set(texture.get_flattened_data());images=[];candidates=[]
for angle in [0,90]:
    image=Image.open(ROOT/f'private/verification/video/light-preview-source-{angle}.png').convert('RGB');assert image.size==(320,200);images.append(image)
    candidates.append([(x,y) for y in range(55,113) for x in range(66,253) if image.getpixel((x,y)) in palette])
script="""import fs from 'node:fs';import {THREE} from './src/renderer.js';import {makeRunnerPreview,stepRunnerPreview} from './src/runner-preview.js';
let input='';for await(const c of process.stdin)input+=c;const q=JSON.parse(input),data=JSON.parse(fs.readFileSync('private/assets/models/pnkrunr.json'));data.meshes=data.meshes.map(f=>({...f,texture:null,cycle:undefined}));const result=[];
for(let frame=0;frame<2;frame++){const root=makeRunnerPreview(data);stepRunnerPreview(root,frame*Math.PI);root.updateMatrixWorld(true);const camera=new THREE.PerspectiveCamera(18,Math.tan(31*Math.PI/180)/Math.tan(9*Math.PI/180),.75,1024);camera.position.set(0,2.3,10);camera.rotation.set(-10*Math.PI/180,0,0);camera.updateMatrixWorld(true);const ray=new THREE.Raycaster();result.push(q[frame].map(([x,y])=>{ray.setFromCamera(new THREE.Vector2(2*((x+.5-66)/187)-1,1-2*((y+.5-55)/58)),camera);const hit=ray.intersectObject(root,true)[0];return hit?hit.object.userData.contactNames[hit.faceIndex]:null}));}console.log(JSON.stringify(result));"""
visibility=json.loads(subprocess.run(['node','--import','./utils/tests/setup.js','--input-type=module','-e',script],cwd=ROOT,input=json.dumps(candidates),text=True,capture_output=True,check=True).stdout)
def sample(px,py):
    ndcx=2*((px+.5-66)/187)-1;ndcy=1-2*((py+.5-55)/58)
    rx=ndcx*math.tan(math.radians(31));ry=ndcy*math.tan(math.radians(9));pitch=math.radians(10)
    dy=math.cos(pitch)*ry-math.sin(pitch);dz=-math.sin(pitch)*ry-math.cos(pitch)
    distance=-2.3/dy;x,z=distance*rx,10+distance*dz
    u=(x*.0625)%1;v=(-z*.0625)%1
    edge=min(abs(u*128-round(u*128)),abs(v*128-round(v*128)))
    return texture.getpixel((int(u*128)%128,int((1-v)*128)%128)),edge
frames=[];valid=[]
for frame,angle in enumerate([0,90]):
    total=matches=occluded=boundary=0;examples=[];visible=set()
    for pixel,name in zip(candidates[frame],visibility[frame]):
        if not name or '/lcl_lt/' not in name.lower():occluded+=1;continue
        expected,edge=sample(*pixel)
        if edge<.001:boundary+=1;continue
        total+=1;visible.add(pixel)
        if images[frame].getpixel(pixel)==expected:matches+=1
        elif len(examples)<5:examples.append({'pixel':pixel,'actual':images[frame].getpixel(pixel),'expected':expected})
    valid.append(visible);frames.append({'heading':angle,'testedPixels':total,'matchingPixels':matches,'mismatches':total-matches,'carOccludedCandidates':occluded,'texelBoundaryCandidates':boundary,'passed':total>3000 and total==matches,'examples':examples})
# Each snapshot independently requires over 3,000 checked floor samples.
# The shared set is determined by geometry/occlusion, not an invented pixel quota.
common=valid[0]&valid[1];changed=sum(images[0].getpixel(p)!=images[1].getpixel(p) for p in common)
report={'scope':__doc__,**{k:frames[0][k] for k in ['testedPixels','matchingPixels','mismatches','examples']},'frames':frames,'commonFloorPixels':len(common),'changedCommonFloorPixels':changed,'passed':all(f['passed'] for f in frames) and bool(common) and changed==0,'precisionNote':'Samples within 0.001 texels of an integer boundary are excluded from exact comparisons. The 90-degree candidate image includes car texels with coincident palette colors; raycasts identify those as car geometry, not floor.'}
(ROOT/'private/verification/runner-light-uv-browser.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['frames','commonFloorPixels','changedCommonFloorPixels','passed']},indent=2))
if not report['passed']:raise SystemExit(1)
