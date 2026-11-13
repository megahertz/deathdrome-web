"""Smoke audit of the original x86 geometry loader on all eight source arenas."""
import hashlib, json
from native_gamegen_loader import GameGenLoader
from native_ai_audit import ROOT, EXE


def main():
    results = []
    for arena in range(1, 9):
        n = GameGenLoader()
        n.configure_world()
        root = n.load(f'ARENA{arena}.GAM')
        before = n.graph(root, n.world)
        insertions = len(before[n.world]['children'])
        n.update()
        after = n.graph(*before)
        result = {'arena': arena, 'rootName': n.string(root, 32),
            'nodes': len(after), 'shapes': sum(bool(x['shape']) for x in after.values()),
            'validShapeBounds': sum(bool(x['shape']) and x['boundsValid'] == 1 for x in after.values()),
            'worldInsertions': insertions, 'openFiles': len(n.files),
            'heapBytes': n.heap-0x3100000, 'pruneFlags': list(n.read(0x4909f4, '2B')),
            'files': [{**f, 'sha256': hashlib.sha256((ROOT/f['source']).read_bytes()).hexdigest()}
                for f in n.file_log]}
        results.append(result)
        print(json.dumps({k: v for k, v in result.items() if k != 'files'}), flush=True)
    report = {'scope': 'Original x86 GameGen geometry loading, external model resolution, native constructors, World insertion and dirty-bound updates for all eight arena GAM files. Host supplies file I/O, allocation, CRT thread storage, progress and SETUP/DOMAIN world commands. Full GW/Domain initialization, actors and rendering are outside scope.',
        'sha256': hashlib.sha256(EXE.read_bytes()).hexdigest(), 'results': results,
        'passed': all(r['nodes'] > 0 and r['shapes'] > 0 and r['shapes'] == r['validShapeBounds']
            and r['openFiles'] == 0 for r in results)}
    (ROOT/'private/verification/gamegen-loading-native.json').write_text(json.dumps(report, indent=2)+'\n')
    if not report['passed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
