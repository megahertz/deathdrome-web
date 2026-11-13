"""Execute original face-side import and segment/altitude polygon predicates."""
import json,struct,math,subprocess,hashlib
from native_ai_audit import Native,ROOT,EXE,RUNNER,f32
def bits(i):return struct.unpack('<f',struct.pack('<I',i))[0]
n=Native();n.write(0x95f8a4,'I',RUNNER+0x2000);flags=[]
for draw in range(5):
 raw=bytearray(80);raw[14]=draw;raw[24:26]=b'\xff\xff';n.cpu.mem_write(RUNNER,bytes(raw));n.call(0x4675b8,eax=RUNNER+0x4000,edx=RUNNER);flags.append({'drawType':draw,'twoSided':bool(n.read(0x490b93,'B')[0])})
faces=[{'name':'square','v':[[0,0,0],[10,0,0],[10,10,0],[0,10,0]],'drawType':0}]
for arena in range(1,9):
 data=json.loads((ROOT/f'private/assets/models/arena{arena}.json').read_text());selected=[f for f in data['meshes'] if '/port' in f['name']]
 faces+=selected[::max(1,len(selected)//60)]
fixtures=[];native=[];polygons=[]
for polygon,face in enumerate(faces):
 v=[[f32(x) for x in p[:3]] for p in face['v']];n.write(RUNNER,'f'*(len(v)*3),*(x for p in v for x in p))
 polygons.append({'name':face['name'],'vertices':v})
 # Obtain the actual original first-three-vertex normal for probe generation.
 from unicorn.x86_const import UC_X86_REG_ESI
 n.cpu.reg_write(UC_X86_REG_ESI,RUNNER+0x800);n.call(0x458518,eax=RUNNER,edx=RUNNER+12,ebx=RUNNER+24);normal=n.read(RUNNER+0x800,'fff')
 center=[sum(p[i] for p in v)/len(v) for i in range(3)]
 points=[center,v[0],[(v[0][i]+v[1][i])/2 for i in range(3)]]
 for point in points:
  for source,target in [(2,-2),(-2,2),(2,0),(0,-2),(-2,0),(0,2)]:
   a=[f32(point[i]+source*normal[i]) for i in range(3)];b=[f32(point[i]+target*normal[i]) for i in range(3)]
   for two in [False,True]:
    n.write(RUNNER+0x900,'fff',*a);n.write(RUNNER+0x920,'fff',*b);n.cpu.mem_write(RUNNER+0x800,b'\0'*32)
    hit=bool(n.call(0x46bb8c,[bits(len(v)),bits(int(two))],eax=RUNNER+0x800,edx=RUNNER+0x900,ebx=RUNNER+0x920,ecx=RUNNER)&255)
    fixtures.append({'polygon':polygon,'from':dict(zip('xyz',a)),'to':dict(zip('xyz',b)),'twoSided':two})
    native.append({'normal':dict(zip('xyz',n.read(RUNNER+0x800,'fff'))),'point':dict(zip('xyz',n.read(RUNNER+0x80c,'fff')))} if hit else None)
script="""import {prepareFacet,intersectFacet} from './src/scene-facets.js';let s='';for await(const c of process.stdin)s+=c;const q=JSON.parse(s),facets=q.polygons.map(p=>[prepareFacet(p.vertices,false),prepareFacet(p.vertices,true)]);console.log(JSON.stringify(q.fixtures.map(f=>intersectFacet(facets[f.polygon][+f.twoSided],f.from,f.to))));"""
rebuild=json.loads(subprocess.run(['node','--import','./utils/tests/setup.js','--input-type=module','-e',script],cwd=ROOT,input=json.dumps({'polygons':polygons,'fixtures':fixtures}),text=True,capture_output=True,check=True).stdout)
mismatches=[];maximum=0
for i,(a,b) in enumerate(zip(native,rebuild)):
 error=max(abs(a[k][axis]-b[k][axis]) for k in ['normal','point'] for axis in 'xyz') if a and b else 0;maximum=max(maximum,error)
 if bool(a)!=bool(b) or error>1e-5:mismatches.append({'fixture':i,'name':polygons[fixtures[i]['polygon']]['name'],'native':a,'rebuild':b,'error':error})
report={'scope':'Original 4675b8 face-side import and 46bb8c convex polygon segment predicate, with decoded float vertices from all eight arena portals. Interior, vertex, edge and plane-endpoint probes, both side flags.','sha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'sideFlags':flags,'cases':len(fixtures),'polygons':polygons,'fixtures':fixtures,'native':native,'rebuild':rebuild,'maximumNumericError':maximum,'mismatches':mismatches,'passed':not mismatches,'limitations':['This is a facet-level comparison, not the native scene collector, object hierarchy, spatial grid or hit order.','World transforms and renderer batching remain separate. Numeric tolerance 0.00001.']}
(ROOT/'private/verification/surface-facets-native.json').write_text(json.dumps(report,separators=(',',':'))+'\n');print(json.dumps({'cases':len(fixtures),'mismatches':len(mismatches),'maximumNumericError':maximum,'examples':mismatches[:3]}))
if mismatches:raise SystemExit(1)
