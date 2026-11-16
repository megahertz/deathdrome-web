"""Execute original 431280 dispatch and 432bb8 response with supplied records.

Collector and hot-spot trigger are stubs here; audit_hot_spots.py separately
executes the actual initializer/trigger. Correction rejection and profile/audio
services are supplied. This is not a complete native physical update.
"""
import copy, hashlib, json, math, subprocess
from unicorn import UC_HOOK_CODE
from native_ai_audit import Native, ROOT, EXE, RUNNER, f32

n = Native()
for address in [0x4313f4, 0x43a0e0, 0x42a7a8, 0x4182f4]:
    n.cpu.mem_write(address, b'\xc3')
for address in [0x433048, 0x418f94]:
    n.cpu.mem_write(address, b'\x31\xc0\xc3')
n.cpu.mem_write(0x418dc0, b'\xd9\xee\xc3')  # supplied profile health zero
n.cpu.mem_write(0x418e44, b'\xc2\x04\x00')
trace = []

def snapshot():
    return {'position': list(n.read(RUNNER+0x2c, '3f')), 'world': list(n.read(RUNNER+0x184, '3f')),
        'local': list(n.read(RUNNER+0x190, '3f')), 'turn': n.read(RUNNER+0xe4, 'f')[0],
        'minimum': n.read(RUNNER+0xf8, 'f')[0], 'probe': list(n.read(RUNNER+0xb0, '3f'))}

def hook(cpu, address, size, data):
    if address == 0x43a0e0:
        trace.append({'kind': 'hotSpot'})
    elif address in [0x4312da, 0x431391]:
        trace.append({'kind': 'hotSpotResponse' if address == 0x4312da else 'wallResponse', **snapshot()})

for address in [0x43a0e0, 0x4312da, 0x431391]:
    n.cpu.hook_add(UC_HOOK_CODE, hook, begin=address, end=address)
source = json.loads((ROOT/'private/verification/collision-response-native-audit.json').read_text())['fixtures']
fixtures, native = [], []
for original in source:
    if original['variant'] not in ['ordinary', 'ceiling', 'verticalOnly', 'startup']:
        continue
    for with_wall in [False, True]:
        r = copy.deepcopy(original['r'])
        r.update(deltaX=0, deltaY=0, deltaZ=0, previousCollisionProbe={'x': 0, 'y': 0, 'z': 0},
            collisionProbe={'x': 31, 'y': 8, 'z': 32}, rearProbe={'x': 0, 'y': 0, 'z': 0})
        endpoint = {k: f32(r[k]+r['forwardVector'][k]*8) for k in 'xyz'}
        endpoint['y'] = max(0, f32(f32(r['y']+f32(original['dt']*r['frontVelocity']))+f32(r['forwardVector']['y']*8)))
        contact = copy.deepcopy(original['contact'])
        contact.update(source=r['previousPosition'], endpoint=endpoint)
        fixture = {'r': r, 'contact': contact, 'withWall': with_wall, 'dt': original['dt']}
        fixtures.append(fixture)
        n.cpu.mem_write(RUNNER, b'\0'*0x1000)
        n.write(0x518aa8, 'f', fixture['dt'])
        for offset, values in [(0x2c, [r[k] for k in 'xyz']), (0x38, list(r['previousPosition'].values())),
                (0x8c, list(r['forwardVector'].values())), (0x98, [0, 0, -1]), (0xa4, [0, 0, -1]),
                (0xb0, list(endpoint.values())), (0x184, list(r['worldVelocity'].values())),
                (0x190, [r['lateralSpeed'], r['localVerticalSpeed'], -r['speed']])]:
            n.write(RUNNER+offset, '3f', *values)
        n.write(RUNNER+0xe4, 'f', r['turn']*180/math.pi)
        n.write(RUNNER+0xf8, 'f', r['collisionMinimumSpeed'])
        n.write(RUNNER+0x104, 'f', r['yaw']*180/math.pi)
        n.write(RUNNER+0x144, 'ff', r['frontVelocity'], r['sideVelocity'])
        n.write(RUNNER+0x15c, 'B', int(r['movementEnabled']))
        n.write(RUNNER+8, 'BB', r['actionMode'], r['previousActionMode'])
        for offset in [0x248]+([0x360] if with_wall else []):
            p = RUNNER+offset
            n.write(p, '3f', *contact['normal'].values())
            n.write(p+0xc, '3f', *contact['point'].values())
            n.write(p+0x1c, 'I', RUNNER+0x2000)
            n.write(p+0x20, '3f', *contact['source'].values())
            n.write(p+0x2c, '3f', *contact['endpoint'].values())
        trace.clear()
        n.call(0x431280, eax=RUNNER)
        native.append(copy.deepcopy(trace))
js = """
import {stepCollisionSweep} from './src/collision-sweep.ts';
let input='';for await(const b of process.stdin)input+=b;
console.log(JSON.stringify(JSON.parse(input).map(f=>{
 const r=f.r,trace=[];let count=0;
 const snapshot=()=>({position:[r.x,r.y,r.z],world:Object.values(r.worldVelocity),local:[r.lateralSpeed,r.localVerticalSpeed,-r.speed],turn:r.turn*180/Math.PI,minimum:r.collisionMinimumSpeed,probe:Object.values(r.collisionProbe)});
 stepCollisionSweep(r,f.dt,()=>++count===1?['HotSpot_parent_0',...(f.withWall?['wall']:[])].map(name=>({...f.contact,node:{name}})):[],{
  onContact:kind=>trace.push({kind}),onResponse:(response,kind)=>trace.push({kind:kind+'Response',...snapshot()})});
 return trace;
})));
"""
rebuild = json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.ts', '--input-type=module', '-e', js],
    input=json.dumps(fixtures).encode(), cwd=ROOT))
mismatches, maximum = [], 0
for i, (a, b) in enumerate(zip(native, rebuild)):
    if len(a) != len(b):
        mismatches.append({'fixture': i, 'native': a, 'rebuild': b})
        continue
    for j, (x, y) in enumerate(zip(a, b)):
        for k in x:
            if k == 'kind':
                if x[k] != y[k]: mismatches.append({'fixture': i, 'event': j, 'native': x, 'rebuild': y})
            else:
                av = x[k] if isinstance(x[k], list) else [x[k]]
                bv = y[k] if isinstance(y[k], list) else [y[k]]
                error = max(abs(v-w) for v, w in zip(av, bv))
                maximum = max(maximum, error)
                if error > 1e-10: mismatches.append({'fixture': i, 'event': j, 'field': k, 'native': av, 'rebuild': bv})
report = {'scope': __doc__, 'sha256': hashlib.sha256(EXE.read_bytes()).hexdigest(),
    'fixtures': fixtures, 'native': native, 'tolerance': 1e-10, 'maxNumericError': maximum,
    'mismatches': mismatches, 'passed': not mismatches}
(ROOT/'private/verification/hot-spot-dispatch-native.json').write_text(json.dumps(report, separators=(',', ':'))+'\n')
print(json.dumps({'cases': len(fixtures), 'passed': not mismatches, 'maxNumericError': maximum,
    'mismatches': len(mismatches), 'first': mismatches[:4]}))
if mismatches: raise SystemExit(1)
