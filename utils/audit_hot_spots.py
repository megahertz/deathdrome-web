"""Native hot-spot startup, marker queries and trigger/pool transitions.

The original initializer, graph updates, collectors and trigger actions run.
Profile lookup, human predicate and audio playback are supplied services.
Eruption growth, force geometry, complete scheduling and rendering are excluded.
"""
import hashlib, json, subprocess
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX
from native_ai_audit import ROOT, EXE, RUNNER, f32
from native_arena_scene import ArenaScene


def marker_probes(markers):
    result = []
    for marker in markers:
        x, y, z = marker['position']
        center = [x, y+1.125, z]
        for axis in range(3):
            for direction in [-1, 1]:
                a, b = center[:], center[:]
                a[axis] -= direction*5
                b[axis] += direction*5
                for start, end in [(a, b), (center, b)]:
                    result.append({'kind': 'sweep', 'from': dict(zip('xyz', map(f32, start))),
                        'to': dict(zip('xyz', map(f32, end)))})
        # A segment exactly on each side boundary is not an entry hit.
        for dx in [-1.5, 1.5]:
            result.append({'kind': 'sweep', 'from': {'x': f32(x+dx), 'y': f32(y+1), 'z': f32(z-5)},
                'to': {'x': f32(x+dx), 'y': f32(y+1), 'z': f32(z+5)}})
    return result


def state(n, index):
    data = n.hot_spot_data+index*24
    parent = n.read(data, 'I')[0]
    return {'phase': n.read(data+13, 'B')[0], 'seconds': n.read(data+16, 'f')[0],
        'owner': n.read(data+20, 'i')[0], 'bbox': bool(n.read(parent+0x38, 'I')[0])}


def audit_arena(arena):
    n = ArenaScene(arena)
    markers = json.loads((ROOT/f'private/assets/models/arena{arena}.json').read_text())['markers']
    markers = [m for name in ['dormt_hs.gam', 'activ_hs.gam'] for m in markers if m['name'] == name]
    initial = n.hot_spots()
    probes = marker_probes(markers)
    native = [[{k: v for k, v in hit.items() if k != 'node'} for hit in n.query(
        'sweep', **{k: v for k, v in probe.items() if k != 'kind'})
        if hit['name'].startswith('HotSpot_parent_')] for probe in probes]
    # Profile lookup has no other effect when this supplied predicate is false.
    n.cpu.mem_write(0x434ad4, b'\xb8'+RUNNER.to_bytes(4, 'little')+b'\xc3')
    for address in [0x418f94, 0x419008]:
        n.cpu.mem_write(address, b'\x31\xc0\xc3')
    n.cpu.mem_write(0x4182f4, b'\xc3')
    sounds = []
    n.cpu.hook_add(UC_HOOK_CODE, lambda cpu, a, size, data: sounds.append(cpu.reg_read(UC_X86_REG_EAX)),
        begin=0x4182f4, end=0x4182f4)
    actions = []
    def trigger(index, owner):
        sounds.clear()
        parent = n.read(n.hot_spot_data+index*24, 'I')[0]
        n.call(0x43a0e0, eax=owner, edx=parent)
        actions.append({'index': index, 'owner': owner, 'state': state(n, index), 'sounds': sounds[:]})
    # Arm seven distinct objects, fill the six-slot pool, then exercise its
    # overflow and ownership changes on an already erupting object.
    for index in range(7):
        if state(n, index)['phase'] == 0:
            trigger(index, index % 8)
    for index in range(7):
        trigger(index, (index+1) % 8)
    trigger(0, 7)
    return {'arena': arena, 'initial': initial, 'fixtures': probes, 'native': native, 'actions': actions}


def main():
    rows = []
    for arena in range(1, 9):
        rows.append(audit_arena(arena))
        print(json.dumps({'arena': arena, 'markers': len(rows[-1]['initial']),
            'queries': len(rows[-1]['fixtures']), 'triggers': len(rows[-1]['actions'])}), flush=True)
    js = """
import fs from 'node:fs';
import {HotSpots} from './src/hot-spots.js';
import {queryScene} from './utils/scene_query_batch.mjs';
let input='';for await(const b of process.stdin)input+=b;const results=[];
for(const row of JSON.parse(input)){
 const data=JSON.parse(fs.readFileSync(`private/assets/models/arena${row.arena}.json`)),h=new HotSpots(data.markers);
 const initial=h.spots.map(s=>({name:'HotSpot_parent_'+s.id,alwaysArmed:s.alwaysArmed,phase:s.phase,seconds:s.seconds,corners:s.box.vertices}));
 const queries=(await queryScene({arena:row.arena,fixtures:row.fixtures})).map(hits=>hits.filter(h=>h.name.startsWith('HotSpot_parent_')).map(({path,...h})=>h));
 const actions=row.actions.map(a=>{const s=h.spots[a.index],action=h.trigger(s,a.owner);return {index:a.index,owner:a.owner,state:{phase:s.phase,seconds:s.seconds,owner:s.owner,bbox:s.phase<2},sounds:action==='armed'?[33]:action==='erupting'?[6]:[]}});
 results.push({initial,queries,actions});
}console.log(JSON.stringify(results));
"""
    rebuilt = json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js', '--input-type=module', '-e', js],
        input=json.dumps(rows).encode(), cwd=ROOT))
    mismatches = []
    def compare(a, b, path):
        if isinstance(a, dict):
            if a.keys() != b.keys():
                mismatches.append({'field': path, 'native': a, 'rebuild': b})
            else:
                for k in a: compare(a[k], b[k], path+'.'+k)
        elif isinstance(a, list):
            if len(a) != len(b):
                mismatches.append({'field': path, 'native': a, 'rebuild': b})
            else:
                for i, (x, y) in enumerate(zip(a, b)): compare(x, y, path+f'[{i}]')
        elif isinstance(a, (int, float)) and not isinstance(a, bool):
            if abs(a-b) > 1e-5: mismatches.append({'field': path, 'native': a, 'rebuild': b})
        elif a != b:
            mismatches.append({'field': path, 'native': a, 'rebuild': b})
    for row, rebuilt_row in zip(rows, rebuilt):
        expected = [{k: v for k, v in s.items() if k in rebuilt_row['initial'][0]} for s in row['initial']]
        compare(expected, rebuilt_row['initial'], f"arena{row['arena']}.initial")
        # Geometry sets are compared independently of unresolved world order.
        key = lambda h: h['name']
        compare([sorted(q, key=key) for q in row['native']],
            [sorted(q, key=key) for q in rebuilt_row['queries']], f"arena{row['arena']}.queries")
        compare(row['actions'], rebuilt_row['actions'], f"arena{row['arena']}.actions")
    report = {'scope': __doc__, 'sha256': hashlib.sha256(EXE.read_bytes()).hexdigest(),
        'results': rows, 'mismatches': mismatches, 'tolerance': 1e-5, 'passed': not mismatches}
    (ROOT/'private/verification/hot-spots-native.json').write_text(json.dumps(report, separators=(',', ':'))+'\n')
    print(json.dumps({'passed': not mismatches, 'mismatches': len(mismatches), 'first': mismatches[:4]}), flush=True)
    if mismatches: raise SystemExit(1)


if __name__ == '__main__': main()
