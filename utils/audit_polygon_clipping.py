"""Compare original camera/window clipping, projection and final opaque pixels.

The original clippers and projector execute without patches. Texture lookup is
replaced with a synthetic indexed image only for the final raster comparison.
Input polygons are supplied camera-space fixtures, not a complete native scene.
"""
import json,random,math,struct,hashlib,subprocess,base64
from pathlib import Path
from audit_texture_spans import SpanNative
from native_ai_audit import ROOT,EXE,f32
from audit_world_texture import bits

class ClipNative(SpanNative):
    def __init__(self):
        super().__init__()
        self.count=self.reserve(4);self.normals=self.reserve(4096);self.colors=self.reserve(4096)
    def camera(self,vertices,options,kind='texture',normals=False):
        count=len(vertices);self.write(self.count,'I',count)
        self.write(self.pos,'f'*(3*count),*(v for p in vertices for v in p[:3]))
        self.write(self.material,'3B',int(normals),int(kind=='color'),int(kind=='texture'))
        channels=2 if kind=='texture' else 3
        target=self.uv if kind=='texture' else self.colors
        self.write(target,'f'*(channels*count),*(v for p in vertices for v in p[3:3+channels]))
        if normals:self.write(self.normals,'f'*(3*count),*(v for p in vertices for v in p[3+channels:]))
        self.call(0x46e900,[options['near'],options['far']])
        ok=self.call(0x46e928,[bits(self.normals),bits(self.uv),bits(self.colors)],eax=options.get('cameraFlags',16),edx=self.material,ebx=self.count,ecx=self.pos)&255
        return self.result(ok,kind,normals)
    def result(self,ok,kind,normals):
        if not ok:return []
        count=self.read(self.count,'I')[0];channels=2 if kind=='texture' else 3;target=self.uv if kind=='texture' else self.colors
        return [list(self.read(self.pos+i*12,'3f'))+list(self.read(target+i*channels*4,'f'*channels))+(list(self.read(self.normals+i*12,'3f')) if normals else []) for i in range(count)]
    def screen(self,vertices,options,kind='texture',normals=False):
        count=len(vertices);self.write(self.count,'I',count)
        self.write(self.pos,'f'*(3*count),*(v for p in vertices for v in p[:3]))
        self.write(self.material,'3B',int(normals),int(kind=='color'),int(kind=='texture'))
        channels=2 if kind=='texture' else 3;target=self.uv if kind=='texture' else self.colors
        self.write(target,'f'*(channels*count),*(v for p in vertices for v in p[3:3+channels]))
        if normals:self.write(self.normals,'f'*(3*count),*(v for p in vertices for v in p[3+channels:]))
        # Native setter takes left, top, right, bottom as floats.
        self.call(0x46f040,options.get('bounds',[0,0,320,200]))
        ok=self.call(0x46f1a8,[bits(self.normals),bits(self.uv),bits(self.colors)],eax=options.get('flags',15),edx=self.material,ebx=self.count,ecx=self.pos)&255
        return self.result(ok,kind,normals)
    def project(self,vertices,options):
        count=len(vertices)
        self.write(self.pos,'f'*(3*count),*(v for p in vertices for v in p[:3]))
        for address,name in [(0x95d7b8,'scale'),(0x95caf0,'center'),(0x95d180,'offset')]:self.write(address,'2f',*options[name])
        self.call(0x458b78,eax=self.pos,edx=self.transformed,ebx=count)
        points=[]
        for i,p in enumerate(vertices):
            projected=list(self.read(self.transformed+i*12,'3f'));q=projected[2]
            points.append(projected+[f32(p[3]*q),f32(p[4]*q)]+p[5:])
        return points
    def draw(self,vertices,size,axis,delta,far):
        # Already weighted U/V from the native projection and screen clipper.
        self.commands=[];self.image(size,axis)
        self.call(0x44cd24,eax=delta);self.call(0x44cd08,[far])
        self.write(0x491034,'I',self.pool);self.cpu.mem_write(self.rows,bytes(self.height*4))
        self.cpu.mem_write(self.frame,bytes([255])*(self.width*self.height))
        if vertices:
            self.write(self.pos,'f'*(len(vertices)*3),*(v for p in vertices for v in p[:3]))
            self.write(self.uv,'f'*(len(vertices)*2),*(v for p in vertices for v in p[3:5]))
            self.call(0x44c514,[bits(0),bits(len(vertices)),bits(0)],eax=0,edx=self.pos,ebx=self.uv,ecx=self.col)
        return bytes(self.cpu.mem_read(self.frame,self.width*self.height))

