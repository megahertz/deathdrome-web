"""Execute 435d68 with supplied ordered intersections and real 435828 response.

Ray collection supplies records; native parent-prefix lookup, record iteration,
impact placement, health/score/kill setters, recoil and impact voice pool run.
Render/audio delivery, hot spots, doors and UI delivery are observation hooks.
"""
import hashlib,json,struct,subprocess
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX,UC_X86_REG_EDX,UC_X86_REG_EBX,UC_X86_REG_ESP
from native_ai_audit import Native,ROOT,EXE,RUNNER,f32

class PrimaryNative(Native):
 def __init__(self):
  super().__init__();self.records=[];self.events=[];self.cpu.mem_map(0x3100000,0x10000)
  for a in [0x44b4f0,0x42a7a8,0x4182f4,0x4161b8,0x440294,0x43a0e0,0x4408c0,0x41586c]:self.cpu.mem_write(a,b'\xc3')
  self.cpu.mem_write(0x446764,b'\xc2\x1c\x00')
  for a in [0x44b4f0,0x42a7a8,0x4182f4,0x4161b8,0x440294,0x43a0e0,0x4408c0,0x41586c,0x446764]:self.cpu.hook_add(UC_HOOK_CODE,self.observe,begin=a,end=a)
 def observe(self,c,a,s,d):
  eax,edx=c.reg_read(UC_X86_REG_EAX),c.reg_read(UC_X86_REG_EDX)
  if a==0x446764:
   sp=c.reg_read(UC_X86_REG_ESP);self.segment=list(self.read(sp+4,'6f'));out=self.read(sp+28,'I')[0];self.write(out,'I',len(self.records))
   for i,(node,point) in enumerate(self.records):self.write(out+4+i*32,'7fI',0,0,1,*point,0,node)
   c.reg_write(UC_X86_REG_EAX,int(not self.records))
  elif a==0x4182f4:self.events.append(['sound',eax])
  elif a==0x42a7a8:self.events.append(['impact',list(self.read(eax,'3f'))])
  elif a==0x4161b8:self.events.append(['kill',eax,edx])
  elif a==0x440294:self.events.append(['flash',2])
  elif a==0x43a0e0:self.events.append(['hotSpot',eax])
  elif a==0x4408c0:self.events.append(['door',bytes(c.mem_read(eax,32)).split(b'\0')[0].decode()])
  elif a==0x41586c:self.events.append(['bodyBonus'])
 def run(self,f):
  self.records=[];self.events=[];self.segment=None;self.cpu.mem_write(RUNNER,b'\0'*0x10000);self.write(0x48f158,'I',8);self.write(0x48bf64,'I',0);self.write(0x4b5d50,'B',0);self.write(0x48d8b8,'B',0);self.write(0x48f1b8,'I',f['owner'])
  tables=json.loads((ROOT/'private/assets/game-tables.json').read_text())
  for model in range(8):
   runner=RUNNER+model*0x1000;node=RUNNER+0x9000+model*128
   self.write(runner,'2I',model,model);self.write(runner+12,'I',node);self.write(node+0x4c,'I',runner);self.write(0x48f104+model*4,'I',node)
   self.write(runner+0x6e8,'2f',tables['runners'][model]['armorFactor'],tables['runners'][model]['weaponFactor']);self.write(runner+0x104,'f',f32(model*37.5));self.write(runner+0x190,'3f',2,3,-4);self.write(runner+0x4b0,'I',99)
   self.write(0x48d8d8+model*80,'I',0 if model==f['player'] else 1);self.write(0x48d8e0+model*80,'I',model);self.write(0x48d8d0+model*80,'f',f['health'] if model==f['target'] else 100);self.write(0x48d8e5+model*80,'B',int(f['shielded'] and model==f['target']));self.write(0x48d8bc+model*80,'I',0);self.write(0x48d8c4+model*80,'I',0)
  for i,hit in enumerate(f['hits']):
   node=0x3100000+i*0x400;parents=[]
   for j,name in enumerate(hit['names']):
    at=node+j*128;self.cpu.mem_write(at,name.encode()+b'\0');self.write(at+0x58,'II',int(bool(parents)),at+96)
    if parents:self.write(at+96,'I',parents[-1])
    parents.append(at)
   self.records.append((parents[-1],hit['point']))
  owner=RUNNER+f['owner']*0x1000;self.write(owner+0x6ac,'I',1 if f['missile'] else 4)
  previous,end,velocity=[RUNNER+0xd000+i*16 for i in range(3)]
  for at,values in [(previous,f['previous']),(end,f['current']),(velocity,f['velocity'])]:self.write(at,'3f',*values)
  bits=struct.unpack('<f',struct.pack('<I',velocity))[0];result=self.call(0x435d68,[bits],eax=0,edx=owner,ebx=end,ecx=previous)
  return {'contact':bool(result&255),'segment':self.segment,'health':[self.read(0x48d8d0+i*80,'f')[0]for i in range(8)],'kills':[self.read(0x48d8c4+i*80,'I')[0]for i in range(8)],'localVelocity':[list(self.read(RUNNER+i*0x1000+0x190,'3f'))for i in range(8)],'weapon':self.read(owner+0x4b0,'I')[0],'score':self.read(0x48d8bc+f['player']*80,'I')[0],'voice':self.read(0x48f1b8,'I')[0],'events':self.events}

