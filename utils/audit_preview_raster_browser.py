"""Compare exported production floor/composite PNGs with native floor draws.

Native reference frames use the reconstruction's supplied model/camera pose.
A geometric raycast excludes car-covered pixels and coplanar contact shadows
from the composite comparison;
there are no texel-boundary exclusions. This is not a complete-frame audit.
"""
from pathlib import Path
import json,subprocess,hashlib
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
script="""import fs from 'node:fs';import {THREE} from './src/renderer.js';import {makeRunnerPreview,stepRunnerPreview} from './src/runner-preview.js';const data=JSON.parse(fs.readFileSync('private/assets/models/pnkrunr.json'));data.meshes=data.meshes.map(f=>({...f,texture:null,cycle:undefined}));let result=[];for(const angle of [0,90]){const root=makeRunnerPreview(data);stepRunnerPreview(root,angle*Math.PI/90);root.updateMatrixWorld(true);const camera=new THREE.PerspectiveCamera(18,Math.tan(31*Math.PI/180)/Math.tan(9*Math.PI/180),1.5,1024);camera.position.set(0,2.3,10);camera.rotation.set(-10*Math.PI/180,0,0);camera.updateMatrixWorld(true);const ray=new THREE.Raycaster(),mask=[];for(let y=0;y<58;y++)for(let x=0;x<187;x++){ray.setFromCamera(new THREE.Vector2(2*(x+.5)/187-1,1-2*(y+.5)/58),camera);const hits=ray.intersectObject(root,true),floor=hits.find(h=>h.object.userData.runnerLight);mask.push(!!floor&&!hits.some(h=>!h.object.userData.runnerLight&&h.distance<=floor.distance+1e-5))}result.push(mask)}console.log(JSON.stringify(result));"""
masks=json.loads(subprocess.run(['node','--import','./utils/tests/setup.js','--input-type=module','-e',script],cwd=ROOT,capture_output=True,text=True,check=True).stdout)
frames=[]
for angle,mask in zip([0,90],masks):
    native=Image.open(ROOT/f'private/verification/video/menu-floor-native-{angle}.png').convert('RGBA');floor=Image.open(ROOT/f'private/verification/video/menu-floor-browser-{angle}.png').convert('RGBA');composite=Image.open(ROOT/f'private/verification/video/native-floor-preview-{angle}.png').convert('RGBA')
    assert native.size==floor.size==(187,58) and composite.size==(320,200)
    gold=list(native.get_flattened_data());actual=list(floor.get_flattened_data());floor_errors=sum(a!=b for a,b in zip(gold,actual));tested=0;errors=[]
    for i,expected in enumerate(gold):
        if not mask[i] or expected[:3]==(0,0,0):continue
        x,y=i%187,i//187;got=composite.getpixel((x+66,y+55));tested+=1
        if got!=expected:errors.append({'pixel':[x+66,y+55],'expected':list(expected),'actual':list(got)})
    frames.append({'heading':angle,'floorPixelsCompared':len(gold),'floorPixelMismatches':floor_errors,'unoccludedCompositePixels':tested,'compositeMismatches':len(errors),'examples':errors[:6],'floorRGBASha256':hashlib.sha256(floor.tobytes()).hexdigest(),'passed':floor_errors==0 and len(errors)==0 and tested>1000})
report={'scope':__doc__,'contactShadowExclusionTolerance':1e-5,'frames':frames,'passed':all(f['passed'] for f in frames),'limits':['Occluded body pixels are outside scope. Original model/camera transforms, original draw eligibility, priority and native scene lighting remain unverified.']}
(ROOT/'private/verification/menu-floor-raster-browser.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
if not report['passed']:raise SystemExit(1)
