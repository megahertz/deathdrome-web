#!/usr/bin/env python3
"""Run actual collision classification and recursive native name lookup."""
import hashlib,json,struct,subprocess,itertools
from unicorn import __version__
from native_ai_audit import Native,ROOT,EXE,RUNNER,SCRATCH,f32
n=Native();fixtures=[];native=[]
# 0x431d88, 0x434c54, 0x468f17, 0x4392ac and 0x44b674 all execute unchanged.
roots=[dict(name=name) for name in ['EKey','EKey_blue','HotSpot_parent','barrier_7','runner_4','enh_msl','scrub_model','wall','ekey','Runner_4']]
roots+=[dict(name='assembly',parents=[dict(name='runner_3'),dict(name='runner_7')]),dict(name='runner_2',parents=[dict(name='EKey_child')]),dict(name='assembly',parents=[dict(name='leaf',parents=[dict(name='enh_nested')]),dict(name='HotSpot_parent_inner')])]
for rootindex,normaly,enabled,sequence,preexisting in itertools.product(range(len(roots)),[-1,.7,.71,.710001,1],[False,True],range(4),[False,True]):
 hits=[dict(node=roots[rootindex],normal=dict(x=.25,y=f32(normaly),z=.5),point=dict(x=30,y=4,z=40),tag=1)]
 if sequence>0:hits.append(dict(node=roots[(rootindex+3)%len(roots)],normal=dict(x=.5,y=1,z=.25),point=dict(x=35,y=5,z=45),tag=2))
 if sequence>1:hits.append(dict(node=dict(name='plain'),normal=dict(x=0,y=1,z=1),point=dict(x=40,y=6,z=50),tag=3))
 if sequence>2:hits.append(dict(node=roots[rootindex],normal=dict(x=.75,y=0,z=.25),point=dict(x=45,y=7,z=55),tag=4))
 fixtures.append(dict(hits=hits,source=dict(x=10,y=2,z=20),endpoint=dict(x=50,y=3,z=60),scrubCollidable=enabled,preexisting=preexisting))
for fixture in fixtures:
 n.cpu.mem_write(RUNNER,b'\0'*0x1000);n.cpu.mem_write(SCRATCH,b'\0'*0x1000);nodes={};counter=[0]
 def put_node(node):
  index=counter[0];counter[0]+=1;address=RUNNER+0x2000+index*0x100;nodes[address]=node['name']+'#'+str(index);n.cpu.mem_write(address,node['name'].encode()+b'\0');n.write(address+0x30,'I',index%2)
  parents=[put_node(c) for c in node.get('parents',[])];n.write(address+0x58,'II',len(parents),address+0x80)
  if parents:n.write(address+0x80,'I'*len(parents),*parents)
  return address
 n.write(SCRATCH,'I',len(fixture['hits']));n.write(RUNNER+0x1000,'fff',*fixture['source'].values());n.write(RUNNER+0x1010,'fff',*fixture['endpoint'].values());n.write(0x48f394,'I',int(fixture['scrubCollidable']))
 for i,h in enumerate(fixture['hits']):
  address=put_node(h['node']);n.write(SCRATCH+4+i*32,'ffffffII',*h['normal'].values(),*h['point'].values(),h['tag'],address)
 if fixture['preexisting']:
  n.write(RUNNER+0x1c,'I',0x1234);n.write(RUNNER+0x18,'I',99)
 n.call(0x431d88,eax=SCRATCH,edx=RUNNER,ebx=RUNNER+0x1000,ecx=RUNNER+0x1010)
 row={}
 for kind,offset in [('hotSpot',0),('key',0x38),('runner',0x70),('enhancer',0xa8),('floor',0xe0),('wall',0x118),('barrier',0x150),('scrub',0x188)]:
  target=n.read(RUNNER+offset+0x1c,'I')[0]
  if target:row[kind]=dict(node=nodes.get(target,'preexisting'),tag=n.read(RUNNER+offset+0x18,'I')[0],normal=list(n.read(RUNNER+offset,'fff')),point=list(n.read(RUNNER+offset+0xc,'fff')),source=list(n.read(RUNNER+offset+0x20,'fff')),endpoint=list(n.read(RUNNER+offset+0x2c,'fff')))
 native.append(row)
js="""
import {classifyContacts} from './src/collision-sweep.ts';let s='';for await(let b of process.stdin)s+=b;console.log(JSON.stringify(JSON.parse(s).map(f=>{let count=0;function ids(n){n.id=n.name+'#'+count++;for(let c of n.parents??[])ids(c)}for(let h of f.hits)ids(h.node);let records=f.preexisting?{hotSpot:{node:{id:'preexisting'},tag:99,normal:{x:0,y:0,z:0},point:{x:0,y:0,z:0},source:{x:0,y:0,z:0},endpoint:{x:0,y:0,z:0}}}:{};classifyContacts(f.hits,f.source,f.endpoint,{records,scrubCollidable:f.scrubCollidable});return Object.fromEntries(Object.entries(records).map(([k,v])=>[k,{node:v.node.id,tag:v.tag,normal:Object.values(v.normal),point:Object.values(v.point),source:Object.values(v.source),endpoint:Object.values(v.endpoint)}]))})))
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT));mismatches=[dict(fixture=i,native=a,rebuild=b) for i,(a,b) in enumerate(zip(native,rebuilt)) if a!=b];report=dict(scope='Actual original 431d88 contact classification, real recursive 434c54/468f17 name lookup, 4392ac state getter and 44b674 property access. Supplied ordered intersections and synthetic parent graphs.',sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,fixtures=fixtures,native=native,rebuild=rebuilt,mismatches=mismatches,passed=not mismatches,limitations=['Scene traversal, facet eligibility and native ordering of generated intersections are supplied. Synthetic nodes store actual names/parent arrays/flags, not complete scene graphs.','This classifier does not execute query generation, contact handlers, physical response, correction rejection, scene animation or a full native round.'])
(ROOT/'private/verification/collision-classification-native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(fixtures=len(fixtures),mismatches=len(mismatches),firstMismatches=mismatches[:2],passed=not mismatches),indent=2))
if mismatches:raise SystemExit(1)
