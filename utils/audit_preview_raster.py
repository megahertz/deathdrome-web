"""Compare the production menu floor's complete indexed draw with native code.

Production model and camera transforms supply camera-space vertices. Native
clip/projection/raster routines run independently from those vertices, with the
real unmodified floor texture and source palette. This does not certify native
scene transforms, runner-body rendering, source lighting or complete frames.
"""
import json,subprocess,hashlib,struct,math
from pathlib import Path
from PIL import Image
from audit_polygon_clipping import ClipNative
from native_ai_audit import ROOT,EXE,f32

script="""import fs from 'node:fs';import {THREE} from './src/renderer.js';import {makeRunnerPreview,stepRunnerPreview} from './src/runner-preview.js';import {previewFloorPolygons,MENU_PROJECTION,drawPreviewFloor} from './src/preview-raster.js';import {RUNNERS} from './src/simulation.js';const names=RUNNERS;const report=[];for(const name of names){let path='private/assets/models/'+name+'.json';if(!fs.existsSync(path))continue;const data=JSON.parse(fs.readFileSync(path));data.meshes=data.meshes.map(f=>({...f,texture:null,cycle:undefined}));for(const angle of [0,30,60,90,180,270]){const root=makeRunnerPreview(data);stepRunnerPreview(root,angle*Math.PI/90);const camera=new THREE.PerspectiveCamera(18,1,1.5,1024);camera.position.set(0,2.3,10);camera.rotation.set(-10*Math.PI/180,0,0);const polygons=previewFloorPolygons(root,camera);report.push({name,angle,polygons:polygons.map(({vertices,projected})=>({vertices,projected})),options:MENU_PROJECTION});}}console.log(JSON.stringify(report));"""
fixtures=json.loads(subprocess.run(['node','--import','./utils/tests/setup.js','--input-type=module','-e',script],cwd=ROOT,capture_output=True,text=True,check=True).stdout)
assert len(fixtures)==48
pack=(ROOT/'private/original/game/DATA/TEXTURES/texture.zb').read_bytes();offset=None
for i in range(struct.unpack_from('<I',pack,60)[0]//68):
    name=pack[i*68:i*68+60].split(b'\0')[0].decode().replace('\\','/').lower()
    if name.endswith('/runners/textures/floora1.zim'):offset=struct.unpack_from('<I',pack,i*68+60)[0];break
assert offset is not None
size,width,height=struct.unpack_from('<IHH',pack,offset);pixels=pack[offset+16:offset+16+size]
palette=(ROOT/'private/original/game/RUN/domain.act').read_bytes();assert palette[:3]==b'\0\0\0'
n=ClipNative()
def real_image(size,axis):
    n.cpu.mem_write(n.desc,struct.pack('<IHHBBBBI',width*height,width,height,0x26,0,int(math.log2(width)),int(math.log2(height)),n.tex));n.cpu.mem_write(n.tex,pixels)
n.image=real_image
# Run the original FOV initializer and window projection setup as well.
fov=n.reserve(16);n.write(fov,'4f',93.5,29,62,18);n.call(0x4579d8,eax=fov,edx=fov+8)
cot=n.read(0x95d7b8,'2f');n.call(0x45797c,[66,55,93.5,29,*cot])
projection_scale=list(n.read(0x95d7b8,'2f'))
assert projection_scale==fixtures[0]['options']['scale']
# Graphics detail changes LOD scale, not the camera's authored far distance.
camera=n.reserve(0x200);wrapper=n.reserve(0x48);n.write(wrapper+0x44,'I',camera);n.write(camera+0x74,'2f',.75,1200)
quality=[]
for value in [.3,.35,.4,.5,.7,.8,.9,1.0]:
    n.call(0x45c000,[value],eax=wrapper)
    assert n.read(camera+0x74,'2f')==(.75,1200)
    quality.append({'requested':f32(value),'lodScale':n.read(camera+0x94,'f')[0],'nearFar':list(n.read(camera+0x74,'2f'))})
errors=[]
for i,fixture in enumerate(fixtures):
    frame=bytearray(64000);expected_projected=[]
    # Each runner's source floor is a single authored convex polygon.
    assert len(fixture['polygons'])==1
    for polygon in fixture['polygons']:
        options=fixture['options'];camera=n.camera(polygon['vertices'],options);projected=n.project(camera,options);screen=n.screen(projected,options)
        expected_projected.append(screen)
        if screen!=polygon['projected']:errors.append({'case':i,'kind':'projected vertices'})
        native=n.draw(screen,[width,height],0,16,64)
        # The native harness clears to index 255; change only untouched pixels
        # outside the native spans to palette zero, matching the menu clear.
        touched=set()
        for c in n.commands:
            for x in range(c['x'],c['x']+c['count']):touched.add(c['y']*320+x)
        for position in touched:frame[position]=native[position]
    fixture['nativeFrameHash']=hashlib.sha256(frame).hexdigest()
    if fixture['name']=='pnkrunr' and fixture['angle'] in [0,90]:
        rgba=bytes(v for index in frame for v in [*palette[index*3:index*3+3],255])
        image=Image.frombytes('RGBA',(320,200),rgba);image.crop((66,55,253,113)).save(ROOT/f'private/verification/video/menu-floor-native-{fixture["angle"]}.png')
# Test the shared production draw using original palette indexes. Input resource
# bytes remain local and are never saved into public fixture JSON or a release.
node="""import {drawPreviewFloor} from './src/preview-raster.js';import {createHash} from 'node:crypto';let s='';for await(const c of process.stdin)s+=c;const q=JSON.parse(s),pixels=Uint8Array.from(q.pixels);console.log(JSON.stringify(q.fixtures.map(f=>{const target=new Uint8Array(64000);drawPreviewFloor(target,f.polygons,()=>({width:q.width,height:q.height,pixels}));return createHash('sha256').update(target).digest('hex')})));"""
actual=json.loads(subprocess.run(['node','--import','./utils/tests/setup.js','--input-type=module','-e',node],cwd=ROOT,input=json.dumps({'fixtures':fixtures,'width':width,'height':height,'pixels':list(pixels)}),capture_output=True,text=True,check=True).stdout)
for i,(fixture,value) in enumerate(zip(fixtures,actual)):
    if fixture['nativeFrameHash']!=value:errors.append({'case':i,'kind':'frame hash','expected':fixture['nativeFrameHash'],'actual':value})
report={'scope':__doc__,'executableSha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'floorTextureSha256':hashlib.sha256(pixels).hexdigest(),'nativeProjectionScale':projection_scale,'nativeLODSetterChecks':quality,'cases':len(fixtures),'runnerCount':8,'headings':[0,30,60,90,180,270],'comparedIndexBytes':len(fixtures)*64000,'mismatchCount':len(errors),'mismatches':errors,'passed':not errors,'fixtures':fixtures,'limits':['Camera/model transforms are supplied by the reconstruction. Original scene setup, active clip flags, body occlusion/lighting and animation cadence are not certified.']}
(ROOT/'private/verification/menu-floor-raster-native.json').write_text(json.dumps(report,separators=(',',':'))+'\n')
print(json.dumps({k:report[k] for k in ['cases','runnerCount','comparedIndexBytes','mismatchCount','mismatches','passed']},indent=2))
if errors:raise SystemExit(1)
