"""Extract the original WorldAddRegions DXF faces, preserving input order."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def region_data():
    arenas = []
    for arena in range(1, 9):
        path = ROOT / f'private/original/game/DATA/ARENA/Regions/REGIONS{arena}.DXF'
        if not path.exists():
            arenas.append([])
            continue
        lines = path.read_text().splitlines()
        entities, current = [], None
        for code, value in zip(lines[::2], lines[1::2]):
            code, value = int(code), value.strip()
            if code == 0:
                if current is not None:
                    entities.append(current)
                current = {} if value == '3DFACE' else None
            elif current is not None:
                current[code] = value
        faces = [{'color': int(e.get(62, 0)),
                  'vertices': [[float(e[10+i]), float(e[20+i]), float(e[30+i])]
                               for i in range(4)]} for e in entities]
        arenas.append(faces)
    setup = (ROOT / 'private/original/game/RUN/SETUP.GW').read_text()
    def command(name):
        match = re.search(r'^' + name + r'\s+([-\d.]+)\s+([-\d.]+)', setup, re.M | re.I)
        return [float(v) for v in match.groups()]
    return {'origin': command('WorldOrigin'), 'extents': command('WorldExtents'),
            'partition': command('WorldPartition'), 'arenas': arenas}

if __name__ == '__main__':
    target = ROOT / 'private/assets/region-data.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(region_data(), separators=(',', ':')) + '\n')
    print(target.relative_to(ROOT))
