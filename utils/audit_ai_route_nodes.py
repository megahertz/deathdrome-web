#!/usr/bin/env python3
"""Compare rebuilt AI corridors/chains with isolated original x86 routines.

Optional verification dependency: Unicorn 2.x (not used by the browser game).
Example: PYTHONPATH=/tmp/deathdrome-audit-python python3 utils/audit_ai_route_nodes.py
Scene intersection and render-object enable/disable are stubbed explicitly. This
is a component comparison, not a native full-game or trajectory measurement.
"""
from pathlib import Path
import hashlib
import json
import math
import struct
import subprocess
from unicorn import __version__ as unicorn_version

from native_ai_audit import Native, ROOT, EXE, RUNNER, SCRATCH, NODE_POOL, f32

graph = [dict(id=i, color=12, position=p, links=links) for i, (p, links) in enumerate([
    ([0., 0., -100.], [1, 3, -1]), ([100., 0., -100.], [2, 0, -1]),
    ([100., 0., 0.], [3, 1, -1]), ([0., 0., 0.], [0, 2, -1])])]
corridors = []
for i in range(64):
    angle = i*math.pi/32
    length = [0., 2., 15., 30., 100., 350., 1000., 1200.][i % 8]
    start = [f32(20*math.cos(angle)), f32(i % 5), f32(40*math.sin(angle))]
    end = [f32(start[0]+length*math.sin(angle)), f32((i+2) % 5), f32(start[2]+length*math.cos(angle))]
    corridors.append(dict(start=start, end=end))
actions = [dict(kind='push', position=[20., 0., -30.], time=7., next=True),
           dict(kind='push', position=[40., 0., -30.], time=8.),
           dict(kind='push', position=[60., 0., -30.], time=9.),
           dict(kind='advance', position=[60., 0., -45.], clear=True),
           dict(kind='advance', position=[80., 0., -30.], clear=False),
           dict(kind='advance', position=[80., 0., -30.], clear=True),
           dict(kind='push', position=[90., 0., -60.], time=10., next=True),
           dict(kind='push', position=[110., 0., -60.], time=11., next=True),
           dict(kind='cleanup')]
controllers = [dict(mode='path', yaw=f32(i*math.pi/16), position=[f32([-10.001,-10.,0.,10.,10.001,20.][i % 6]),0.,-30.], time=7.) for i in range(32)]
controllers += [dict(mode='recover', yaw=f32(yaw), position=[0.,0.,0.], time=f32(time)) for yaw in [0.,.1,-.1,.5,1.,-1.,math.pi/2,-math.pi/2,math.pi] for time in [7.,10.,10.001]]
native = Native()
native_corridors = []
for fixture in corridors:
    native.call(0x42c610, [*fixture['start'], *fixture['end'], 10.], eax=SCRATCH)
    native_corridors.append(native.segment(SCRATCH))
native.graph(graph)
native_actions = []
for action in actions:
    if action['kind'] == 'cleanup':
        native.call(0x42cc4c, eax=RUNNER)
    else:
        native.write(RUNNER+0x2c, 'fff', *action['position'])
        current = native.read(RUNNER+0x1ec, 'I')[0]
        if action['kind'] == 'push':
            native.write(0x518aa4, 'f', action['time'])
            target = native.read(current+0x10+native.read(RUNNER+0x1f0, 'I')[0]*4, 'I')[0] if action.get('next') else current
            native.call(0x42c6d0, eax=RUNNER, edx=target)
        else:
            native.visibility(action['clear'])
            native.write(SCRATCH, 'I', current)
            native.call(0x42d680, eax=RUNNER, edx=SCRATCH, ebx=SCRATCH+4, ecx=SCRATCH+8)
    native_actions.append(native.snapshot(graph, action['kind'] == 'cleanup'))

