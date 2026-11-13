"""Compare original altitude polygon action 46b688 with renderer eligibility.

This executes the original convex polygon test directly with decoded vertices.
It does not substitute a guessed upward-normal rule for the reference result.
Whole-scene traversal, transforms and polygon edge tolerances remain separate.
"""
import json,struct,subprocess,hashlib
from native_ai_audit import Native,ROOT,EXE,RUNNER,f32

def bits(value):return struct.unpack('<f',struct.pack('<I',value))[0]
fixtures=[]
synthetic=[('floor',[[0,2,0],[0,2,10],[10,2,10],[10,2,0]]),('ceiling',[[0,7,0],[10,7,0],[10,7,10],[0,7,10]]),('steep slope',[[0,0,0],[0,100,10],[10,100,10],[10,0,0]]),('vertical footprint',[[0,2,0],[0,12,0],[0,12,10],[0,2,10]]),('tiny clockwise face',[[0,2,0],[.001,2,0],[0,2,.001]])]
for name,v in synthetic:fixtures.append({'name':name,'v':v})
for arena in range(1,9):
 data=json.loads((ROOT/f'private/assets/models/arena{arena}.json').read_text())
 for face in data['meshes']:
  if '/port' not in face['name'] or not face['altitude'] or '/open' in face['name'] or '/lock' in face['name']:continue
  # Include vertical and degenerate X/Z footprints. The native tolerance can
  # accept these exactly on their edge; filtering by normal.y loses that case.
  v=face['v']
  fixtures.append({'name':face['name'],'v':[p[:3] for p in v]})
n=Native()
for fixture in fixtures:
 v=[[f32(c) for c in p] for p in fixture['v']];fixture['v']=v
 x=f32(sum(p[0] for p in v)/len(v));z=f32(sum(p[2] for p in v)/len(v));fixture.update(x=x,z=z)
 n.write(RUNNER,'f'*(len(v)*3),*(c for p in v for c in p));n.cpu.mem_write(RUNNER+0x800,b'\0'*32)
 hit=bool(n.call(0x46b688,[x,z,bits(RUNNER),bits(len(v))],eax=RUNNER+0x800)&255)
 fixture['native']={'hit':hit,'height':n.read(RUNNER+0x810,'f')[0] if hit else None,'normal':list(n.read(RUNNER+0x800,'fff')) if hit else None}
script="""import {View,THREE,makeModel} from './src/renderer.js';let s='';for await(const c of process.stdin)s+=c;console.log(JSON.stringify(JSON.parse(s).map(f=>{let root=makeModel({meshes:[{...f,v:f.v.map(p=>[...p,0,0])}]}),view=Object.assign(Object.create(View.prototype),{arenaGroup:root,ray:new THREE.Raycaster(),collisionMaterials:new Map()});root.traverse(o=>{if(o.material)view.collisionMaterials.set(o.material,o.material.side)});root.updateMatrixWorld(true);let hits=view.ground(f.x,f.z,200,true),hit=hits[0];root.traverse(o=>{o.geometry?.dispose();o.material?.dispose()});return {hit:!!hit,height:hit?.height??null,normal:hit?Object.values(hit.normal):null}})));"""
rebuilt=json.loads(subprocess.run(['node','--import','./utils/tests/setup.js','--input-type=module','-e',script],cwd=ROOT,input=json.dumps(fixtures),text=True,capture_output=True,check=True).stdout)
mismatches=[];maximum=0
for i,(fixture,b) in enumerate(zip(fixtures,rebuilt)):
 a=fixture['native'];error=max([abs(a['height']-b['height']),*(abs(x-y) for x,y in zip(a['normal'],b['normal']))]) if a['hit'] and b['hit'] else 0
 maximum=max(maximum,error)
 if a['hit']!=b['hit'] or error>1e-4:mismatches.append({'fixture':i,'name':fixture['name'],'native':a,'rebuild':b,'numericError':error})
report={'scope':'Original altitude facet action 46b688 on supplied float vertices; actual decoded portal polygons in all eight arenas, including vertical footprints, plus steep slope and tiny clockwise face.','sha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'cases':len(fixtures),'fixtures':fixtures,'rebuild':rebuilt,'maximumNumericError':maximum,'mismatches':mismatches,'passed':not mismatches,'limitations':['Scene collector/hierarchy traversal, external references and dynamic poses are outside this comparison.','Representative polygon center/vertical-footprint points, not every point or edge offset. Numeric tolerance 0.0001 for supplied float geometry.']}
(ROOT/'private/verification/ground-facets-native.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'cases':len(fixtures),'mismatches':len(mismatches),'examples':mismatches[:3]}))
if mismatches:raise SystemExit(1)
