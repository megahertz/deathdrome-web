"""Portal 11 physical comparison with the full arena loaded by original x86.

The native reference never uses the JS/Python GameGen decoder or geometry.
Round visibility/eligibility and one runner's initial pose are supplied;
full Domain/GW execution, all actors, audio and rendering remain outside scope.
"""
import hashlib, json
from unicorn import __version__
from native_ai_audit import ROOT, EXE, RUNNER, f32
from native_arena_scene import ArenaScene
from audit_wall_portal_hierarchy import CollectorPhysical, PATH, OPEN
from audit_portal_physics import scene, process


class LoadedWall(ArenaScene):
    def __init__(self):
        super().__init__(6, round=1)
        after = self.nodes_after
        self.names = {v['name']: a for a, v in after.items()}
        # Addresses and links come from the original loader/initializer.
        self.nodes = {a: a for a in after}
        self.nodes.update({PATH: self.names['g3535'], OPEN: self.names['open11']})
        self.world_insertions = len(self.initial_world_children)
        self.loaded_graph = {hex(a): {**node,
            'children': [hex(x) for x in node['children']],
            'parents': [hex(x) for x in node['parents']],
            'shape': hex(node['shape'])} for a, node in after.items()}

    def set_lift(self, path, height):
        self.call(0x45a6bc, [0, height, 0], eax=self.nodes[path])
        self.update()


def main():
    results = []
    loading = None
    try:
        for side, frames in [(1, 180), (-1, 60)]:
            geometry = LoadedWall()
            if loading is None:
                loading = {'files': [{**f, 'sha256': hashlib.sha256((ROOT/f['source']).read_bytes()).hexdigest()}
                    for f in geometry.file_log], 'nodes': geometry.loaded_graph,
                    'worldInsertionsBeforeUpdate': geometry.world_insertions,
                    'pruneFlags': list(geometry.read(0x4909f4, '2B')),
                    'hotSpots': geometry.hot_spots()}
            n = CollectorPhysical(geometry)
            dt = f32(1/60)
            initial = scene(action='load', arena=6, round=1, portal='11', side=side, dt=dt)
            n.setup(initial['r'], dt)
            samples, maximum, first = [], 0, None
            for frame in range(frames):
                n.lower()
                n.call(0x42f0f0, [0., 0.], eax=RUNNER)
                n.call(0x42f200, [-20., 0.], eax=RUNNER)
                n.call(0x42f39c, eax=RUNNER)
                native, rebuild, height = n.snapshot(), scene(action='step'), n.height()
                other = rebuild['portals'].get('11', 0)
                errors = {key: max(abs(a-b) for a, b in zip(value, rebuild['state'][key]))
                    if isinstance(value, list) else abs(value-rebuild['state'][key])
                    for key, value in native.items()}
                errors['portalHeight'] = abs(height-other)
                error = max(errors.values())
                maximum = max(maximum, error)
                if error > 1e-10 and first is None:
                    first = {'frame': frame, 'error': error,
                        'fields': {k: v for k, v in errors.items() if v > 1e-10}}
                samples.append({'native': native, 'nativeHeight': height,
                    'rebuild': rebuild['state'], 'rebuildHeight': other, 'error': error})
            result = {'side': side, 'frames': frames, 'initial': initial['state'],
                'nativeGroundQueries': n.groundCalls, 'nativeSegmentQueries': n.wallCalls,
                'samples': samples, 'maximumError': maximum, 'firstMismatch': first}
            results.append(result)
            print(json.dumps({k: result[k] for k in ['side', 'frames', 'maximumError', 'firstMismatch']}), flush=True)
    finally:
        process.stdin.close()
        process.wait(timeout=10)
    report = {'scope': 'THE WALL portal 11, complete ARENA6.GAM, external GAM models and HOTSPOT templates loaded by native 464928/472074/464c30 and constructors. Native World partition, dirty bounds/transform updates 459328, scene queries, original hot-spot initialization and physical/portal actions; the rebuild uses the decoded arena/portal adapter.',
        'sha256': hashlib.sha256(EXE.read_bytes()).hexdigest(), 'emulator': 'Unicorn '+__version__,
        'loading': loading, 'comparedFields': [*results[0]['samples'][0]['native'], 'portalHeight'],
        'results': results, 'passed': all(r['firstMismatch'] is None for r in results),
        'limitations': ['Host-backed file I/O, bounded zeroed allocation pool, no-op free, CRT thread-state storage and no-op progress/message pump replace operating-system services.',
            'World parameters and flat shading follow SETUP.GW/DOMAIN_X.GW; round-1 portal ACTIVE and support flags, separately managed pickup/exit ACTIVE flags and HOTSPOT template loading/renaming are supplied; 43a524 initialization executes. Complete GW interpreter and Domain initialization are not run.',
            'Arena/external/template geometry and original hot-spot marker initialization are loaded. Other actors, remaining script-created objects, texture rasterization, sound, other ground handlers and profile/periodic actions are excluded.',
            'One supplied human-runner pose, fixed float clock and two local approaches. Lower callback runs before physical update; node action field is supplied. This does not prove full-game or rendered-frame equivalence.']}
    (ROOT/'private/verification/gamegen-wall-native.json').write_text(json.dumps(report, indent=2)+'\n')
    if not report['passed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