controller_native = Native()
controller_native.graph(graph)
controller_native.write(0x48f19c, 'f', 100.)  # DYNAMICS.GW maximum acceleration
native_controllers = []
for fixture in controllers:
    yaw = fixture['yaw']
    controller_native.write(RUNNER+0x1ec, 'II', NODE_POOL+3*0x34, 0)
    controller_native.write(RUNNER+0x2c, 'fff', *fixture['position'])
    controller_native.write(RUNNER+0x80, 'fff', f32(-math.sin(yaw)), 0., f32(-math.cos(yaw)))
    controller_native.write(RUNNER+0x100, 'f', 80.)
    controller_native.write(RUNNER+0x444, 'f', 64.)
    controller_native.write(RUNNER+0xfc, 'f', 185.)
    controller_native.write(RUNNER+0xe0, 'f', 3.)
    controller_native.write(RUNNER+0x180, 'f', -23.)
    controller_native.write(0x518aa4, 'ff', fixture['time'], f32(1/60))
    controller_native.write(RUNNER+0x204, 'fff', 0., 0., -1.)
    controller_native.write(RUNNER+0x220, 'f', 10.)
    controller_native.write(RUNNER+0x1ea, 'BB', 3 if fixture['mode']=='recover' else 0, 0)
    controller_native.call(0x42c8ec if fixture['mode']=='recover' else 0x42d0e8, eax=RUNNER)
    native_controllers.append(dict(turn=controller_native.read(RUNNER+0xe4,'f')[0],
        turnAcceleration=controller_native.read(RUNNER+0xe0,'f')[0], acceleration=-controller_native.read(RUNNER+0x180,'f')[0],
        maximumSpeed=controller_native.read(RUNNER+0x444,'f')[0], mode='recover' if controller_native.read(RUNNER+0x1ea,'B')[0]==3 else 'path'))

js = r"""
import {Simulation} from './src/simulation.ts';
import {routeSegment,pushRouteNode,clearRouteNodes,navigationState,routePoolState,stepNavigation} from './src/ai-navigation.ts';
let data=JSON.parse(await new Promise(resolve=>{let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>resolve(s))}));
const point=p=>({x:p[0],y:p[1],z:p[2]});
function segment(s){return {direction:[s.direction.x,s.direction.z],advanceDistance:s.advanceDistance,normal:[s.normal.x,s.normal.z],positive:[s.positive.x,s.positive.z],negative:[s.negative.x,s.negative.z]}}
let corridors=data.corridors.map(f=>segment(routeSegment(point(f.start),point(f.end))));
let sim=new Simulation({paths:data.graph,maximumRunners:1}),r=sim.runners[1];sim.countdown=0;
r.navigation={goalColor:12,visited:0,temporaryVisited:0,segment:routeSegment(point(data.graph[3].position),point(data.graph[0].position),{startNode:3,endNode:0,color:12})};
let actions=[];for(let a of data.actions){
 if(a.kind==='cleanup')clearRouteNodes(sim,r);
 else{Object.assign(r,point(a.position));if(a.kind==='push'){sim.elapsed=a.time-7;pushRouteNode(sim,r,{next:!!a.next})}
 else{sim.lineBlocked=()=>!a.clear;r.aiState.mode='path';stepNavigation(sim,r,1/60,100)}}
 let state={pool:routePoolState(sim).temporaryNodes};if(a.kind!=='cleanup')Object.assign(state,{current:r.navigation.segment.startNode,next:r.navigation.segment.endNode,segment:segment(r.navigation.segment),refreshAt:r.navigation.refreshAt,chain:navigationState(sim,r).temporaryNodes.map(n=>n.id)});actions.push(state);
}
let controllers=data.controllers.map(a=>{
 Object.assign(r,point(a.position),{yaw:a.yaw,turnAcceleration:3*Math.PI/180,acceleration:23,aiMaxSpeed:64});
 r.navigation.segment=routeSegment(point(data.graph[3].position),point(data.graph[0].position),{startNode:3,endNode:0,color:12});
 r.navigation.alignment={x:0,z:-1};Object.assign(r.aiState,{mode:a.mode,recoverUntil:10});sim.elapsed=a.time-7;
 let rates=stepNavigation(sim,r,Math.fround(1/60),100);
 return {turn:rates.turn*180/Math.PI,turnAcceleration:rates.turnAcceleration*180/Math.PI,acceleration:rates.acceleration,maximumSpeed:r.aiMaxSpeed,mode:r.aiState.mode};
});
console.log(JSON.stringify({corridors,actions,controllers}));
"""
rebuilt = json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.ts', '--input-type=module', '-e', js], input=json.dumps(dict(graph=graph, corridors=corridors, actions=actions, controllers=controllers)).encode(), cwd=ROOT))
errors, discrete = [], []
def compare(a, b, path):
    if isinstance(a, dict):
        for key in a:
            compare(a[key], b[key], path+'.'+key)
    elif isinstance(a, list):
        if len(a) != len(b):
            discrete.append(dict(path=path, native=a, rebuild=b))
        else:
            for i, (x, y) in enumerate(zip(a, b)):
                compare(x, y, f'{path}[{i}]')
    elif '.segment.' in path or path.startswith('corridors') or (path.startswith('controllers') and not path.endswith('.mode')) or path.endswith('refreshAt'):
        errors.append(dict(path=path, absolute=abs(a-b), native=a, rebuild=b))
    elif a != b:
        discrete.append(dict(path=path, native=a, rebuild=b))