def main():
 fixtures=[];native=[];n=PrimaryNative()
 cases=['clear','wall','runner','shield','zeroHealth','lethal','owner','many','wallThenRunner','runnerThenWall','duplicateRunner','hotSpot','barrier','body','door','doorChild','outLow','outHigh','boundary','runner10','badRunner','caseSensitive']
 for owner in range(8):
  for missile in [False,True]:
   for case in cases:
    target=(owner+1)%8;hit=lambda names,j=0:{'names':names,'point':[f32(12.25+j),f32(2.5),f32(-3.125-j)]}
    runner=hit([f'runner_{target}','chassis']);wall=hit(['wall']);hits=[]
    if case in ['runner','shield','zeroHealth','lethal']:hits=[runner]
    elif case=='owner':hits=[hit([f'runner_{owner}','chassis'])]
    elif case=='wall':hits=[wall]
    elif case=='many':hits=[runner,hit([f'runner_{(owner+2)%8}','chassis'],1),hit(['wall'],2)]
    elif case=='wallThenRunner':hits=[wall,runner]
    elif case=='runnerThenWall':hits=[runner,wall]
    elif case=='duplicateRunner':hits=[runner,runner]
    elif case=='hotSpot':hits=[hit(['HotSpot_parent_0','box'])]
    elif case=='barrier':hits=[hit(['barrier_0','shape'])]
    elif case=='body':hits=[hit(['dedbody','shape'])]
    elif case=='door':hits=[hit(['door_x'])]
    elif case=='doorChild':hits=[hit(['door_x','lift_x'])]
    elif case=='runner10':hits=[hit(['runner_10','chassis'])]
    elif case=='badRunner':hits=[hit(['runner_9','chassis'])]
    elif case=='caseSensitive':hits=[hit([f'RUNNER_{target}','chassis'])]
    current=[f32(14.5),f32(-.01 if case=='outLow' else 64.01 if case=='outHigh' else 64 if case=='boundary' else 2.25),f32(-6.5)]
    f=dict(owner=owner,player=owner if owner%2==0 else target,target=target,missile=missile,health=0 if case=='zeroHealth' else f32(.1) if case=='lethal' else 100,shielded=case=='shield',previous=[f32(10.1),f32(2.2),f32(-1.3)],current=current,velocity=[f32(20.4+owner),f32(-2.3),f32(-151.7)],hits=hits,case=case);fixtures.append(f);native.append(n.run(f))
 js=r"""
import {Simulation} from './src/simulation.js';import {primarySegment,dispatchPrimaryContacts} from './utils/experimental/primary-contact.js';let input='';for await(const c of process.stdin)input+=c;const xyz=v=>({x:v[0],y:v[1],z:v[2]});
console.log(JSON.stringify(JSON.parse(input).map(f=>{const sim=new Simulation({player:f.player,maximumRunners:8}),target=sim.runners[f.target];sim.events=[];const originalDamage=sim.damage.bind(sim);sim.damage=(target,amount,owner,weapon,...options)=>{const before=owner==null?0:sim.runners[owner].kills;const result=originalDamage(target,amount,owner,weapon,...options);if(owner!=null&&sim.runners[owner].kills>before){if(owner===sim.player&&before<sim.requiredKills&&sim.runners[owner].kills>=sim.requiredKills)sim.emit('exitReady',{runner:owner});sim.emit('killCredited',{runner:owner,victim:target.id,weapon})}return result};sim.keepMovingState.impactVoice=f.owner;for(const r of sim.runners)Object.assign(r,{yaw:Math.fround(r.id*37.5)*Math.PI/180,lateralSpeed:2,localVerticalSpeed:3,speed:4,lastHitWeaponCode:99});target.health=f.health;target.shield=f.shielded?10:0;sim.hotSpots.spots=[{id:0,phase:0}];sim.hotSpots.trigger=()=>{sim.emit('observedHotSpot');return null};sim.doors.touch=(key)=>sim.emit('observedDoor',{name:'door_'+key});const hits=f.hits.map(hit=>{let node=null;for(const name of hit.names)node={name,parents:node?[node]:[]};return {node,point:xyz(hit.point)}});const p={owner:f.owner,kind:f.missile?'Missile':'Laser',damage:f.missile?140:4,...xyz(f.current),vx:f.velocity[0],vy:f.velocity[1],vz:f.velocity[2],life:1};const contact=dispatchPrimaryContacts(sim,p,xyz(f.previous),hits),events=[];for(const e of sim.events){if(e.type==='primaryImpact'){if(e.sound)events.push(['sound',e.soundId]);events.push(['impact',Object.values(e.point)])}if(e.type==='paletteFlash')events.push(['flash',2]);if(e.type==='observedHotSpot')events.push(['hotSpot',f.owner]);if(e.type==='observedDoor')events.push(['door',e.name]);if(e.type==='bodyHit')events.push(['bodyBonus'],['sound',3]);if(e.type==='exitReady')events.push(['sound',58]);if(e.type==='killCredited')events.push(['kill',e.runner,e.victim])}const segment=primarySegment(xyz(f.previous),p);return {contact,segment:p.y<0||p.y>64?null:[...Object.values(segment.from),...Object.values(segment.to)],health:sim.runners.map(r=>r.health),kills:sim.runners.map(r=>r.kills),localVelocity:sim.runners.map(r=>[r.lateralSpeed,r.localVerticalSpeed,-r.speed]),weapon:sim.runners[f.owner].lastHitWeaponCode,score:sim.score,voice:sim.keepMovingState.impactVoice,events}})));
"""
 rebuild=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js','--input-type=module','-e',js],cwd=ROOT,input=json.dumps(fixtures).encode()))
 mismatches=[];maxerror=0
 def equal(a,b,path=''):
  nonlocal maxerror
  if isinstance(a,(int,float)) and not isinstance(a,bool) and isinstance(b,(int,float)):
   error=abs(a-b);maxerror=max(error,maxerror);return error<=1e-5
  if type(a)!=type(b):return False
  if isinstance(a,list):return len(a)==len(b) and all(equal(x,y,path)for x,y in zip(a,b))
  if isinstance(a,dict):return a.keys()==b.keys()and all(equal(a[k],b[k],path+'.'+k)for k in a)
  return a==b
 for i,(a,b) in enumerate(zip(native,rebuild)):
  for key in a:
   if not equal(a[key],b[key]):mismatches.append({'fixture':i,'case':fixtures[i]['case'],'field':key,'native':a[key],'rebuild':b[key]})
 report=dict(scope=__doc__,sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),fixtures=fixtures,native=native,cases=len(fixtures),mismatchCount=len(mismatches),mismatches=mismatches[:12],maximumNumericError=maxerror,tolerance=1e-5,passed=not mismatches,limits=['Ordered contacts and finite positions/velocities are supplied; original scene collection is not run in this audit.','Hot-spot/door handlers and rendering/audio/UI delivery are hooks. Native real prefix matching, complete record loop, float hit effect placement, health/score/kill updates and recoil run.','Complete scene timing, original audiovisual presentation, dynamic ownership and full rounds remain unverified.'])
 (ROOT/'private/verification/primary-contact-native.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k]for k in ['cases','mismatchCount','mismatches','maximumNumericError','passed']},indent=2))
 if mismatches:raise SystemExit(1)
if __name__=='__main__':main()
