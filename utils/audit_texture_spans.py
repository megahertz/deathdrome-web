"""Compare reimplemented opaque texture spans with real native raster draws.

Only the texture lookup is stubbed. Independent JavaScript edge collection,
perspective commands and complete indexed frames are compared for unclipped
convex projected polygons; this does not certify a complete scene renderer.
"""
import hashlib,json,random,struct,subprocess,math,base64
from collections import defaultdict
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX
from audit_world_texture import TextureNative,bits
from native_ai_audit import ROOT,EXE,f32

class SpanNative(TextureNative):
    def __init__(self):
        super().__init__(320,200);self.commands=[]
        self.cpu.hook_add(UC_HOOK_CODE,self.capture,begin=0x44361b,end=0x44361b)
    def capture(self,cpu,address,size,data):
        offset=self.read(0x955618,'I')[0]-self.frame
        u,v,du,dv=self.read(0x490308,'4i')
        self.commands.append({'x':offset%self.width,'y':offset//self.width,
            'count':cpu.reg_read(UC_X86_REG_EAX),'u':u,'v':v,'du':du,'dv':dv})
    def render(self,vertices,size,axis,delta,far):
        self.commands=[];self.image(size,axis)
        self.call(0x44cd24,eax=delta);self.call(0x44cd08,[far])
        self.write(0x491034,'I',self.pool);self.cpu.mem_write(self.rows,bytes(self.height*4))
        self.cpu.mem_write(self.frame,bytes([255])*(self.width*self.height))
        self.write(self.pos,'f'*(len(vertices)*3),*(v for p in vertices for v in p[:3]))
        weighted=[[f32(p[3]*p[2]),f32(p[4]*p[2])] for p in vertices]
        self.write(self.uv,'f'*(len(vertices)*2),*(v for p in weighted for v in p))
        self.call(0x44c514,[bits(0),bits(len(vertices)),bits(0)],eax=0,edx=self.pos,ebx=self.uv,ecx=self.col)
        return bytes(self.cpu.mem_read(self.frame,self.width*self.height)),list(self.commands)

