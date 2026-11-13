#!/usr/bin/env python3
"""Real 433048 candidate-position rejection and classifier."""
import hashlib,json,math,struct,subprocess,itertools
from unicorn import UC_HOOK_CODE,__version__
from unicorn.x86_const import UC_X86_REG_ESP
from native_ai_audit import Native,ROOT,EXE,RUNNER,f32
n=Native();fixtures=[];native=[];queries=[];case={}
n.cpu.mem_write(0x446764,b'\xa1'+struct.pack('<I',RUNNER+0xd100)+b'\xc2\x1c\x00')
def query(cpu,address,size,data):
 sp=cpu.reg_read(UC_X86_REG_ESP);p=n.read(sp+4,'ffffff');out=n.read(sp+28,'I')[0];queries.append(dict(from_=list(p[:3]),to=list(p[3:])));hit=len(queries)==case['hitAt'];n.write(RUNNER+0xd100,'I',int(not hit));n.write(out,'I',int(hit))
 if hit:n.write(out+4,'ffffffII',0,1 if case['category']=='floor' else 0,1,35,5,37,7,RUNNER+0x2100)
n.cpu.hook_add(UC_HOOK_CODE,query,begin=0x446764,end=0x446764)
for yaw,pitch,human,hitAt,category in itertools.product([0,30,135,270],[0,.3],[False,True],range(4),['wall','floor','runner']):
 angle=yaw*3.141592654/180;r=dict(forwardVector=dict(x=f32(-math.sin(angle)*math.cos(pitch)),y=f32(math.sin(pitch)),z=f32(-math.cos(angle)*math.cos(pitch))),frontVelocity=4,worldVelocity=dict(x=0,y=3,z=-30),previousCollisionProbe=dict(x=29.5,y=4.7,z=32.5),previousCollisionCenter=dict(x=30.2,y=4.8,z=40.3));fixtures.append(dict(r=r,candidate=dict(x=31,y=5,z=41),human=human,hitAt=hitAt,category=category,dt=f32(1/60)))
for case in fixtures:
 r=case['r'];queries.clear();n.cpu.mem_write(RUNNER,b'\0'*0x1000);name='runner_1' if case['category']=='runner' else 'wall';n.cpu.mem_write(RUNNER+0x2100,name.encode()+b'\0');n.write(0x518aa8,'f',case['dt']);n.write(0x48f168,'f',7.5);n.write(0x48f394,'I',0)
 for offset,v in [(0x8c,list(r['forwardVector'].values())),(0xbc,list(r['previousCollisionProbe'].values())),(0x5c,list(r['previousCollisionCenter'].values())),(0x184,list(r['worldVelocity'].values()))]:n.write(RUNNER+offset,'fff',*v)
 n.write(RUNNER+0x144,'f',r['frontVelocity']);n.write(RUNNER+0x1b5,'B',int(case['human']));n.write(RUNNER+0x1800,'fff',*case['candidate'].values());rejected=n.call(0x433048,eax=RUNNER,edx=RUNNER+0x1800)&255;native.append(dict(rejected=bool(rejected),queries=[{'from':q['from_'],'to':q['to']} for q in queries]))
js="""
import {rejectCollisionPosition} from './src/collision-sweep.js';let s='';for await(let b of process.stdin)s+=b;console.log(JSON.stringify(JSON.parse(s).map(f=>{let count=0,result=rejectCollisionPosition(f.r,f.candidate,f.dt,(a,b)=>++count===f.hitAt?[{node:{name:f.category==='runner'?'runner_1':'wall'},normal:{x:0,y:f.category==='floor'?1:0,z:1},point:{x:35,y:5,z:37}}]:[],{human:f.human});return {rejected:result.rejected,queries:result.queries.map(q=>({from:Object.values(q.from),to:Object.values(q.to)}))}})))
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT));mismatches=[];maxerr=0
for i,(a,b) in enumerate(zip(native,rebuilt)):
 if a['rejected']!=b['rejected'] or len(a['queries'])!=len(b['queries']):mismatches.append(dict(fixture=i,native=a,rebuild=b));continue
 for j,(x,y) in enumerate(zip(a['queries'],b['queries'])):
  for key in x:
   error=max(abs(v-w) for v,w in zip(x[key],y[key]));maxerr=max(maxerr,error)
   if error>1e-10:mismatches.append(dict(fixture=i,query=j,field=key,native=x[key],rebuild=y[key]))
report=dict(scope='Actual 433048 candidate-position rejection: real query construction, contact classifier and recursive name lookup. Supplied wall/floor/runner query results.',sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,fixtures=fixtures,native=native,rebuild=rebuilt,maxNumericError=maxerr,tolerance=1e-10,mismatches=mismatches,passed=not mismatches,limitations=['Original scene traversal and ordered intersections are supplied; synthetic scene nodes and visibility stubs.','This isolated rejection test does not execute response, floor following, dynamic scene facets, rendering or a full native round.'])
(ROOT/'private/verification/collision-rejection-native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(fixtures=len(fixtures),maxNumericError=maxerr,mismatches=len(mismatches),firstMismatches=mismatches[:8],passed=not mismatches),indent=2))
if mismatches:raise SystemExit(1)
