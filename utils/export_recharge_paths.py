"""Decode the four recharge routes per arena using EKEY.C's path construction.

429f1c pairs each DXF face's closest XZ vertices and averages the two ends.
43d8b8 starts with the first segment, then 43d6c8 greedily joins unused ends.
The closing repeated vertex is omitted, as at 43da2d.
"""
from pathlib import Path
import json, math

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'private/original/game/DATA/ARENA/KEYPATHS'

def distance(a, b):
    return sum((x-y)**2 for x,y in zip(a,b))

def decode(path):
    lines = path.read_text().splitlines()
    pairs = [(int(lines[i]), lines[i+1].strip()) for i in range(0,len(lines),2)]
    faces = []
    for code,value in pairs:
        if code == 0:
            entity = {} if value == '3DFACE' else None
            if entity is not None: faces.append(entity)
        elif entity is not None:
            entity[code] = value
    segments = []
    for face in faces:
        vertices = [(float(face[10+i]), float(face[30+i])) for i in range(4)]
        closest = min(range(1,4), key=lambda i:distance(vertices[0],vertices[i]))
        ends = []
        for selected in [False,True]:
            points = [v for i,v in enumerate(vertices) if (i in (0,closest)) == selected]
            ends.append(tuple(sum(v[j] for v in points)*.5 for j in range(2)))
        segments.append(ends)
    route = list(segments.pop(0))
    while segments:
        i,end = min(((i,j) for i in range(len(segments)) for j in range(2)),
                    key=lambda ij:distance(route[-1],segments[ij[0]][ij[1]]))
        # The original joins the nearest unused end even across gaps in the CAD
        # data (PATH_4_3 contains one). Preserve that behavior instead of repair.
        route.append(segments.pop(i)[1-end])
    return [[x,0,z] for x,z in route[:-1]]

routes = [[decode(SOURCE/f'PATH_{arena}_{quadrant}.DXF') for quadrant in range(4)] for arena in range(8)]
(ROOT/'private/assets/recharge-paths.json').write_text(json.dumps(routes,separators=(',',':')))
print('Recharge path vertices:',[[len(p) for p in arena] for arena in routes])