def main():
    n=SpanNative();rng=random.Random(45304);fixtures=[]
    browser_fixtures=[]
    for i in range(120):
        q=f32([1,.01,1/350,.002][i%4]);slope=f32(q*[.001,-.0015,.002][i%3])
        positions=[[8,8],[308,8],[308,188],[8,188]] if i%2==0 else [[20,12],[300,24],[285,180],[8,170]]
        if i>=24:
            count=3+i%7;angle=rng.uniform(0,math.tau)
            # Use an ellipse: arbitrary radial jitter could make it concave.
            radius=rng.uniform(45,145)
            positions=[[f32(160+radius*math.cos(angle+j*math.tau/count)),f32(100+70*math.sin(angle+j*math.tau/count))] for j in range(count)]
            if i%2:positions.reverse()
        if i>=104:
            epsilon=[0,1e-6,-1e-6,.0002,-.0002,.0003,-.0003,.25][i%8]
            positions=[[8.5+epsilon,8.5+epsilon],[308.5+epsilon,8.5+epsilon],[308.5+epsilon,188.5+epsilon],[8.5+epsilon,188.5+epsilon]]
        vertices=[]
        for x,y in positions:
            reciprocal=f32(q+slope*(x-8))
            u=f32((.02*(x-8)+.003*(y-8))*(q/reciprocal));v=f32((.01*(y-8)-.001*(x-8))*(q/reciprocal))
            vertices.append([f32(x),f32(y),reciprocal,u,v])
        delta=[8,16,32,64,128,256][i%6];size=[[64,64],[128,128],[256,128]][i%3]
        image,commands=n.render(vertices,size,0,delta,350)
        image_y,commands_y=n.render(vertices,size,1,delta,350)
        assert commands_y==commands
        groups=defaultdict(list)
        for command in commands:groups[command['y']].append(command)
        rows=[{'x':min(c['x'] for c in group),'y':y,'count':sum(c['count'] for c in group)} for y,group in groups.items()]
        fixture={'vertices':vertices,'size':size,'delta':delta,'far':350,'rows':rows,'native':commands,
            'nativeFrameHashes':[hashlib.sha256(image).hexdigest(),hashlib.sha256(image_y).hexdigest()]}
        fixtures.append(fixture)
        if i in [4,7,44]:browser_fixtures.append({k:v for k,v in fixture.items() if k not in ['native','rows']}|{'nativePixels':[base64.b64encode(image).decode(),base64.b64encode(image_y).decode()]})
    js="""import {texturePolygonRows,texturePolygonCommands,drawIndexedTexturePolygon} from './src/texture-spans.js';import {createHash} from 'node:crypto';let s='';for await(const c of process.stdin)s+=c;const q=JSON.parse(s);console.log(JSON.stringify(q.map(f=>{const hashes=[0,1].map(axis=>{const target=new Uint8Array(320*200).fill(255),[width,height]=f.size,pixels=Uint8Array.from({length:width*height},(_,i)=>axis?Math.floor(i/width)%256:i%width%256);drawIndexedTexturePolygon(target,320,f.vertices,{width,height,pixels},f);return createHash('sha256').update(target).digest('hex')});return {rows:texturePolygonRows(f.vertices),commands:texturePolygonCommands(f.vertices,f.size,f),hashes}})));"""
    rebuilt=json.loads(subprocess.run(['node','--import','./utils/tests/setup.js','--input-type=module','-e',js],cwd=ROOT,input=json.dumps(fixtures),text=True,capture_output=True,check=True).stdout)
    errors=[];edge_errors=[];pixel_errors=[];fields=0
    for i,(fixture,result) in enumerate(zip(fixtures,rebuilt)):
        actual=result['commands']
        if fixture['nativeFrameHashes']!=result['hashes']:pixel_errors.append({'fixture':i,'native':fixture['nativeFrameHashes'],'rebuilt':result['hashes']})
        if fixture['rows']!=result['rows']:edge_errors.append({'fixture':i,'native':fixture['rows'][:4],'rebuilt':result['rows'][:4]})
        expected=fixture['native']
        if len(expected)!=len(actual):errors.append({'fixture':i,'counts':[len(expected),len(actual)]});continue
        for j,(a,b) in enumerate(zip(expected,actual)):
            fields+=7
            if a!=b:errors.append({'fixture':i,'command':j,'native':a,'rebuilt':b})
    report={'scope':__doc__,'executableSha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),
        'fixtures':fixtures,'cases':len(fixtures),'commands':sum(len(f['native']) for f in fixtures),
        'fieldsCompared':fields,'mismatchCount':len(errors),'mismatches':errors[:20],'edgeMismatchCount':len(edge_errors),'edgeMismatches':edge_errors[:10],
        'comparedFrameBytes':len(fixtures)*2*320*200,'frameMismatchCount':len(pixel_errors),'frameMismatches':pixel_errors[:10],'passed':not errors and not edge_errors and not pixel_errors,
        'limits':['Unclipped convex projected polygons are compared. Depth/priority occlusion, window and near clipping, production scene integration and shaded/keyed writes remain unfinished.']}
    (ROOT/'private/verification/texture-spans-native.json').write_text(json.dumps(report,separators=(',',':'))+'\n')
    (ROOT/'src/span-check-fixtures.json').write_text(json.dumps(browser_fixtures,separators=(',',':'))+'\n')
    print(json.dumps({k:report[k] for k in ['cases','commands','mismatchCount','mismatches','edgeMismatchCount','edgeMismatches','comparedFrameBytes','frameMismatchCount','frameMismatches','passed']},indent=2))
    if errors or edge_errors or pixel_errors:raise SystemExit(1)

if __name__=='__main__':main()
