"""Original ground action with supplied analytic terrain intersections."""
import math,struct
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_ESP,UC_X86_REG_EAX
from native_ai_audit import Native,RUNNER,f32

def terrain_hits(t,x,z):
 if t['kind']=='layers':return [terrain_hits(dict(kind='plane',**layer),x,z)[0] for layer in t['layers']]
 height=t['base']+(t['sx']*x+t['sz']*z if t['kind']=='plane' else t['height'] if x>=t['edge'] else 0)
 sx=t.get('sx',0);sz=t.get('sz',0);length=math.sqrt(1+sx*sx+sz*sz)
 return [dict(height=f32(height),normal=[f32(-sx/length),f32(1/length),f32(-sz/length)])]

class GroundNative(Native):
 def __init__(self):
  super().__init__();self.terrain=dict(kind='plane',base=0,sx=0,sz=0);self.queries=[];self.sounds=[]
  self.cpu.mem_write(0x4459a4,b'\x31\xc0\xc2\x0c\x00')
  self.cpu.mem_write(0x418f94,b'\xa1'+struct.pack('<I',RUNNER+0xd100)+b'\xc3')
  for address in [0x44b66c,0x44b4f0,0x4182f4]:self.cpu.mem_write(address,b'\xc3')
  self.cpu.mem_write(0x434e5c,b'\x31\xc0\xc3');self.cpu.mem_write(0x434de0,b'\xc2\x0c\x00')
  for address in [0x4334dc,0x4334b0]:self.cpu.mem_write(address,b'\xc2\x04\x00')
  self.cpu.hook_add(UC_HOOK_CODE,self._query,begin=0x4459a4,end=0x4459a4)
  self.cpu.hook_add(UC_HOOK_CODE,lambda cpu,address,size,data:self.sounds.append(cpu.reg_read(UC_X86_REG_EAX)),begin=0x4182f4,end=0x4182f4)
 def _query(self,cpu,address,size,data):
  esp=cpu.reg_read(UC_X86_REG_ESP);x,z=self.read(esp+4,'ff');out=self.read(esp+12,'I')[0];hits=terrain_hits(self.terrain,x,z)
  self.cpu.mem_write(out,b'\0'*0x204);self.write(out,'I',len(hits))
  for i,hit in enumerate(hits):self.write(out+4+i*32,'fff',*hit['normal']);self.write(out+0x14+i*32,'f',hit['height'])
  self.queries.append(dict(x=x,z=z,hits=hits))
