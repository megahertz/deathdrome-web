"""Refresh source traversal metadata without changing model geometry/render data."""
import argparse, hashlib, json
from export_models import decode, files, OUT, ROOT


def geometry_digest(data):
    return hashlib.sha256(json.dumps({'meshes': [f['v'] for f in data['meshes']],
        'boxes': [b['vertices'] for b in data.get('collisionBoxes', [])]}, separators=(',', ':')).encode()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('names', nargs='*')
    args = parser.parse_args()
    targets = [OUT/(name+'.json') for name in args.names] if args.names else sorted(OUT.glob('*.json'))
    changes = []
    for path in targets:
        source = files.get(path.stem+'.gam')
        if source is None: raise ValueError('Missing source model '+path.name)
        data = json.loads(path.read_text())
        rebuilt = decode(source, 'arena/textures')
        digest = geometry_digest(data)
        faces = {f['name']: f for f in rebuilt['meshes']}
        for face in data['meshes']: face['contactRank'] = faces[face['name']]['contactRank']
        for identity, bounds in data.get('worldObjects', {}).items():
            bounds['order'] = rebuilt['worldGroups'][identity]['order']
        data['worldGroups'] = rebuilt['worldGroups']
        boxes = {b['name']: b for b in rebuilt['collisionBoxes']}
        for box in data.get('collisionBoxes', []):
            box.update({key: boxes[box['name']][key] for key in ['contactRank', 'worldObject']})
        if len(data['markers']) != len(rebuilt['markers']): raise ValueError('Marker count changed '+path.name)
        for marker, new_marker in zip(data['markers'], rebuilt['markers']):
            if marker['name'] != new_marker['name']: raise ValueError('Marker order changed '+path.name)
            marker.update({key: new_marker[key] for key in ['contactRank', 'worldObject']})
        if geometry_digest(data) != digest: raise ValueError('Geometry changed '+path.name)
        path.write_text(json.dumps(data, separators=(',', ':')))
        changes.append({'model': path.stem, 'geometrySha256BeforeAndAfter': digest,
            'faces': len(data['meshes'])})
    report = {'scope': __doc__, 'models': changes, 'passed': True}
    (ROOT/'private/verification/query-metadata-update.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({'models': len(changes), 'geometryUnchanged': True}))


if __name__ == '__main__': main()
