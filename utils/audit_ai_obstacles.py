#!/usr/bin/env python3
"""Compare path/attack obstacle branches with isolated original x86 actions.

Requires optional Unicorn 2.x, outside the browser game runtime.
PYTHONPATH=/tmp/deathdrome-audit-python python3 utils/audit_ai_obstacles.py
"""
import hashlib
import json
import math
import struct
import subprocess
from unicorn import UC_HOOK_CODE, __version__ as unicorn_version
from unicorn.x86_const import UC_X86_REG_ESP
from native_ai_audit import Native, ROOT, EXE, RUNNER, NODE_POOL, SCRATCH, f32

GRAPH = [dict(id=i, color=12, position=p, links=links) for i, (p, links) in enumerate([
    ([0., 0., -100.], [1, 3, -1]), ([100., 0., -100.], [2, 0, -1]),
    ([100., 0., 0.], [3, 1, -1]), ([0., 0., 0.], [0, 2, -1])])]
TARGET, BARRIER, JUMPS, RANDOMS = RUNNER+0x6000, RUNNER+0x7000, SCRATCH+0x200, SCRATCH+0x204
fixtures = []
for mode in ['path', 'attack']:
    for kind in ['clear','contact-empty','contact-runner','contact-wall','probe-wall','probe-own-barrier','probe-other-barrier']:
        for level in range(8):
            for random in [12345,32767] if 'barrier' in kind else [0]:
                for zoneMask,entranceZoneMask in [(0,0),(1,1),(1,2),(0x80000000,0x80000000)]:
                    fixtures.append(dict(mode=mode,kind=kind,level=level,random=random,zoneMask=zoneMask,entranceZoneMask=entranceZoneMask,steps=11 if mode=='attack' and kind=='contact-wall' else 1))
for fixture in list(fixtures):
    if fixture['kind'].startswith('probe-'):
        for position,forward in [([123.456,-.123,234.567],[.23,.6,-.766]),([-100.001,15.999999,30.000001],[-.123456,.000001,.987654])]:
            fixtures.append(dict(fixture,position=list(map(f32,position)),forward=list(map(f32,forward))))

