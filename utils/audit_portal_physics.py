"""Compare original physical/control actions at actual closed-door approaches.

Scene intersections are supplied by the production Three.js adapter to both
engines. This separates physical-action mismatches from scene-query gaps; it
cannot certify native traversal or a complete original arena trajectory.
"""
import json,math,struct,subprocess,hashlib
from unicorn import UC_HOOK_CODE,__version__
from unicorn.x86_const import UC_X86_REG_ESP
from native_ai_audit import ROOT,EXE,RUNNER,f32
from native_ground_audit import GroundNative

process=subprocess.Popen(['node','--import','./utils/tests/setup.ts','utils/portal_physics_scene.ts'],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,bufsize=1)
def scene(**request):
 process.stdin.write(json.dumps(request)+'\n');process.stdin.flush();line=process.stdout.readline()
 if not line:raise RuntimeError('Geometry adapter stopped')
 response=json.loads(line)
 if 'error' in response:raise RuntimeError(response['error'])
 return response['value']

class SceneNative(GroundNative):
 def __init__(self,query_scene=scene):
  self.query_scene=query_scene;self.groundCalls=0;self.wallCalls=0;super().__init__()
  for address in [0x41837c,0x43f1cc,0x436078,0x42a7a8]:self.cpu.mem_write(address,b'\xc3')
  for address in [0x45a54c,0x45a6bc]:self.cpu.mem_write(address,b'\xc2\x0c\x00')
  for address in [0x4185f0,0x418b28]:self.cpu.mem_write(address,b'\x31\xc0\xc3')
  self.cpu.mem_write(0x418fd4,b'\xb8\xff\xff\xff\xff\xc3');self.cpu.mem_write(0x418f68,b'\xa1'+struct.pack('<I',RUNNER+0xd104)+b'\xc3');self.cpu.mem_write(0x44ca3c,b'\xd9\x05'+struct.pack('<I',RUNNER+0xd000)+b'\xc3')
  # 445ab3/445ac9 return AL=0 for collected hits, AL=1 for an empty list.
  self.cpu.mem_write(0x4459a4,b'\xa1'+struct.pack('<I',RUNNER+0xd10c)+b'\xc2\x0c\x00')
  self.cpu.mem_write(0x446764,b'\xa1'+struct.pack('<I',RUNNER+0xd108)+b'\xc2\x1c\x00');self.cpu.mem_write(0x418e44,b'\xc2\x04\x00');self.cpu.mem_write(0x418dc0,b'\xd9\xee\xc3');self.cpu.mem_write(0x42ecf0,b'\xc2\x08\x00')
  self.cpu.hook_add(UC_HOOK_CODE,self._wall,begin=0x446764,end=0x446764)
 def _query(self,cpu,address,size,data):
  sp=cpu.reg_read(UC_X86_REG_ESP);x,z=self.read(sp+4,'ff');out=self.read(sp+12,'I')[0];hits=self.query_scene(action='ground',x=x,z=z);self.groundCalls+=1
  if len(hits)>16:raise RuntimeError('Ground list exceeds native supplied buffer')
  self.write(RUNNER+0xd10c,'I',int(not hits));self.cpu.mem_write(out,b'\0'*0x204);self.write(out,'I',len(hits))
  for i,h in enumerate(hits):self.write(out+4+i*32,'fff',*h['normal'].values());self.write(out+0x14+i*32,'f',h['height'])
 def _wall(self,cpu,address,size,data):
  sp=cpu.reg_read(UC_X86_REG_ESP);points=self.read(sp+4,'ffffff');out=self.read(sp+28,'I')[0];hits=self.query_scene(action='sweep',**{'from':dict(zip('xyz',points[:3])),'to':dict(zip('xyz',points[3:]))});self.wallCalls+=1
  if len(hits)>16:raise RuntimeError('Sweep list exceeds native supplied buffer')
  self.write(RUNNER+0xd108,'I',int(not hits));self.write(out,'I',len(hits))
  for i,h in enumerate(hits):self.write(out+4+i*32,'ffffffII',*h['normal'].values(),*h['point'].values(),0,RUNNER+0xe000)
 def setup(self,r,dt):
  self.cpu.mem_write(RUNNER,b'\0'*0x10000);self.cpu.mem_write(RUNNER+0xe000,b'wall\0');self.write(RUNNER+0xb0,'fff',r['x'],r['y'],r['z']);self.write(RUNNER+0x68,'fff',r['x'],r['y'],r['z']);self.write(0x48f168,'f',7.5);self.write(0x48f394,'I',0)
  self.write(RUNNER+0x1b5,'B',1);self.write(RUNNER+0xd000,'f',dt);self.write(RUNNER+0xd100,'II',1,0)
  for address,value in [(0x518aa8,dt),(0x49064c,dt),(0x48f130,.2),(0x48f134,2),(0x48f138,10),(0x48f13c,98),(0x48f174,.12),(0x48f178,30),(0x48f17c,15),(0x48f180,100),(0x48f184,800),(0x48f188,3),(0x48f18c,.75),(0x48f190,400),(0x48f194,350),(0x48f19c,100),(0x48f1a0,80),(0x48f1a4,20)]:self.write(address,'f',value)
  self.write(0x48f140,'B',0);self.write(0x490650,'I',1);self.write(RUNNER,'II',0,0);self.write(RUNNER+8,'BB',r['actionMode'],r['previousActionMode']);self.write(RUNNER+0x2c,'fff',r['x'],r['y'],r['z']);self.write(RUNNER+0xfc,'ff',190,75);self.write(RUNNER+0x104,'fff',r['yaw']*180/math.pi,0.,0.);self.write(RUNNER+0x14c,'BB',1,1);self.write(RUNNER+0x15c,'BB',int(r['movementEnabled']),1);self.write(RUNNER+0x16c,'f',r['supportBrake']);self.call(0x42f9cc,eax=RUNNER)
 def snapshot(self):
  return dict(position=list(self.read(RUNNER+0x2c,'fff')),yaw=self.read(RUNNER+0x104,'f')[0],pitch=self.read(RUNNER+0x108,'f')[0],roll=self.read(RUNNER+0x10c,'f')[0],turn=self.read(RUNNER+0xe4,'f')[0],turnAcceleration=self.read(RUNNER+0xe0,'f')[0],acceleration=-self.read(RUNNER+0x180,'f')[0],localVelocity=list(self.read(RUNNER+0x190,'fff')),worldVelocity=list(self.read(RUNNER+0x184,'fff')),forward=list(self.read(RUNNER+0x8c,'fff')),frontVelocity=self.read(RUNNER+0x144,'f')[0],sideVelocity=self.read(RUNNER+0x148,'f')[0],grounded=bool(self.read(RUNNER+0x14c,'B')[0]),controlsEnabled=bool(self.read(RUNNER+0x14d,'B')[0]),disableTimer=self.read(RUNNER+0x154,'f')[0],movementEnabled=bool(self.read(RUNNER+0x15c,'B')[0]),supportContact=bool(self.read(RUNNER+0x15d,'B')[0]),brake=self.read(RUNNER+0x16c,'f')[0],slopeImpulse=self.read(RUNNER+0x174,'f')[0],nitro=self.read(RUNNER+0x6e4,'f')[0])

