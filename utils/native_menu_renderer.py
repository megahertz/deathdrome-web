"""Headless original menu-scene investigation.

Native GameGen constructors, camera and scene traversal run. Host allocation,
file I/O, framebuffer storage and texture-bank lookup are supplied by the harness.
This helper is not yet a verified complete original-frame oracle.
"""
import json,struct,math
from pathlib import Path
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX,UC_X86_REG_EDX,UC_X86_REG_EBX,UC_X86_REG_ECX,UC_X86_REG_ESP
from native_gamegen_loader import GameGenLoader
from native_ai_audit import ROOT

class MenuRenderer(GameGenLoader):
    def __init__(self,name='pnkrunr'):
        super().__init__();self.draws=[];self.lookups=[]
        self.world=self.call(0x4441b0)
        for address,args in [(0x444710,[128,-128]),(0x4446c8,[-64,64]),(0x444754,[128,-128])]:self.call(address,args,eax=self.world)
        self.call(0x4644dc,eax=self.world);self.call(0x464278,eax=1)
        self.root=self.load(name+'.gam')
        self.call(0x45a6bc,[0,0,3],eax=self.root)
        self.call(0x45a54c,[0,0,0],eax=self.root)
        for node in self.graph(self.root).values():
            if node['name']=='lt':
                self.floor_shape=node['shape'];self.write(self.floor_shape+0x19,'B',1);self.call(0x4637bc,eax=self.floor_shape,edx=0xffffffec)
        self.call(0x454248,[0,0]);self.call(0x454230,[.0625,.0625])
        self.call(0x444f70,eax=self.world,edx=self.root)
        self.update()
        self.window=self.call(0x45ba20)
        fields=self.read(self.window+0x44,'I')[0];self.write(fields,'4i',66,55,187,58)
        self.camera=self.call(0x45bd58)
        self.call(0x45bde4,eax=self.camera,edx=self.world);self.call(0x45bdf4,eax=self.camera,edx=self.window)
        self.call(0x45bf60,[62,18],eax=self.camera);self.call(0x45bf28,[1.5,1024],eax=self.camera)
        self.call(0x45bec0,[0,2.3,10],eax=self.camera);self.call(0x45be08,[-10,0,0],eax=self.camera)
        self.call(0x45c000,[1],eax=self.camera)
        self.frame=self.reserve(64000);self.rows=self.reserve(800);self.pool=self.reserve(8*1024*1024)
        for address,value in [(0x49028c,0x45304c),(0x490290,0x45162c),(0x490294,0x44fd84),(0x490298,0x44cd78),(0x4902c8,self.frame),(0x4902d8,320),(0x491038,self.rows),(0x491034,self.pool)]:self.write(address,'I',value)
        self.write(0x4901ec,'B',1);self.call(0x44cd08,[64]);self.call(0x44cd24,eax=16)
        self.textures={};pack=(ROOT/'private/original/game/DATA/TEXTURES/texture.zb').read_bytes();entries={}
        for i in range(struct.unpack_from('<I',pack,60)[0]//68):
            path=pack[i*68:i*68+60].split(b'\0')[0].decode().replace('\\','/').lower()
            entries[path]=struct.unpack_from('<I',pack,i*68+60)[0]
        model=json.loads((ROOT/f'private/assets/models/{name}.json').read_text())
        for key,path in model['textures'].items():
            suffix=path.removesuffix('.png')+'.zim';offset=next(offset for path,offset in entries.items() if path.endswith('/'+suffix))
            size=struct.unpack_from('<I',pack,offset)[0];data=self.reserve(size);self.cpu.mem_write(data,pack[offset+16:offset+16+size]);desc=self.reserve(32)
            self.cpu.mem_write(desc,pack[offset:offset+12]+struct.pack('<I',data));self.textures[int(key)]=desc
        self.cpu.mem_write(0x448970,b'\xc3');self.cpu.hook_add(UC_HOOK_CODE,self.texture_lookup,begin=0x448970,end=0x448970)
        # Host graphics presentation/clip calls and timing are outside the scene.
        for address in [0x447530,0x44733c,0x44c9b0]:self.cpu.mem_write(address,b'\xc3')
        self.cpu.hook_add(UC_HOOK_CODE,self.capture,begin=0x44c514,end=0x44c514)
        self.cpu.hook_add(UC_HOOK_CODE,self.capture,begin=0x44c774,end=0x44c774)
    def texture_lookup(self,cpu,address,size,data):
        key=cpu.reg_read(UC_X86_REG_EAX);self.lookups.append(key)
        if key not in self.textures:raise KeyError(f'Texture {key}')
        cpu.reg_write(UC_X86_REG_EAX,self.textures[key])
    def capture(self,cpu,address,size,data):
        esp=cpu.reg_read(UC_X86_REG_ESP);is_texture=address==0x44c514
        count=self.read(esp+8,'I')[0] if is_texture else cpu.reg_read(UC_X86_REG_ECX)
        pos=cpu.reg_read(UC_X86_REG_EDX if is_texture else UC_X86_REG_EAX)
        vertices=[list(self.read(pos+i*12,'3f')) for i in range(count)]
        record={'kind':'texture' if is_texture else 'solid','vertices':vertices,'priorityBias':self.read(0x4902bc,'f')[0]}
        if is_texture:
            uv=cpu.reg_read(UC_X86_REG_EBX)
            for i,p in enumerate(vertices):p.extend(self.read(uv+i*8,'2f'))
            record.update(textureID=self.read(esp+12,'I')[0],shaded=bool(cpu.reg_read(UC_X86_REG_EAX)&255))
        else:record['color']=int(self.read(cpu.reg_read(UC_X86_REG_EDX),'f')[0])
        self.draws.append(record)
    def render(self):
        self.cpu.mem_write(self.frame,bytes(64000));self.cpu.mem_write(self.rows,bytes(800));self.write(0x491034,'I',self.pool)
        self.draws=[];self.lookups=[];self.update();self.call(0x45d470,eax=self.camera)
        return bytes(self.cpu.mem_read(self.frame,64000))

if __name__=='__main__':
    from PIL import Image
    n=MenuRenderer();pixels=n.render();palette=(ROOT/'private/original/game/RUN/domain.act').read_bytes()
    image=Image.frombytes('P',(320,200),pixels);image.putpalette(palette);image.convert('RGB').save('/tmp/dd-native-menu-probe.png')
    print(json.dumps({'draws':n.draws,'lookups':n.lookups,'nonzeroPixels':sum(bool(x) for x in pixels),'worldChildren':n.graph(n.world)[n.world]['children']}))