def main():
    n=ClipNative();rng=random.Random(0x46e928);fixtures=[]
    for i in range(540):
        count=3+i%12;angle=rng.uniform(0,math.tau);cx,cy=rng.uniform(-40,340),rng.uniform(-30,230);rx,ry=rng.uniform(4,240),rng.uniform(4,180)
        vertices=[];kind='color' if i%3==1 else 'texture';channels=3 if kind=='color' else 2;normals=i%2==0
        for j in range(count):
            a=angle+j*math.tau/count
            x,y=cx+rx*math.cos(a),cy+ry*math.sin(a)
            z=.5+.7*math.cos(a) if i<180 else rng.uniform(-2,6)
            if i%9==0:z=350
            if i%9==1:z=.75
            if i%9==2:z=.75+(-1 if j%2 else 1)*2**-23
            attr=[rng.uniform(-3,4) for _ in range(channels+(3 if normals else 0))]
            vertices.append([f32(x),f32(y),f32(z),*map(f32,attr)])
        if i%2:vertices.reverse()
        options={'near':f32(.75 if i%4 else .1),'far':f32(350),'bounds':[0,0,320,200] if i%3 else [10.25,4.5,300.75,180.125], 'flags':i%16 if i>=360 else 15,'cameraFlags':16 if i%7 else 0}
        if i>=500:
            v=[0,319,199,320,200,318.9999694824219,198.99998474121094,319.0000305175781][i%8]
            vertices=[[v,0,1,0,0],[320,v,1,1,0],[160,200,1,.5,1]];kind='texture';normals=False
        camera=n.camera(vertices,options,kind,normals)
        screen=n.screen(vertices,options,kind,normals)
        fixtures.append({'vertices':vertices,'options':options,'kind':kind,'normals':normals,'camera':camera,'screen':screen})
    projection=[];pipeline=[];browser=[]
    for i in range(160):
        count=3+i%7;angle=rng.uniform(0,math.tau)
        vertices=[];radius=rng.uniform(4,12)
        for j in range(count):
            a=angle+j*math.tau/count;x,y=math.cos(a)*radius,math.sin(a)*5
            z=4+2*x if i%4 else 360+x
            vertices.append(list(map(f32,[x,y,z,x*.13+y*.1,y*.25-x*.03])))
        # Projection probes include independent channels and zero depth.
        p=[list(map(f32,[rng.uniform(-1000,1000),rng.uniform(-1000,1000),rng.uniform(-20,500),rng.uniform(-10,10),rng.uniform(-10,10)])) for _ in range(count)]
        if i%10==0:p[0][2]=0
        options={'near':.75,'far':350,'bounds':[0,0,320,200],'scale':[f32(150+rng.random()*100),f32(-160-rng.random()*80)],'center':[160,100],'offset':[f32(rng.uniform(-.2,.2)),f32(rng.uniform(-.2,.2))],'delta':[8,16,32,64,128,256][i%6]}
        projection.append({'vertices':p,'options':options,'native':n.project(p,options)})
        camera=n.camera(vertices,options);projected=n.project(camera,options);screen=n.screen(projected,options)
        size=[[64,64],[128,128],[256,128]][i%3]
        images=[n.draw(screen,size,axis,options['delta'],options['far']) for axis in [0,1]]
        fixture={'vertices':vertices,'options':options,'size':size,'native':screen,'hashes':[hashlib.sha256(image).hexdigest() for image in images]};pipeline.append(fixture)
        if i in [1,2,3,7]:browser.append({**fixture,'nativePixels':[base64.b64encode(image).decode() for image in images]})
    script="""import {clipCameraPolygon,clipScreenPolygon,projectTexturePolygon,prepareProjectedTexturePolygon} from './src/polygon-clip.js';import {drawIndexedTexturePolygon} from './src/texture-spans.js';import {createHash} from 'node:crypto';let s='';for await(const c of process.stdin)s+=c;const q=JSON.parse(s);const result={clips:q.fixtures.map(f=>({camera:clipCameraPolygon(f.vertices,{...f.options,flags:f.options.cameraFlags}),screen:clipScreenPolygon(f.vertices,f.options)})),projections:q.projection.map(f=>projectTexturePolygon(f.vertices,f.options)),pipeline:q.pipeline.map(f=>{const vertices=prepareProjectedTexturePolygon(f.vertices,f.options);return {vertices,hashes:[0,1].map(axis=>{const target=new Uint8Array(64000).fill(255),[width,height]=f.size,pixels=Uint8Array.from({length:width*height},(_,i)=>axis?Math.floor(i/width)%256:i%width%256);if(vertices.length)drawIndexedTexturePolygon(target,320,vertices,{width,height,pixels},{...f.options,weightedUV:true});return createHash('sha256').update(target).digest('hex')})}})};console.log(JSON.stringify(result));"""
    result=json.loads(subprocess.run(['node','--import','./utils/tests/setup.js','--input-type=module','-e',script],cwd=ROOT,input=json.dumps({'fixtures':fixtures,'projection':projection,'pipeline':pipeline}),text=True,capture_output=True,check=True).stdout)
    errors=[]
    for i,(fixture,actual) in enumerate(zip(fixtures,result['clips'])):
        for key in ['camera','screen']:
            if fixture[key]!=actual[key]:errors.append({'section':key,'fixture':i,'expected':fixture[key],'actual':actual[key]})
    for i,(fixture,actual) in enumerate(zip(projection,result['projections'])):
        if fixture['native']!=actual:errors.append({'section':'projection','fixture':i,'expected':fixture['native'],'actual':actual})
    for i,(fixture,actual) in enumerate(zip(pipeline,result['pipeline'])):
        if fixture['native']!=actual['vertices']:errors.append({'section':'pipeline vertices','fixture':i,'expected':fixture['native'],'actual':actual['vertices']})
        if fixture['hashes']!=actual['hashes']:errors.append({'section':'pipeline pixels','fixture':i,'expected':fixture['hashes'],'actual':actual['hashes']})
    report={'scope':__doc__,'executableSha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'clipCases':len(fixtures),'projectionCases':len(projection),'pipelineCases':len(pipeline),'comparedFrameBytes':len(pipeline)*128000,'mismatchCount':len(errors),'mismatches':errors[:20],'passed':not errors,'fixtures':fixtures,'projection':projection,'pipeline':pipeline,'limits':['Supplied camera-space convex polygons; native scene loading, camera initialization, lighting, depth/priority occlusion, keyed/shaded writes and production scene integration remain open.']}
    (ROOT/'private/verification/polygon-clipping-native.json').write_text(json.dumps(report,separators=(',',':'))+'\n')
    (ROOT/'src/clipping-check-fixtures.json').write_text(json.dumps(browser,separators=(',',':'))+'\n')
    print(json.dumps({k:report[k] for k in ['clipCases','projectionCases','pipelineCases','comparedFrameBytes','mismatchCount','mismatches','passed']},indent=2))
    if errors:raise SystemExit(1)

if __name__=='__main__':main()
