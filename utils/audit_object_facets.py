"""Compare first-polygon-per-shape queries with original 46baa0/46b5a0.

Raw object grouping comes from decoded GameGen container records. Native scene
hierarchy, pruning, grid enumeration and BBOX dispatch are outside this audit.
"""
import json,struct,hashlib,subprocess
from collections import defaultdict
from native_ai_audit import Native,ROOT,EXE,RUNNER,f32

n=Native();shape=RUNNER;polygons=RUNNER+0x1000;indices=RUNNER+0x4000;vertices=RUNNER+0x6000;output=RUNNER+0xe000;start=RUNNER+0xe100;end=start+16
n.write(0x490ce0,'I',RUNNER+0x9000);n.call(0x455d00)
groups=[{'name':'source order through two planes','faces':[
 {'name':'far first','contactObject':'one','contactOrder':0,'drawType':1,'v':[[0,0,0],[10,0,0],[10,10,0],[0,10,0]]},
 {'name':'near second','contactObject':'one','contactOrder':1,'drawType':1,'v':[[0,0,5],[10,0,5],[10,10,5],[0,10,5]]} ]},
 {'name':'source order through stacked floors','faces':[
 {'name':'low first','contactObject':'one','contactOrder':0,'drawType':0,'v':[[0,2,0],[0,2,10],[10,2,10],[10,2,0]]},
 {'name':'high second','contactObject':'one','contactOrder':1,'drawType':0,'v':[[0,5,0],[0,5,10],[10,5,10],[10,5,0]]} ]}]
for arena in range(1,9):
    data=json.loads((ROOT/f'private/assets/models/arena{arena}.json').read_text());objects=defaultdict(list)
    for face in data['meshes']:objects[face['contactObject']].append(face)
    selected=[faces for faces in objects.values() if 2<=len(faces)<=40]
    for faces in selected[::max(1,len(selected)//28)]:
        groups.append({'name':faces[0]['name'].rsplit('/',1)[0],'faces':[{k:f[k] for k in ['name','contactObject','contactOrder','drawType','v']} for f in faces]})
fixtures=[];native=[]
for group in groups:
    vv=[];cursor=indices
    for i,face in enumerate(group['faces']):
        v=[[f32(c) for c in p[:3]] for p in face['v']];face['v']=v
        ids=list(range(len(vv),len(vv)+len(v)));vv+=v
        n.write(polygons+i*40+4,'II',len(v),cursor);n.write(polygons+i*40+0x18,'B',face['drawType']&1)
        n.write(cursor,'I'*len(ids),*ids);cursor+=len(ids)*4
    n.write(vertices,'f'*(len(vv)*3),*(c for p in vv for c in p));n.write(shape+8,'II',len(group['faces']),len(vv));n.write(shape+0x20,'II',polygons,vertices)
    points=[]
    for face in [group['faces'][0],group['faces'][-1]]:
        points.append([f32(sum(p[k] for p in face['v'])/len(face['v'])) for k in range(3)])
    for point in points:
        n.cpu.mem_write(output,b'\0'*32);hit=bool(n.call(0x46b5a0,[point[0],point[2]],eax=shape,edx=output)&255)
        fixtures.append({'group':groups.index(group),'kind':'altitude','x':point[0],'z':point[2]})
        native.append({'height':n.read(output+16,'f')[0],'normal':list(n.read(output,'fff'))} if hit else None)
        for axis in range(3):
            for sign in [-1,1]:
                a=point.copy();b=point.copy();a[axis]=f32(a[axis]+30*sign);b[axis]=f32(b[axis]-30*sign)
                n.write(start,'fff',*a);n.write(end,'fff',*b);n.cpu.mem_write(output,b'\0'*32)
                hit=bool(n.call(0x46baa0,eax=shape,edx=output,ebx=start,ecx=end)&255)
                fixtures.append({'group':groups.index(group),'kind':'segment','from':dict(zip('xyz',a)),'to':dict(zip('xyz',b))})
                native.append({'normal':list(n.read(output,'fff')),'point':list(n.read(output+12,'fff'))} if hit else None)
script="""import {View,makeModel} from './src/renderer.js';let s='';for await(const c of process.stdin)s+=c;const {groups,fixtures}=JSON.parse(s),views=groups.map(g=>{const root=makeModel({meshes:g.faces.map((f,i)=>({...f,color:i%2?[1,0,0]:[0,1,0],altitude:true,v:f.v.map(p=>[...p,0,0])}))});root.updateMatrixWorld(true);return Object.assign(Object.create(View.prototype),{arenaGroup:root})});console.log(JSON.stringify(fixtures.map(f=>{const view=views[f.group];if(f.kind==='altitude'){const h=view.ground(f.x,f.z,200,true)[0];return h?{height:h.height,normal:Object.values(h.normal)}:null}const h=view.sweepContacts(f.from,f.to)[0];return h?{normal:Object.values(h.normal),point:Object.values(h.point)}:null})));"""
rebuild=json.loads(subprocess.run(['node','--import','./utils/tests/setup.js','--input-type=module','-e',script],cwd=ROOT,input=json.dumps({'groups':groups,'fixtures':fixtures}),text=True,capture_output=True,check=True).stdout)
mismatches=[];maximum=0
for i,(a,b) in enumerate(zip(native,rebuild)):
    error=max(abs(x-y) for k in a for x,y in zip(a[k] if isinstance(a[k],list) else [a[k]],b[k] if isinstance(b[k],list) else [b[k]])) if a and b else 0
    maximum=max(maximum,error)
    if bool(a)!=bool(b) or error>1e-5:mismatches.append({'fixture':i,'native':a,'rebuild':b,'error':error})
report={'scope':'Original 46baa0 segment and 46b5a0 altitude first-hit-per-shape queries, with decoded multi-polygon objects from all eight arenas and adversarial source/material order fixtures.',
        'sha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'objects':len(groups),'cases':len(fixtures),'groups':groups,'fixtures':fixtures,'native':native,'rebuild':rebuild,'maximumNumericError':maximum,'mismatches':mismatches,'passed':not mismatches,
        'limitations':['Supplied GameGen container grouping and identity world matrix. The native loader, animation, hierarchy pruning, scene grid, BBOX dispatch and inter-object order are not executed.','This is a shape-level comparison, not full original-scene or gameplay equivalence.']}
(ROOT/'private/verification/object-facets-native.json').write_text(json.dumps(report,separators=(',',':'))+'\n')
print(json.dumps({'objects':len(groups),'cases':len(fixtures),'maximumNumericError':maximum,'mismatches':mismatches[:5],'passed':not mismatches}))
if mismatches:raise SystemExit(1)