compare(native_corridors, rebuilt['corridors'], 'corridors')
compare(native_actions, rebuilt['actions'], 'actions')
compare(native_controllers, rebuilt['controllers'], 'controllers')
worst = sorted(errors, key=lambda x:x['absolute'], reverse=True)[:10]
report = dict(scope='Isolated original x86 AI corridor construction, temporary-node allocation/advance/free and planar path/alignment controllers compared with the new JavaScript implementation.',
              emulator='Unicorn '+unicorn_version, executable=str(EXE.relative_to(ROOT)), sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),
              originalFunctions=['0x42c610','0x42c6d0','0x42d680','0x42cc4c','0x42dbe4','0x42dc18','0x42d0e8','0x42c8ec'],
              stubs={'0x44b67c':'Render object enable/disable: no-op', '0x446764':'Scene intersection: explicit fixture result (clear or blocked)'},
              corridorCases=len(corridors), chainActions=len(actions), controllerCases=len(controllers), numericFields=len(errors), maximumAbsoluteError=worst[0]['absolute'], discreteMismatches=discrete,
              tolerance=0.0002, passed=not discrete and worst[0]['absolute']<=0.0002, worst=worst,
              controllerContext={'nativeForwardProbeFlag':False,'nativeWallContact':0,'nativeEdgeContact':0,'maximumAcceleration':100,'runnerMaximumSpeed':80,'deltaSeconds':f32(1/60)},
              chainFixtures=actions, nativeChain=native_actions, rebuildChain=rebuilt['actions'], controllerFixtures=controllers, nativeControllers=native_controllers, rebuildControllers=rebuilt['controllers'],
              limitations=['Synthetic graph and positions; not a full native gameplay run. Controller acceleration is normalized from native local Z (negative forward) to positive forward in the rebuild.', 'Scene geometry, obstacle probes, attack decisions, timing integration and complete RNG call ordering are outside this comparison.', 'JavaScript uses double arithmetic while the original stores floats; comparison uses an absolute component tolerance.', 'Attack entry while already on a temporary node bypasses the old head without freeing its pool slot; the isolated native routine and rebuild both preserve this behavior.', 'No overall similarity percentage is inferred.'])
(ROOT/'private/verification/ai-route-native-audit.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps({key:report[key] for key in ['corridorCases','chainActions','controllerCases','numericFields','maximumAbsoluteError','discreteMismatches','passed']}, indent=2))
if not report['passed']:
    raise SystemExit(1)
