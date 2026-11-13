"""Compare local Wall portal physics using actual native scene queries.

The reference uses native World insertion, grid traversal, Object3D hierarchy,
strict broad phases and shape predicates. GameGen parsing supplies five nodes;
the original loader/pruning, surrounding arena and full scheduler stay open.
"""
import hashlib,json,struct
from unicorn import UC_HOOK_CODE,__version__
from unicorn.x86_const import UC_X86_REG_EAX,UC_X86_REG_ESP
from native_ai_audit import ROOT,EXE,RUNNER,f32
from native_scene_queries import SceneQueries
from audit_portal_physics import SceneNative,scene,process

PATH='g1/walls/t21/g3535';OPEN=PATH+'/port11/open11'
class CollectorPhysical(SceneNative):
 def __init__(self,geometry=None):
  self.geometry=geometry or SceneQueries()
  if geometry is None:self.geometry.load_subtree(6,PATH)
  self.geometry.call(0x44b66c,eax=self.geometry.nodes[OPEN],edx=0)
  super().__init__();self.cpu.mem_map(0x3100000,0x1000000)
  image=EXE.read_bytes();self.cpu.mem_write(0x434de0,image[0x434de0-0x410000+0x400:0x434e59-0x410000+0x400])
  self.cpu.mem_write(0x434e9c,b'\x31\xc0\xc2\x0c\x00')
  for address in [0x43524c,0x434f98,0x435094,0x434fe4,0x43519c,0x411ee8]:self.cpu.mem_write(address,b'\x31\xc0\xc3')
  self.cpu.mem_write(0x44b628,b'\x89\x50\x54\xc3');self.cpu.mem_write(0x42ed54,b'\xc3')
  self.cpu.mem_write(0x419008,b'\x31\xc0\xc3');self.cpu.mem_write(0x434ad4,b'\xb8'+struct.pack('<I',RUNNER)+b'\xc3')
  self.cpu.hook_add(UC_HOOK_CODE,self._translation,begin=0x45a6bc,end=0x45a6bc)
 def setup(self,r,dt):
  super().setup(r,dt);self.cpu.mem_write(0x3100000,bytes(self.geometry.cpu.mem_read(0x3100000,self.geometry.heap-0x3100000)));self.write(0x48d8a8,'I',0)
 def _query(self,cpu,address,size,data):
  sp=cpu.reg_read(UC_X86_REG_ESP);x,z=self.read(sp+4,'ff');out=self.read(sp+12,'I')[0];hits=self.geometry.query('ground',x=x,z=z);self.groundCalls+=1
  self.write(RUNNER+0xd10c,'I',int(not hits));self.cpu.mem_write(out,b'\0'*0x204);self.write(out,'I',len(hits))
  for i,h in enumerate(hits):self.write(out+4+i*32,'fff',*h['normal'].values());self.write(out+0x14+i*32,'f',h['height']);self.write(out+0x20+i*32,'I',self.geometry.nodes[h['node']])
 def _wall(self,cpu,address,size,data):
  sp=cpu.reg_read(UC_X86_REG_ESP);points=self.read(sp+4,'6f');out=self.read(sp+28,'I')[0];hits=self.geometry.query('sweep',**{'from':dict(zip('xyz',points[:3])),'to':dict(zip('xyz',points[3:]))});self.wallCalls+=1
  self.write(RUNNER+0xd108,'I',int(not hits));self.write(out,'I',len(hits))
  for i,h in enumerate(hits):self.write(out+4+i*32,'ffffffII',*h['normal'].values(),*h['point'].values(),0,self.geometry.nodes[h['node']])
 def _translation(self,cpu,address,size,data):
  node=cpu.reg_read(UC_X86_REG_EAX)
  if node!=self.geometry.nodes[OPEN]:return
  sp=cpu.reg_read(UC_X86_REG_ESP);xyz=self.read(sp+4,'3f');fields=self.read(node+0x44,'I')[0];self.write(fields+0x24,'3f',*xyz);self.geometry.set_lift(OPEN,xyz[1])
 def height(self):return self.read(self.read(self.geometry.nodes[OPEN]+0x44,'I')[0]+0x28,'f')[0]
 def lower(self):
  node=self.geometry.nodes[OPEN]
  if self.read(node+0x54,'I')[0]:self.call(0x435330,eax=node)


def main():
 results=[]
 try:
  for side,frames in [(1,180),(-1,60)]:
   n=CollectorPhysical();dt=f32(1/60);initial=scene(action='load',arena=6,round=1,portal='11',side=side,dt=dt,subtree=PATH);n.setup(initial['r'],dt)
   samples=[];first=None;maximum=0
   for frame in range(frames):
    n.lower();n.call(0x42f0f0,[0.,0.],eax=RUNNER);n.call(0x42f200,[-20.,0.],eax=RUNNER);n.call(0x42f39c,eax=RUNNER)
    a=n.snapshot();b=scene(action='step');height=n.height();other=b['portals'].get('11',0);error=max(abs(height-other),*(abs(x-y) for x,y in zip(a['position'],b['state']['position'])));maximum=max(maximum,error)
    if error>1e-10 and first is None:first={'frame':frame,'error':error}
    samples.append({'native':a,'nativeHeight':height,'rebuild':b['state'],'rebuildHeight':other,'error':error})
   node=n.geometry.nodes[PATH];partition=list(n.geometry.read(node+0x60,'2i'))
   result={'side':side,'frames':frames,'initial':initial['state'],'worldInsertion':partition,'nativeGroundQueries':n.groundCalls,'nativeSegmentQueries':n.wallCalls,'samples':samples,'maximumError':maximum,'firstMismatch':first};results.append(result)
   print(json.dumps({'side':side,'frames':frames,'maximumError':maximum,'firstMismatch':first,'partition':partition,'nativeFinal':a['position'],'nativeMaxLift':max(s['nativeHeight'] for s in samples)}),flush=True)
 finally:process.stdin.close();process.wait(timeout=10)
 report={'scope':'Wall g3535 five-node local source hierarchy: native WorldPartition/WorldAddChild, 4459a4/446764 grid and recursive Object3D queries, original physical/support/classification/portal actions. Independent JS geometry is used only by the rebuild.',
         'sha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'emulator':'Unicorn '+__version__,'subtree':PATH,'results':results,'passed':all(r['firstMismatch'] is None for r in results),
         'limitations':['GameGen records are decoded by Python; five identity-transform nodes, initial constructor fields, own-shape grouping and child-bound unions are supplied. Native GameGen loading/pruning and the complete surrounding arena are not executed.','Allocation/free, transform-notification scheduling, other ground contacts, profile effects, periodic keep-moving and sound are supplied/stubbed. Door bounds are updated explicitly after the native translation callback; lower runs before the chosen physical update.','One human model and fixed float clock. This does not prove complete original gameplay, rendering or a universally one-way portal.']}
 (ROOT/'private/verification/wall-portal-hierarchy-native.json').write_text(json.dumps(report,indent=2)+'\n')
 if not report['passed']:raise SystemExit(1)

if __name__=='__main__':main()