native_results = []
for fixture in fixtures:
    n = Native()
    n.graph(GRAPH)
    # These stubs isolate controller actions from scene hit collection, jump
    # physics, object properties and the CRT's per-thread RNG storage.
    n.cpu.mem_write(0x431d88, b'\xc3')
    n.cpu.mem_write(0x430f18, b'\xff\x05'+struct.pack('<I',JUMPS)+b'\xc3')
    n.cpu.mem_write(0x45a8e6, b'\xff\x05'+struct.pack('<I',RANDOMS)+b'\xb8'+struct.pack('<I',fixture['random'])+b'\xc3')
    n.cpu.mem_write(0x42b468, b'\xb8'+struct.pack('<I',1 if fixture['kind']=='probe-own-barrier' else 2)+b'\xc3')
    n.write(RUNNER, 'I', 1)
    n.write(RUNNER+0xd8,'I',fixture['zoneMask'])
    n.write(0x518a74,'I',fixture['entranceZoneMask'])
    n.write(RUNNER+0x2c, 'fff', 0.,0.,-30.)
    n.write(RUNNER+0x80, 'ffffff', 0.,0.,-1.,0.,0.,-1.)
    if 'position' in fixture:
        n.write(RUNNER+0x2c,'3f',*fixture['position']);n.write(RUNNER+0x8c,'3f',*fixture['forward'])
    n.write(RUNNER+0xfc, 'ff', 185.,80.)
    n.write(RUNNER+0xe0, 'ff', f32(.1*180/math.pi), f32(.2*180/math.pi))
    n.write(RUNNER+0x180, 'f', -23.)
    n.write(RUNNER+0x1ea, 'BB', 1 if fixture['mode']=='attack' else 0,0)
    n.write(RUNNER+0x1f4, 'f', 100.)
    n.write(RUNNER+0x1f8, 'fff', 0.,0.,-1.)
    n.write(RUNNER+0x214, 'f', 99.)
    n.write(RUNNER+0x220, 'ff', 0.,100.)
    n.write(RUNNER+0x234, 'I', TARGET)
    n.write(TARGET+0x15e, 'B', 1)
    n.write(TARGET+0x2c, 'fff', 0.,0.,-100.)
    n.write(TARGET+0x198, 'f', -30.)
    n.write(RUNNER+0x244, 'B', int(not fixture['kind'].startswith('contact-')))
    n.write(RUNNER+0x2d4, 'I', TARGET if fixture['kind']=='contact-runner' else 0)
    n.write(RUNNER+0x37c, 'I', 1 if fixture['kind']=='contact-wall' else 0)
    n.write(RUNNER+0x360, 'fff', 1.,0.,0.)
    n.write(RUNNER+0x3b4, 'I', BARRIER if 'barrier' in fixture['kind'] else 0)
    n.write(0x48f018, 'I', fixture['level'])
    n.write(0x48f19c, 'f', 100.)
    n.write(0x518aa4, 'ff', 7., f32(1/60))
    n.visibility(not fixture['kind'].startswith('probe-'))
    queries = []
    def capture(cpu, address, size, user_data):
        queries.append(list(n.read(cpu.reg_read(UC_X86_REG_ESP)+4,'ffffff')))
    n.cpu.hook_add(UC_HOOK_CODE,capture,begin=0x446764,end=0x446764)
    for i in range(fixture['steps']):
        n.call(0x42befc if fixture['mode']=='attack' else 0x42d0e8,eax=RUNNER)
    mode = {0:'path',1:'attack',3:'recover'}[n.read(RUNNER+0x1ea,'B')[0]]
    node = n.read(RUNNER+0x1ec,'I')[0]
    native_results.append(dict(turn=n.read(RUNNER+0xe4,'f')[0],turnAcceleration=n.read(RUNNER+0xe0,'f')[0],
        acceleration=-n.read(RUNNER+0x180,'f')[0],mode=mode,
        alignment=list(n.read(RUNNER+0x204,'fff'))[::2] if mode=='recover' else None,
        recoverUntil=n.read(RUNNER+0x220,'f')[0],jumpAt=n.read(RUNNER+0x214,'f')[0],
        jumpRequests=n.read(JUMPS,'I')[0],randomCalls=n.read(RANDOMS,'I')[0],
        attackCollisions=n.read(RUNNER+0x228,'I')[0],current=n.node_id(node),queries=queries))

