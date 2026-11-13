"""Native AI wrapper/model gate with supplied action bodies and counted callbacks."""
import struct
from unicorn import UC_HOOK_CODE
from native_ai_audit import Native,RUNNER,NODE_POOL,SCRATCH

class ActivityNative(Native):
 def __init__(self,initial=0,mode=0):
  super().__init__();self.events=[]
  for address in [0x4336cc,0x42dc4c,0x42d0e8,0x42befc,0x42c508,0x42c8ec,0x42d940,0x42e128,0x42f39c,0x4371d0,0x43360c]:self.cpu.mem_write(address,b'\xc3')
  self.cpu.mem_write(0x411ee8,b'\x31\xc0\xc3')
  self.cpu.mem_write(0x42f2a8,b'\xc2\x04\x00')
  for address in [0x434cc8,0x43c160]:self.cpu.mem_write(address,b'\xd9\x05'+struct.pack('<I',SCRATCH+0x800)+b'\xc3')
  self.cpu.mem_write(0x42c9bc,b'\x31\xc0\xc2\x04\x00')
  for address,event in [(0x42d0e8,'action'),(0x42befc,'action'),(0x42f39c,'physics'),(0x4371d0,'weapons'),(0x43360c,'health')]:
   self.cpu.hook_add(UC_HOOK_CODE,lambda cpu,a,s,d,event=event:self.events.append(event),begin=address,end=address)
  self.write(RUNNER,'I',1);self.write(RUNNER+8,'B',1);self.write(RUNNER+0xc,'I',RUNNER+0x8000);self.write(RUNNER+0x8000+0x4c,'I',RUNNER)
  self.write(RUNNER+0xcc,'B',initial);self.write(RUNNER+0x230,'f',10);self.write(RUNNER+0x15e,'B',1);self.write(RUNNER+0x100,'f',100)
  self.write(RUNNER+0x1ea,'B',mode);self.write(RUNNER+0x1ec,'I',NODE_POOL);self.write(NODE_POOL+0x28,'I',12)
  for offset in [0x214,0x218,0x21c,0x44c]:self.write(RUNNER+offset,'f',float('inf'))
 def step(self,f):
  self.events=[];self.write(0x518aa4,'2f',f['clock'],0);self.write(SCRATCH+0x800,'f',f['remaining'])
  self.write(0x518a70,'2I',f['playerMask'],f['entranceMask']);self.write(RUNNER+0xd8,'I',f['mask'])
  if f['enabled']:self.call(0x42bb3c,eax=RUNNER)
  self.call(0x42f2d0,eax=RUNNER+0x8000)
  return dict(state=self.read(RUNNER+0xcc,'B')[0],deadline=self.read(RUNNER+0x230,'f')[0],events=list(self.events))

