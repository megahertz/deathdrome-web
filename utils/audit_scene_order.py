"""Native World/grid/Object3D traversal with adversarial supplied node trees.

Node/shape fields and identity transforms are supplied by SceneQueries. Native
World insertion, partitioning, child linking, bounds and collectors execute.
All 24 insertion permutations, both ray directions, own-shape-before-child,
partitioned-before-global and a two-dimensional cell rectangle are exercised.
No loader, runtime dirty relocation, actors, full scheduling or rendering.
"""
import gc, hashlib, itertools, json, subprocess
from native_ai_audit import ROOT, EXE
from native_scene_queries import SceneQueries


def polygon(name, vertices):
    return {'name': name, 'op': 583, 'drawType': 1, 'vertices': vertices, 'children': []}


def floor(name, y, lo, hi):
    return polygon(name, [[lo, y, -16], [hi, y, -16], [hi, y, -32], [lo, y, -32]])


def wall(name, x, z):
    return polygon(name, [[x, 0, z+8], [x, 10, z+8], [x, 10, z-8], [x, 0, z-8]])


def group(name, own, child):
    # The own polygon is serialized AFTER a child node. Native still queries
    # the node's shape first. Flattened polygon order would get this wrong.
    return {'name': name, 'op': 638, 'children': [
        {'name': 'inner', 'op': 638, 'children': [child]}, own]}


def fixtures():
    floors = [group('G'+str(i), floor('own', y, lo, hi), floor('nested', y+3, lo, hi))
        for i, (y, lo, hi) in enumerate([(40, -64, 64), (10, 0, 64), (60, 0, 64), (20, -64, 64)])]
    walls = [group('G'+str(i), wall('own', x, -24), wall('nested', x+1, -24))
        for i, x in enumerate([-40, 40, -16, 16])]
    diagonal = [group('G'+str(i), wall('own', x, x), wall('nested', x+1, x))
        for i, x in enumerate([-40, 40, -16, 16])]
    for mode, groups, a, b in [
            ('floors', floors, {'x': 10, 'y': 100, 'z': -24}, {'x': 10, 'y': -30, 'z': -24}),
            ('x-cells', walls, {'x': 100, 'y': 5, 'z': -24}, {'x': -100, 'y': 5, 'z': -24}),
            ('xz-cells', diagonal, {'x': 100, 'y': 5, 'z': 100}, {'x': -100, 'y': 5, 'z': -100})]:
        for permutation in itertools.permutations(range(4)):
            queries = [{'kind': 'sweep', 'from': a, 'to': b}, {'kind': 'sweep', 'from': b, 'to': a}]
            if mode == 'floors': queries.insert(0, {'kind': 'ground', 'x': 10, 'z': -24})
            yield {'mode': mode, 'permutation': list(permutation),
                'groups': [groups[i] for i in permutation], 'queries': queries}


def main():
    cases, native = list(fixtures()), []
    for fixture in cases:
        n = SceneQueries()
        for node in fixture['groups']:
            pointer = n._node(node, node['name'])
            n.call(0x444f70, eax=n.world, edx=pointer)
        native.append([n.query(q['kind'], **{k: v for k, v in q.items() if k != 'kind'}) for q in fixture['queries']])
        del n
        gc.collect()
    rebuilt = json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js', 'utils/scene_order_batch.mjs'], cwd=ROOT,
        input=json.dumps(cases).encode()))
    mismatches, maximum = [], 0
    def compare(a, b, path):
        nonlocal maximum
        if isinstance(a, dict):
            if a.keys() != b.keys(): mismatches.append({'field': path, 'native': a, 'rebuild': b})
            else:
                for key in a: compare(a[key], b[key], path+'.'+key)
        elif isinstance(a, list):
            if len(a) != len(b): mismatches.append({'field': path, 'native': a, 'rebuild': b})
            else:
                for i, (x, y) in enumerate(zip(a, b)): compare(x, y, path+f'[{i}]')
        elif isinstance(a, (float, int)):
            maximum = max(maximum, abs(a-b))
            if abs(a-b) > 1e-5: mismatches.append({'field': path, 'native': a, 'rebuild': b})
        elif a != b: mismatches.append({'field': path, 'native': a, 'rebuild': b})
    compare(native, rebuilt, '')
    report = {'scope': __doc__, 'sha256': hashlib.sha256(EXE.read_bytes()).hexdigest(),
        'fixtures': cases, 'native': native, 'queries': sum(len(f['queries']) for f in cases),
        'maxNumericError': maximum, 'tolerance': 1e-5, 'mismatches': mismatches, 'passed': not mismatches}
    (ROOT/'private/verification/scene-order-native.json').write_text(json.dumps(report, separators=(',', ':'))+'\n')
    print(json.dumps({'scenes': len(cases), 'queries': report['queries'], 'passed': report['passed'],
        'mismatches': len(mismatches), 'first': mismatches[:4]}))
    if mismatches: raise SystemExit(1)


if __name__ == '__main__': main()
