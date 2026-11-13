"""Compare complete original textured/solid opaque draws with shared row occlusion state.

Polygons, priorities and synthetic indexed textures are supplied fixtures. The
native wrapper, depth/priority interval manager, perspective mapper and pixel
writer execute. Full camera/scene setup and other material paths are not covered.
"""
import json,random,struct,hashlib,subprocess,math
from pathlib import Path
from audit_texture_spans import SpanNative
from native_ai_audit import ROOT,EXE,f32,STACK,STOP,REGISTERS
from audit_world_texture import bits
from unicorn.x86_const import UC_X86_REG_EAX,UC_X86_REG_ECX,UC_X86_REG_ESP,UC_X86_REG_EIP
from unicorn import UC_HOOK_CODE
FIELDS=['kind','x','y','count','u','v','du','dv','color']
class OverlapNative(SpanNative):
    def __init__(self):
        super().__init__();self.pool=self.reserve(8*1024*1024);self.cpu.hook_add(UC_HOOK_CODE,self.capture_solid,begin=0x443c81,end=0x443c81)
    def capture(self,cpu,address,size,data):
        super().capture(cpu,address,size,data);self.commands[-1].update(kind=0,color=0)
    def capture_solid(self,cpu,address,size,data):
        offset=self.read(0x955618,'I')[0]-self.frame
        self.commands.append({'kind':1,'x':offset%self.width,'y':offset//self.width,'count':cpu.reg_read(UC_X86_REG_ECX),'u':0,'v':0,'du':0,'dv':0,'color':cpu.reg_read(UC_X86_REG_EAX)&255})
    def call(self,address,args=(),**registers):
        self.cpu.mem_write(STACK,struct.pack('<I',STOP)+b''.join(struct.pack('<f',x) for x in args));self.cpu.reg_write(UC_X86_REG_ESP,STACK)
        for name,value in registers.items():self.cpu.reg_write(REGISTERS[name],value)
        self.cpu.emu_start(address,STOP,count=3000000)
        if self.cpu.reg_read(UC_X86_REG_EIP)!=STOP:raise RuntimeError('Native overlap instruction limit reached')
        return self.cpu.reg_read(UC_X86_REG_EAX)
    def begin(self):
        self.write(0x491034,'I',self.pool);self.cpu.mem_write(self.rows,bytes(self.height*4));self.cpu.mem_write(self.frame,bytes([255])*(self.width*self.height))
    def row_hash(self):
        digest=hashlib.sha256()
        for y in range(self.height):
            records=[];p=self.read(self.rows+y*4,'I')[0];seen=set()
            while p:
                assert p not in seen;seen.add(p);records.append(bytes(self.cpu.mem_read(p,20)));p=self.read(p+20,'I')[0]
            digest.update(struct.pack('<I',len(records)))
            for record in records:digest.update(record)
        return digest.hexdigest()
    def draw(self,polygon,axis):
        self.commands=[];self.image(polygon['size'],axis);self.call(0x44cd24,eax=polygon['delta']);self.call(0x44cd08,[polygon['far']]);self.write(0x4902bc,'f',polygon['priorityBias'])
        vertices=polygon['vertices'];self.write(self.pos,'f'*(len(vertices)*3),*(v for p in vertices for v in p[:3]))
        if polygon.get('kind')=='solid':self.call(0x44cd78,eax=self.pos,edx=len(vertices),ebx=polygon['color'])
        else:
            self.write(self.uv,'f'*(len(vertices)*2),*(f32(p[k]*p[2]) for p in vertices for k in [3,4]))
            self.call(0x44c514,[bits(0),bits(len(vertices)),bits(0)],eax=0,edx=self.pos,ebx=self.uv,ecx=self.col)
        raw=b''.join(struct.pack('<9i',*(command[k] for k in FIELDS)) for command in self.commands)
        return {'frameHash':hashlib.sha256(bytes(self.cpu.mem_read(self.frame,self.width*self.height))).hexdigest(),'commandHash':hashlib.sha256(raw).hexdigest(),'commandCount':len(self.commands),'rowHash':self.row_hash()}

def main():
    n=OverlapNative();rng=random.Random(0x4537cd);fixtures=[];browser_fixtures=[]
    for case in range(64):
        polygons=[]
        for j in range(8):
            count=3+(case+j)%6;cx=rng.uniform(110,210);cy=rng.uniform(65,135);rx=rng.uniform(50,100);ry=rng.uniform(40,64);angle=rng.random()*math.tau
            q=10**rng.uniform(-3,-.3);sx=rng.uniform(-.7,.7)*q/rx;sy=rng.uniform(-.3,.3)*q/ry
            if case<16:
                count=4;cx=160;cy=100;rx=150-j*8;ry=85-j*5;angle=math.pi/4
                q=[1,.5,1.00005,1.0002][(case+j)%4];sx=(j%3-1)*.0003;sy=0
            vertices=[]
            for k in range(count):
                a=angle+k*math.tau/count;x=f32(cx+rx*math.cos(a));y=f32(cy+ry*math.sin(a));z=f32(q+sx*(x-cx)+sy*(y-cy))
                # Linear UQ/VQ planes, so the polygon is projectively planar.
                u=f32((.04*(x-20)+.013*y+case*.11+j*.73)*q/z);v=f32((.027*y-.019*x+j*.37)*q/z)
                vertices.append([x,y,z,u,v])
            if (case+j)%2:vertices.reverse()
            polygons.append({'vertices':vertices,'size':[[64,64],[128,128],[256,128]][j%3],'delta':[8,16,32,64,128,256][(case+j)%6],'far':[64,350,1000][j%3],'priorityBias':f32([0,0,.00005,-.00005,.0002,-.0002][(case+j)%6]),'kind':'solid' if (case+j)%3==0 else 'texture','color':(case*31+j*71)%255})
        reference=[];browser_pixels=[]
        for axis in [0,1]:
            n.begin();reference.append([n.draw(p,axis) for p in polygons]);browser_pixels.append(bytes(n.cpu.mem_read(n.frame,64000)))
        fixtures.append({'polygons':polygons,'native':reference})
        if case in [17,23]:
            import base64
            browser_fixtures.append({'polygons':polygons,'nativePixels':[base64.b64encode(raw).decode() for raw in browser_pixels],'native':reference})
    js="""import {SpanBuffer} from './src/span-buffer.js';import {drawOpaqueSolidPolygon} from './src/solid-spans.js';import {texturePolygonCommands,drawIndexedTexturePolygon} from './src/texture-spans.js';import {createHash} from 'node:crypto';let s='';for await(const c of process.stdin)s+=c;const q=JSON.parse(s);function rowHash(buffer){const hash=createHash('sha256');for(const row of buffer.rows){const size=Buffer.alloc(4);size.writeUInt32LE(row.length);hash.update(size);for(const s of row){const b=Buffer.alloc(20);b.writeInt32LE(s.x0,0);b.writeInt32LE(s.x1,4);b.writeFloatLE(s.q0,8);b.writeFloatLE(s.q1,12);b.writeFloatLE(s.dq,16);hash.update(b)}}return hash.digest('hex')}console.log(JSON.stringify(q.map(f=>[0,1].map(axis=>{const target=new Uint8Array(64000).fill(255),buffer=new SpanBuffer(200);return f.polygons.map(p=>{const [width,height]=p.size,pixels=Uint8Array.from({length:width*height},(_,i)=>axis?Math.floor(i/width)%256:i%width%256),commands=p.kind==='solid'?drawOpaqueSolidPolygon(target,320,p.vertices,p.color,{...p,spanBuffer:buffer}):drawIndexedTexturePolygon(target,320,p.vertices,{width,height,pixels},{...p,spanBuffer:buffer});const raw=Buffer.alloc(commands.length*36);commands.forEach((c,i)=>['kind','x','y','count','u','v','du','dv','color'].forEach((k,j)=>raw.writeInt32LE((k==='kind'?(p.kind==='solid'?1:0):c[k]??0)|0,i*36+j*4)));return {frameHash:createHash('sha256').update(target).digest('hex'),commandHash:createHash('sha256').update(raw).digest('hex'),commandCount:commands.length,rowHash:rowHash(buffer)}})}))));"""
    result=json.loads(subprocess.run(['node','--import','./utils/tests/setup.js','--input-type=module','-e',js],cwd=ROOT,input=json.dumps(fixtures),text=True,capture_output=True,check=True).stdout)
    errors=[]
    for i,(fixture,actual) in enumerate(zip(fixtures,result)):
        for axis in [0,1]:
            for j,(expected,got) in enumerate(zip(fixture['native'][axis],actual[axis])):
                if expected!=got:errors.append({'fixture':i,'axis':axis,'polygon':j,'expected':expected,'actual':got})
    report={'scope':__doc__,'executableSha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'sceneCases':len(fixtures),'polygonsPerScene':8,'nativeDraws':len(fixtures)*8*2,'solidNativeDraws':sum(p['kind']=='solid' for f in fixtures for p in f['polygons'])*2,'comparedFrameBytes':len(fixtures)*8*2*64000,'mismatchCount':len(errors),'mismatches':errors[:12],'passed':not errors,'fixtures':fixtures,'limits':['Supplied projected convex polygons and explicit priority bias. Original model/camera transforms, source priority assignment and keyed/shaded/translucent materials remain open.']}
    (ROOT/'src/overlap-check-fixtures.json').write_text(json.dumps(browser_fixtures,separators=(',',':'))+'\n')
    (ROOT/'private/verification/opaque-overlaps-native.json').write_text(json.dumps(report,separators=(',',':'))+'\n');print(json.dumps({k:report[k] for k in ['sceneCases','polygonsPerScene','nativeDraws','solidNativeDraws','comparedFrameBytes','mismatchCount','mismatches','passed']},indent=2))
    if errors:raise SystemExit(1)
if __name__=='__main__':main()