def main():
 results=[];n=SceneNative()
 try:
  for arena,round,portal in [(1,1,'31'),(2,1,'31'),(3,1,'31'),(7,1,'31')]:
   dt=f32(1/60);initial=scene(action='load',arena=arena,round=round,portal=portal,dt=dt);n.setup(initial['r'],dt);samples=[];mismatches=[];maximum=0.
   for frame in range(180):
    n.call(0x42f0f0,[0.,0.],eax=RUNNER);n.call(0x42f200,[-20.,0.],eax=RUNNER);n.call(0x42f39c,eax=RUNNER);a=n.snapshot();b=scene(action='step');samples.append({'native':a,'rebuild':b['state'],'contacts':b['contacts']})
    for key,x in a.items():
     y=b['state'][key]
     if isinstance(x,bool):error=float(x!=y)
     else:error=max(abs(v-w) for v,w in zip(x,y)) if isinstance(x,list) else abs(x-y)
     maximum=max(maximum,error)
     if error>1e-10:mismatches.append({'frame':frame,'field':key,'native':x,'rebuild':y,'error':error})
    if mismatches:break
   results.append({'arena':arena,'round':round,'portal':portal,'initial':initial['state'],'samples':samples,'mismatches':mismatches,'maxNumericError':maximum});print(json.dumps({'arena':arena,'frames':len(samples),'mismatches':mismatches[:3],'maxNumericError':maximum}),flush=True)
 finally:process.stdin.close();process.wait(timeout=10)
 report={'scope':'Actual original control accumulators 42f0f0/42f200 and physical action 42f39c with collision/support actions, querying the same decoded polygon adapter as production. Closed doors do not animate.','sha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'emulator':'Unicorn '+__version__,'results':results,'passed':all(not r['mismatches'] for r in results),'limitations':['Native scene traversal/facet flags/hit ordering are replaced by the production Three.js adapter; these remain unverified.','Ground special-object handlers, periodic keep-moving action, profile damage, drawing/audio and full scene scheduling are explicit stubs.','Human model 0, supplied float frame clocks and isolated closed-portal approaches; not a native full-game/frame equivalence claim.']}
 (ROOT/'private/verification/portal-physical-native.json').write_text(json.dumps(report,indent=2)+'\n')
 if not report['passed']:raise SystemExit(1)

if __name__=='__main__':main()
