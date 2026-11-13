"""Compare source polygon cleanup with original x86 46247c, including UVs."""
import hashlib,json,struct
from native_ai_audit import ROOT,EXE,f32
from native_gamegen_loader import GameGenLoader
from export_models import decode,files,clean_polygon,ID,mul,trans

def bits(value):return struct.unpack('<f',struct.pack('<I',value))[0]
n=GameGenLoader();base=n.reserve(0x10000);count=base;positions=base+0x100;aux=base+0x1000;uv=base+0x2000;aux2=base+0x3000;uv2=base+0x4000
cases=0;changed=[];mismatches=[];digest=hashlib.sha256()
def check(vertices,label,matrix=ID,arena=None,path=None):
    global cases
    if len(vertices)>64:raise ValueError('Polygon larger than supplied scratch arrays')
    source=[[f32(x) for x in v[:3]]+v[3:] for v in vertices]
    n.cpu.mem_write(base,b'\0'*0x5000);n.write(count,'I',len(source))
    n.write(positions,'f'*(3*len(source)),*(x for p in source for x in p[:3]))
    n.write(uv,'f'*(2*len(source)),*(x for p in source for x in p[3:5]))
    n.call(0x46247c,[bits(uv),bits(aux2),bits(uv2)],eax=count,edx=positions,ebx=aux)
    size=n.read(count,'I')[0];native=[list(n.read(positions+i*12,'3f'))+list(n.read(uv+i*8,'2f')) for i in range(size)]
    rebuilt=clean_polygon(source);cases+=1;digest.update(json.dumps({'source':source,'native':native},separators=(',',':')).encode())
    if native!=rebuilt:mismatches.append({'name':label,'source':source,'native':native,'rebuild':rebuilt})
    if size!=len(source):
        changed.append({'name':label,'arena':arena,'path':path,'source':source,'native':native,
            'world':[[f32(x) for x in trans(matrix,p)]+p[3:] for p in native]})

for arena in range(1,9):
    data=decode(files[f'arena{arena}.gam'],'',source_tree=True)
    def walk(node,m=ID,path=[]):
        m=mul(m,node.get('matrix',ID));path=path+[node['name']]
        if 'vertices' in node:check(node['vertices'],node['name'],m,arena,'/'.join(path))
        if 'instance' in node:walk(data['sourceInstances'][node['instance']],m,path)
        for child in node['children']:walk(child,m,path)
    walk(data['sourceTree'])
for height in [0,.00009,.0001,.00010001,.001,.1,1]:
    for duplicate in [False,True]:
        points=[[0,0,0],[5,height,0],[10,0,0],[10,0,10],[0,0,10]]
        if duplicate:points.insert(2,points[1])
        check([p+[float(i),float(-i)] for i,p in enumerate(points)],'synthetic '+str((height,duplicate)))
report={'scope':'Original 46247c removes redundant vertices and shifts original UVs. All source polygons visited by the eight arena source trees, plus duplicate/near-collinear cases. Host allocation/CRT services and source decoding are supplied. Native full GameGen scene and non-convex polygon splitting are separate checks.',
    'sha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'cases':cases,'traceSha256':digest.hexdigest(),
    'changed':changed,'mismatches':mismatches,'passed':not mismatches}
(ROOT/'private/verification/polygon-cleanup-native.json').write_text(json.dumps(report,separators=(',',':'))+'\n')
print(json.dumps({'cases':cases,'changed':len(changed),'mismatches':len(mismatches),'examples':mismatches[:2]}),flush=True)
if mismatches:raise SystemExit(1)
