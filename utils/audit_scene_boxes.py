"""Execute native box corner construction and 445adc / 46b8d0 queries.

Reference queries use supplied corners, original strict broad-phase overlap,
and the original six-face order. This does not run the native scene loader.
"""
import hashlib,json,math,struct,subprocess
from native_ai_audit import Native,ROOT,EXE,RUNNER,f32

def bits(v):return struct.unpack('<f',struct.pack('<I',v))[0]
n=Native();node=RUNNER;fields=RUNNER+0x400;segment=RUNNER+0x800;bounds=RUNNER+0x900;output=RUNNER+0xa00
n.write(node+0x40,'B',5);n.write(node+0x44,'I',fields);n.write(fields+0x30,'I',1);n.call(0x455d00)
corner_cases=[];boxes=[]
for minimum,maximum in [([0,0,0],[10,20,30]),([-7,-3,-11],[7,9,11]),([0,0,0],[0,20,30]),([0,0,0],[10,0,30]),([0,0,0],[10,20,0])]:
    for degrees in [0,31,90]:
        a=degrees*math.pi/180;c=f32(math.cos(a));s=f32(math.sin(a));matrix=[c,0,-s,0,1,0,s,0,c,12,-4,23]
        n.write(node+0xd4,'I',1);n.write(node+0xd8,'6f',*minimum,*maximum);n.write(node+0xf0,'I',0)
        n.write(fields+0x30,'I',0);n.write(fields+0x38,'12f',*matrix);n.call(0x44bbe0,eax=node)
        corners=[list(n.read(node+0x74+i*12,'3f')) for i in range(8)]
        corner_cases.append({'min':minimum,'max':maximum,'matrix':matrix,'native':corners})
        boxes.append({'name':f'synthetic {len(boxes)}','vertices':corners})
for arena in range(1,9):
    data=json.loads((ROOT/f'private/assets/models/arena{arena}.json').read_text())
    boxes.extend({'arena':arena,**b} for b in data.get('collisionBoxes',[]))
fixtures=[];native=[]
for index,box in enumerate(boxes):
    corners=box['vertices'];n.write(node+0x70,'I',1);n.write(node+0x74,'24f',*(c for p in corners for c in p))
    low=[min(p[i] for p in corners) for i in range(3)];high=[max(p[i] for p in corners) for i in range(3)];center=[f32((low[i]+high[i])/2) for i in range(3)]
    probes=[]
    for axis in range(3):
        for sign in [-1,1]:
            for start_at,end_at in [('outside','outside'),('outside','center'),('center','outside'),('face','center'),('outside','face')]:
                a=center.copy();b=center.copy();a[axis]=f32(low[axis]-20 if sign<0 else high[axis]+20) if start_at=='outside' else low[axis] if start_at=='face' and sign<0 else high[axis] if start_at=='face' else center[axis]
                b[axis]=f32(high[axis]+20 if sign<0 else low[axis]-20) if end_at=='outside' else high[axis] if end_at=='face' and sign<0 else low[axis] if end_at=='face' else center[axis]
                probes.append((a,b))
    for corner in corners:
        a=[f32(c+20) for c in corner];b=[f32(c-20) for c in corner];probes.extend([(a,b),(b,a),(corner,center)])
    probes.append((center,center))
    for a,b in probes:
        n.write(segment,'6f',*a,*b);n.write(bounds,'6f',*[min(x,y) for x,y in zip(a,b)],*[max(x,y) for x,y in zip(a,b)]);n.cpu.mem_write(output,b'\0'*32)
        hit=not bool(n.call(0x445adc,[bits(output)],eax=node,edx=segment,ebx=bounds,ecx=1)&255)
        fixtures.append({'box':index,'from':dict(zip('xyz',a)),'to':dict(zip('xyz',b))})
        native.append({'normal':list(n.read(output,'3f')),'point':list(n.read(output+12,'3f'))} if hit else None)
script="""import {boxCorners,prepareBox,intersectBox} from './src/scene-boxes.ts';let s='';for await(const c of process.stdin)s+=c;const q=JSON.parse(s);const boxes=q.boxes.map(b=>prepareBox(b.vertices));console.log(JSON.stringify({corners:q.cornerCases.map(c=>boxCorners(c.min,c.max).map(p=>[0,1,2].map(i=>Math.fround(c.matrix[i]*p[0]+c.matrix[i+3]*p[1]+c.matrix[i+6]*p[2]+c.matrix[i+9])))),hits:q.fixtures.map(f=>{const h=intersectBox(boxes[f.box],f.from,f.to);return h?{normal:Object.values(h.normal),point:Object.values(h.point)}:null})}));"""
rebuild=json.loads(subprocess.run(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',script],cwd=ROOT,input=json.dumps({'boxes':boxes,'cornerCases':corner_cases,'fixtures':fixtures}),text=True,capture_output=True,check=True).stdout)
mismatches=[];maximum=0
for i,(a,b) in enumerate(zip(native,rebuild['hits'])):
    error=max(abs(x-y) for k in ['normal','point'] for x,y in zip(a[k],b[k])) if a and b else 0;maximum=max(maximum,error)
    if bool(a)!=bool(b) or error>1e-5:mismatches.append({'fixture':i,'native':a,'rebuild':b,'error':error})
for i,(case,b) in enumerate(zip(corner_cases,rebuild['corners'])):
    error=max(abs(x-y) for a,p in zip(case['native'],b) for x,y in zip(a,p));maximum=max(maximum,error)
    if error>1e-5:mismatches.append({'cornerCase':i,'error':error})
report={'scope':'Original 44bbe0 corner construction and 445adc box broad phase with 46b8d0 six-face intersection. Supplied transformed corners from actual arena BBOX objects plus rotated, translated and zero-width synthetic boxes.',
        'sha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'cornerCases':corner_cases,'boxes':boxes,'fixtures':fixtures,'native':native,'rebuild':rebuild,'cases':len(fixtures),'maximumNumericError':maximum,'mismatches':mismatches,'passed':not mismatches,
        'limitations':['Native GameGen loader, child-bound propagation and complete scene collector are not executed. Actual arena boxes use supplied exported corners.','Script-applied runner chassis BBOX and moving child-bound lifecycle are not covered.','This compares box-query components, not full original gameplay or rendering.']}
(ROOT/'private/verification/scene-boxes-native.json').write_text(json.dumps(report,separators=(',',':'))+'\n')
print(json.dumps({'boxes':len(boxes),'cornerCases':len(corner_cases),'queryCases':len(fixtures),'maximumNumericError':maximum,'mismatches':mismatches[:5],'passed':not mismatches}))
if mismatches:raise SystemExit(1)
