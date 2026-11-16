"""Compare original 417408 radar projection, edge selection and integer stores."""
import json,math,struct,subprocess,hashlib
from native_ai_audit import Native,ROOT,EXE,RUNNER,f32
n=Native();n.write(0x48bf8c,'i',156);fixtures=[];native=[]
for yaw in [0,30,45,90,135,180,225,270,359]:
 for ox,oz in [(0,0),(187.23,-352.19)]:
  for dx,dz in [(0,0),(100,0),(-100,0),(0,100),(0,-100),(1000,2000),(-2000,1000),(307.6923,0),(-318.6813,0),(0,175.8242),(0,-175.8242),(300,170)]:
   origin={'x':f32(ox),'z':f32(oz)};target={'x':f32(ox+dx),'z':f32(oz+dz)};forward={'x':f32(-math.sin(math.radians(yaw))),'z':f32(-math.cos(math.radians(yaw)))};fixture={'origin':origin,'target':target,'forward':forward};fixtures.append(fixture)
   for offset,p in [(0,origin),(0x100,target),(0x200,forward)]:n.write(RUNNER+offset,'fff',p['x'],0.,p['z'])
   pointer=lambda p:struct.unpack('<f',struct.pack('<I',p))[0]
   n.call(0x417408,[pointer(RUNNER+0x100),pointer(RUNNER+0x308)],eax=RUNNER+0x300,edx=RUNNER+0x304,ebx=RUNNER,ecx=RUNNER+0x200)
   x,y,edge=n.read(RUNNER+0x300,'iii');native.append({'x':x,'y':y,'edge':edge})
js="""import {projectRadar} from './src/hud-radar.ts';let s='';for await(const c of process.stdin)s+=c;console.log(JSON.stringify(JSON.parse(s).map(f=>projectRadar(f.origin,f.target,f.forward))));"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],cwd=ROOT,input=json.dumps(fixtures).encode()));mismatches=[{'fixture':i,'native':a,'rebuild':b} for i,(a,b) in enumerate(zip(native,rebuilt)) if a!=b]
report={'scope':'Actual original radar projection 417408, with supplied float poses and planar forward vectors. No scene visibility or native zone-generation comparison.','sha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'fixtures':fixtures,'native':native,'rebuild':rebuilt,'mismatches':mismatches,'passed':not mismatches}
(ROOT/'private/verification/hud-radar-native.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'cases':len(fixtures),'mismatches':len(mismatches),'examples':mismatches[:3]}))
if mismatches:raise SystemExit(1)