js = r"""
import {Simulation} from './src/simulation.js';
import {routeSegment,stepNavigation} from './src/ai-navigation.js';
import {stepAIAttack} from './src/ai-actions.js';
import {GAME_TABLES} from './src/game-tables.js';
let data=JSON.parse(await new Promise(resolve=>{let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>resolve(s))}));
let results=data.fixtures.map(f=>{
 let sim=new Simulation({paths:data.graph,maximumRunners:1}),r=sim.runners[1],q=sim.runners[0],queries=[],randomCalls=0;sim.countdown=0;
 Object.assign(r,{x:0,y:0,z:-30,yaw:0,speed:30,turn:.2,turnAcceleration:.1,acceleration:23,zoneMask:f.zoneMask,aiContact:{clear:!f.kind.startsWith('contact-')}});sim.entranceZoneMask=f.entranceZoneMask;
 if(f.position){[r.x,r.y,r.z]=f.position;r.forwardVector={x:f.forward[0],y:f.forward[1],z:f.forward[2]}}
 if(f.kind==='contact-runner')r.aiContact.runner=0;if(f.kind==='contact-wall')r.aiContact.wall={x:1,z:0};
 Object.assign(q,{x:0,y:0,z:-100,speed:30});
 r.navigation={goalColor:12,attackCollisions:0,refreshAt:100,visited:0,temporaryVisited:0,alignment:null,segment:routeSegment({x:0,y:0,z:0},{x:0,y:0,z:-100},{startNode:3,endNode:0,color:12})};
 Object.assign(r.aiState,{mode:f.mode,target:0,previousDirection:{x:0,z:-1},shotAt:100,recoverUntil:0,jumpAt:99,pendingJump:false});
 sim.randomInt=()=>{randomCalls++;return f.random};
 let record=(a,b)=>queries.push([a.x,a.y,a.z,b.x,b.y,b.z]);sim.lineBlocked=(a,b)=>{record(a,b);return false};
 sim.sceneContacts=(a,b)=>{record(a,b);return !f.kind.startsWith('probe-')?[]:[{kind:f.kind.includes('barrier')?'barrier':'wall',owner:f.kind==='probe-own-barrier'?1:2}]};
 // Path jump permission uses arena aggression; pick a domain/round matching
 // the requested barrier-jump switch while preserving the fixture runner/graph.
 let found=false;for(let i=0;i<8&&!found;i++)for(let j=0;j<3;j++)if(GAME_TABLES.ai.aggression[i][j]===f.level){sim.arena=i+1;sim.round=j+1;found=true;break}
 let rates;for(let i=0;i<f.steps;i++)rates=f.mode==='attack'?stepAIAttack(sim,r,q,GAME_TABLES.ai.levels[f.level]):stepNavigation(sim,r,1/60,100);
 return {turn:rates.turn*180/Math.PI,turnAcceleration:rates.turnAcceleration*180/Math.PI,acceleration:rates.acceleration,mode:r.aiState.mode,
 alignment:r.aiState.mode==='recover'?[r.navigation.alignment.x,r.navigation.alignment.z]:null,recoverUntil:r.aiState.recoverUntil,jumpAt:r.aiState.jumpAt,jumpRequests:r.aiState.pendingJump?1:0,randomCalls,attackCollisions:r.navigation.attackCollisions,current:r.navigation.segment.startNode,queries};
});console.log(JSON.stringify(results));
"""
rebuilt = json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js','--input-type=module','-e',js],input=json.dumps(dict(graph=GRAPH,fixtures=fixtures)).encode(),cwd=ROOT))
discrete, errors = [], []
for i,(a,b) in enumerate(zip(native_results,rebuilt)):
    for key in a:
        if key in ['mode','jumpRequests','randomCalls','attackCollisions','current'] or a[key] is None:
            if a[key] != b[key]:discrete.append(dict(fixture=i,key=key,native=a[key],rebuild=b[key]))
        else:
            def flatten(value):
                if isinstance(value,list):return [x for item in value for x in flatten(item)]
                return [value]
            x,y=flatten(a[key]),flatten(b[key])
            if len(x)!=len(y):discrete.append(dict(fixture=i,key=key,native=a[key],rebuild=b[key]))
            else:
                for j,(u,v) in enumerate(zip(x,y)):errors.append(dict(fixture=i,key=key,index=j,absolute=abs(u-v),native=u,rebuild=v))
worst=sorted(errors,key=lambda x:x['absolute'],reverse=True)[:10]
report=dict(scope='Isolated original path/attack actions under synthetic obstacle/contact fixtures; not a native gameplay or complete collision test.',
    emulator='Unicorn '+unicorn_version,executable=str(EXE.relative_to(ROOT)),sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),
    originalFunctions=['0x42d0e8','0x42befc','0x42d494','0x42c6d0'],
    stubs={'0x44b67c':'Render-object enable/disable no-op','0x446764':'Fixture visibility result; actual native call endpoints captured',
           '0x431d88':'Hit classifier no-op; classified contact/barrier fields injected by fixture','0x430f18':'Count jump requests only',
           '0x45a8e6':'Return and count fixture random values','0x42b468':'Return fixture barrier owner'},
    fixtureCount=len(fixtures),numericFields=len(errors),maximumAbsoluteError=worst[0]['absolute'],discreteMismatches=discrete,tolerance=0.0002,
    passed=not discrete and worst[0]['absolute']<=0.0002,worst=worst,fixtures=fixtures,native=native_results,rebuild=rebuilt,
    limitations=['Synthetic scene-hit classification and jump activation; native mesh traversal, physical reaction, full orientation, scene-update ordering and RNG stream are not verified here.',
                 'Native local-Z acceleration is normalized to positive forward in the rebuild; angular rates are compared in degrees per second.',
                 'Entrance-region masks are supplied. Original world setup, respawn and full scene scheduling are not executed by this audit.', 'No overall similarity percentage is inferred.'])
(ROOT/'private/verification/ai-obstacles-native-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['fixtureCount','numericFields','maximumAbsoluteError','discreteMismatches','passed']},indent=2))
if not report['passed']:raise SystemExit(1)
