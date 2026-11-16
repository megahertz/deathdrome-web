"""Execute native world UV registration and opaque constant-UV rasterization.

The native polygon wrapper, perspective mapper, span allocator and MMX texel
writer run. Only texture lookup is replaced by an in-memory synthetic image.
World UV fixtures supply already transformed vertices with an identity matrix.
"""
import hashlib,json,math,random,struct,subprocess
from native_gamegen_loader import GameGenLoader
from native_ai_audit import ROOT,EXE,f32

def bits(i):return struct.unpack('<f',struct.pack('<I',i))[0]

class TextureNative(GameGenLoader):
    def __init__(self,width=64,height=64):
        super().__init__()
        self.desc=self.reserve(16);self.tex=self.reserve(65536)
        self.width,self.height=width,height
        self.frame=self.reserve(width*height);self.pos=self.reserve(64*12)
        self.uv=self.reserve(64*8);self.col=self.reserve(64*12)
        self.pool=self.reserve(65536);self.rows=self.reserve(height*4)
        self.cpu.mem_write(0x448970,b'\xb8'+struct.pack('<I',self.desc)+b'\xc3')
        for address,value in [(0x49028c,0x45304c),(0x490294,0x44fd84),
                (0x4902c8,self.frame),(0x4902d8,width),(0x491038,self.rows)]:self.write(address,'I',value)
        self.write(0x4901ec,'B',1);self.call(0x44cd08,[350]);self.call(0x44cd24,eax=128)
        self.write(self.pos,'12f',8,8,1,56,8,1,56,56,1,8,56,1)
        self.shape=self.reserve(64);self.poly=self.reserve(40)
        self.vertices=self.reserve(1024);self.transformed=self.reserve(1024)
        self.indices=self.reserve(256);self.world_uv=self.reserve(1024)
        self.material=self.reserve(56)
        self.write(0x95caa8,'I',self.material);self.write(self.material+2,'B',1)
        self.write(self.shape+8,'I',1);self.write(self.shape+32,'I',self.poly)
        self.write(self.poly+8,'I',self.indices);self.write(self.poly+16,'I',0)
        self.write(self.poly+20,'I',self.world_uv)
        self.write(0x490340,'I',1);self.write(0x95cb58,'B',1)

    def registered_uv(self,vertices,base,repeats):
        count=len(vertices)
        self.write(self.shape+12,'I',count);self.write(self.poly+4,'I',count)
        self.write(self.indices,'I'*count,*range(count))
        self.write(self.vertices,'f'*(count*3),*(v for p in vertices for v in p))
        self.write(0x955620,'2f',*base);self.write(0x490338,'2f',*repeats)
        self.call(0x454260,eax=self.shape,edx=self.vertices,ebx=self.transformed)
        assert self.read(0x490340,'I')[0]==1
        return [list(self.read(self.world_uv+i*8,'2f')) for i in range(count)]

    def image(self,size,axis):
        w,h=size
        self.cpu.mem_write(self.desc,struct.pack('<IHHBBBBI',w*h,w,h,0x26,0,
            int(math.log2(w)),int(math.log2(h)),self.tex))
        self.cpu.mem_write(self.tex,bytes((x if axis==0 else y)%256 for y in range(h) for x in range(w)))

    def sample(self,uv):
        self.write(0x491034,'I',self.pool);self.cpu.mem_write(self.rows,bytes(self.height*4))
        self.cpu.mem_write(self.frame,bytes([255])*(self.width*self.height))
        self.write(self.uv,'8f',*(uv*4))
        self.call(0x44c514,[bits(0),bits(4),bits(0)],eax=0,
            edx=self.pos,ebx=self.uv,ecx=self.col)
        return bytes(self.cpu.mem_read(self.frame+32*self.width+32,1))[0]

def main():
    n=TextureNative();world=[];rng=random.Random(7731)
    for i in range(120):
        vertices=[[f32(rng.uniform(-240,240)),f32(rng.uniform(-5,5)),f32(rng.uniform(-240,240))] for _ in range(3+i%22)]
        base=[0,0] if i%3 else [f32(3.75),f32(-4.25)]
        repeats=[.0625,.0625] if i%2 else [.03125,.125]
        world.append({'vertices':vertices,'base':base,'repeats':repeats,
            'native':n.registered_uv(vertices,base,repeats)})
    samples=[]
    values=[0,1/512,.1,.25,.5,.501,.999,1,1.1,2,2.5,-.1,-1,-1.1]
    coords=[[f32(x),f32(y)] for x,y in zip(values,values[::-1])]
    coords += [[f32(rng.uniform(-3,4)),f32(rng.uniform(-3,4))] for _ in range(66)]
    for size in [[8,8],[16,32],[64,64],[128,128],[256,128]]:
        actual=[[] for _ in coords]
        for axis in [0,1]:
            n.image(size,axis)
            for i,uv in enumerate(coords):actual[i].append(n.sample(uv))
        for uv,result in zip(coords,actual):samples.append({'size':size,'uv':uv,'native':result})
    script="""import {registeredTextureCoordinates,nativeTextureTexel} from './src/native-texture.ts';let s='';for await(const c of process.stdin)s+=c;const q=JSON.parse(s);console.log(JSON.stringify({world:q.world.map(x=>registeredTextureCoordinates(x.vertices,x).uv),samples:q.samples.map(x=>nativeTextureTexel(x.uv,x.size))}));"""
    rebuilt=json.loads(subprocess.run(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',script],cwd=ROOT,
        input=json.dumps({'world':world,'samples':samples}),text=True,capture_output=True,check=True).stdout)
    errors=[{'kind':'world','case':i} for i,(a,b) in enumerate(zip(world,rebuilt['world'])) if a['native']!=b]
    errors += [{'kind':'sample','case':i,'fixture':a,'rebuilt':b} for i,(a,b) in enumerate(zip(samples,rebuilt['samples'])) if a['native']!=b]
    report={'scope':__doc__,'executableSha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),
        'nativeFunctions':['0x454260','0x44c514','0x45304c','0x46ccf8','0x44361b'],
        'worldCases':len(world),'worldVertices':sum(len(x['vertices']) for x in world),
        'texelCases':len(samples),'nativeRasterDraws':len(samples)*2,
        'world':world,'samples':samples,'mismatches':errors,'passed':not errors,
        'limits':['World vertices and texture metadata are supplied fixtures; GW initialization and actual cameras are outside scope.',
            'Raster fixtures have constant UV and reciprocal depth 1. Perspective gradients, edges and clipping are compared separately in texture-spans-native.json and polygon-clipping-native.json. Shaded/keyed spans and whole-scene rasterization are not compared here.',
            'The production change applies to the menu world-registered light floor. Model UV import is verified separately. Complete scene rendering, native transforms, lighting and occlusion remain open.']}
    (ROOT/'private/verification/world-texture-native.json').write_text(json.dumps(report,separators=(',',':'))+'\n')
    (ROOT/'private/texture-check-fixtures.json').write_text(json.dumps(samples,separators=(',',':'))+'\n')
    print(json.dumps({k:report[k] for k in ['worldCases','worldVertices','texelCases','nativeRasterDraws','mismatches','passed']},indent=2))
    if errors:raise SystemExit(1)

if __name__=='__main__':main()
