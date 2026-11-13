"""Run original physical + ground dispatcher + portal lift/lower actions.

Separate Three.js scene instances provide each engine's geometry at its own
door height. Native collection is still supplied; reference code owns physical
response, ground-list choice, portal dispatch, float lift and callback state.
"""
import json,struct,hashlib
from unicorn import UC_HOOK_CODE,__version__
from unicorn.x86_const import UC_X86_REG_EAX,UC_X86_REG_EDX,UC_X86_REG_ESP
from native_ai_audit import ROOT,EXE,RUNNER,f32
from audit_portal_physics import SceneNative,scene,process

PORTAL_POOL=0x3100000
class PortalNative(SceneNative):
 def __init__(self):
  super().__init__(lambda **q:scene(engine='native',**q));self.portal='11';self.portals={};self.cpu.mem_map(PORTAL_POOL,0x10000)
  image=EXE.read_bytes();self.cpu.mem_write(0x434de0,image[0x434de0-0x410000+0x400:0x434e59-0x410000+0x400])
  self.cpu.mem_write(0x434e9c,b'\x31\xc0\xc2\x0c\x00')
  for address in [0x43524c,0x434f98,0x435094,0x434fe4,0x43519c,0x411ee8]:self.cpu.mem_write(address,b'\x31\xc0\xc3')
  self.cpu.mem_write(0x44b628,b'\x89\x50\x54\xc3') # callback field only; omit global scheduler insertion
  self.cpu.mem_write(0x42ed54,b'\xc3') # door sound-distance effect
  self.cpu.mem_write(0x419008,b'\x31\xc0\xc3');self.cpu.mem_write(0x434ad4,b'\xb8'+struct.pack('<I',RUNNER)+b'\xc3')
  self.cpu.hook_add(UC_HOOK_CODE,self._translation,begin=0x45a6bc,end=0x45a6bc)
 def setup(self,r,dt,portal,ids,round=1):
  super().setup(r,dt);self.portal=portal;self.portals={};self.cpu.mem_write(PORTAL_POOL,b'\0'*0x10000);self.write(0x48d8a8,'I',round-1)
  for i,id in enumerate(ids):
   port=PORTAL_POOL+i*0x400;opened=port+0x100;data=port+0x200;child=port+0x300;self.portals[id]=(port,opened,data)
   self.cpu.mem_write(port,('port'+id+'\0').encode());self.cpu.mem_write(opened,('open'+id+'\0').encode())
   self.write(port+0x68,'II',1,child);self.write(child,'I',opened);self.write(opened+0x44,'I',data)
 def _query(self,cpu,address,size,data):
  sp=cpu.reg_read(UC_X86_REG_ESP);x,z=self.read(sp+4,'ff');out=self.read(sp+12,'I')[0];hits=self.query_scene(action='ground',x=x,z=z);self.groundCalls+=1
  self.write(RUNNER+0xd10c,'I',int(not hits));self.cpu.mem_write(out,b'\0'*0x204);self.write(out,'I',len(hits))
  for i,h in enumerate(hits):
   node=self.portals[h['portal']][0] if h.get('portal') in self.portals else RUNNER+0xe000
   self.write(out+4+i*32,'fff',*h['normal'].values());self.write(out+0x14+i*32,'f',h['height']);self.write(out+0x20+i*32,'I',node)
 def _translation(self,cpu,address,size,data):
  opened=cpu.reg_read(UC_X86_REG_EAX);match=next(((id,info[2]) for id,info in self.portals.items() if info[1]==opened),None)
  if not match:return
  id,target=match;sp=cpu.reg_read(UC_X86_REG_ESP);xyz=self.read(sp+4,'fff');self.write(target+0x24,'fff',*xyz);scene(action='setPortal',engine='native',portal=id,height=xyz[1])
 def height(self):return self.read(self.portals[self.portal][2]+0x28,'f')[0]
 def lower(self):
  for port,opened,data in self.portals.values():
   if self.read(opened+0x54,'I')[0]:self.call(0x435330,eax=opened)

results=[];n=PortalNative()
try:
 for arena,portal,side in [(6,'11',1),(6,'11',-1),(3,'11',1),(1,'11',1),(5,'11',1),(5,'11',-1),(7,'11',1),(7,'11',-1)]:
  dt=f32(1/60);initial=scene(action='load',arena=arena,round=1,portal=portal,side=side,dt=dt);n.setup(initial['r'],dt,portal,initial['portalIds']);samples=[];firstMismatch=None;maxError=0
  for frame in range(180):
   n.lower()
   n.call(0x42f0f0,[0.,0.],eax=RUNNER);n.call(0x42f200,[-20.,0.],eax=RUNNER);n.call(0x42f39c,eax=RUNNER)
   a=n.snapshot();b=scene(action='step');height=n.height();rebuildHeight=b['portals'].get(portal,0)
   error=max([abs(height-rebuildHeight),*(abs(x-y) for x,y in zip(a['position'],b['state']['position']))]);maxError=max(maxError,error)
   if firstMismatch is None and error>0.0001:firstMismatch={'frame':frame,'error':error}
   samples.append({'native':a,'nativeHeight':height,'rebuild':b['state'],'rebuildHeight':rebuildHeight,'error':error})
  result={'arena':arena,'portal':portal,'side':side,'initial':initial['state'],'maximumError':maxError,'firstMismatch':firstMismatch,'samples':samples};results.append(result)
  print(json.dumps({'arena':arena,'side':side,'maximumError':maxError,'firstMismatch':firstMismatch,'nativeFinal':a['position'],'rebuildFinal':b['state']['position'],'nativeMaxLift':max(s['nativeHeight'] for s in samples),'rebuildMaxLift':max(s['rebuildHeight'] for s in samples)}),flush=True)
finally:process.stdin.close();process.wait(timeout=10)
report={'scope':'Original 42f39c physical action, 434de0 ground dispatcher, 435500 portal contact and 435330 lower callback. Float translations and callback field are recorded; scene queries use separate production adapters.','comparedFields':['position','portalHeight'],'sha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'emulator':'Unicorn '+__version__,'results':results,'passed':all(r['firstMismatch'] is None for r in results),'limitations':['Native geometric traversal and group identity are supplied by decoded geometry, not the original scene loader/collector.','Other ground-object actions, profile effects, periodic keep-moving, sound and full scheduler are stubbed. Lower callback runs before the selected physical update.','One active human model 0, fixed frame clock, representative local approaches; not a full-game or rendered-frame equivalence claim.']}
(ROOT/'private/verification/portal-contact-native.json').write_text(json.dumps(report,indent=2)+'\n')
if not report['passed']:raise SystemExit(1)
