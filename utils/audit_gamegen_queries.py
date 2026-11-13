"""Compare full native-loaded arena geometry with production query results.

Fixtures come from source arena polygon centres and a world grid, not from
native query results. Geometry/order mismatches are recorded separately.
Supplied round visibility hides enhancer markers and the exit model, matching
the production arena loader before script-created actors/effects are added.
"""
import hashlib, json, math, subprocess
from native_ai_audit import ROOT, EXE, f32
from native_arena_scene import ArenaScene


def fixtures(arena):
    data=json.loads((ROOT/f'private/assets/models/arena{arena}.json').read_text())
    result=[{'kind':'ground','x':x,'z':z}
        for x in range(-840,841,112) for z in range(-840,841,112)]
    faces=data['meshes']
    for i in range(128):
        face=faces[i*len(faces)//128]
        points=face['v']
        center=[f32(sum(p[k] for p in points)/len(points)) for k in range(3)]
        result.append({'kind':'ground','x':center[0],'z':center[2]})
        a,b,c=points[:3];u=[a[k]-b[k] for k in range(3)];v=[c[k]-b[k] for k in range(3)]
        normal=[v[1]*u[2]-v[2]*u[1],v[2]*u[0]-v[0]*u[2],v[0]*u[1]-v[1]*u[0]]
        length=math.sqrt(sum(x*x for x in normal))
        if not length:continue
        ends=[dict(zip('xyz',[f32(center[k]+sign*12*normal[k]/length) for k in range(3)])) for sign in [-1,1]]
        for a,b in [ends,ends[::-1]]:result.append({'kind':'sweep','from':a,'to':b})
    return result


def matching(a,b,kind):
    if a['name']!=b['name']:return False
    fields=['normal', 'point'] if kind=='sweep' else ['normal']
    error=max(abs(a[key][axis]-b[key][axis]) for key in fields for axis in 'xyz')
    if kind=='ground':error=max(error,abs(a['height']-b['height']))
    return error<1e-4


def compare(probes,native,rebuild):
    mismatches=[];orders=[];matched=0
    for i,(f,a,b) in enumerate(zip(probes,native,rebuild)):
        unused=list(b);missing=[]
        for hit in a:
            found=next((j for j,other in enumerate(unused) if matching(hit,other,f['kind'])),None)
            if found is None:missing.append(hit)
            else:unused.pop(found)
        if missing or unused:mismatches.append({'fixture':i,'missing':missing,'extra':unused})
        else:
            matched+=1
            if not all(matching(x,y,f['kind']) for x,y in zip(a,b)):orders.append(i)
    return {'matchingHitSets':matched,'orderMismatches':orders,'geometryMismatches':mismatches}


def rebuild_queries(arena,probes,**options):
    return json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js','utils/scene_query_batch.mjs'],cwd=ROOT,
        input=json.dumps({'arena':arena,'fixtures':probes,**options}).encode()))


def main():
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--arena',type=int,nargs='*',default=list(range(1,9)))
    parser.add_argument('--fixtures-report',help='Reuse original probe locations after geometry export changes')
    args=parser.parse_args();results=[]
    saved=json.loads((ROOT/args.fixtures_report).read_text()) if args.fixtures_report else None
    for arena in args.arena:
        n=ArenaScene(arena);probes=next(r['fixtures'] for r in saved['results'] if r['arena']==arena) if saved else fixtures(arena)
        native=[n.query(f['kind'],**{k:v for k,v in f.items() if k!='kind'}) for f in probes]
        rebuild=rebuild_queries(arena,probes)
        baseline=compare(probes,native,rebuild_queries(arena,probes,ignoreWorldPartitions=True))
        r={'arena':arena,'cases':len(probes),**compare(probes,native,rebuild),
            'hotSpots':n.hot_spots(),'disabledActors':n.disabled,
            'withoutPartitionFilter':{**{k:len(v) if isinstance(v,list) else v for k,v in baseline.items()},
                'geometryMismatchFixtures':[e['fixture'] for e in baseline['geometryMismatches']]},
            'fixtures':probes,'native':native,'rebuild':rebuild}
        results.append(r)
        print(json.dumps({k:r[k] if k!='geometryMismatches' else len(r[k]) for k in ['arena','cases','matchingHitSets','geometryMismatches']}|{'orderMismatches':len(r['orderMismatches'])}),flush=True)
    report={'scope':'Native x86 loaded arena/external geometry, original 43a524 hot-spot initialization and World collectors versus production View.arena and facet queries. HOTSPOT.GW template loading/renaming and SETUP/DOMAIN_X world commands are supplied. Round-1 panel ACTIVE/support flags, separately managed pickup/exit ACTIVE flags are supplied. Source polygon-centre/world-grid probes; no complete GW/Domain initialization, dynamic gameplay actors or rasterization.',
        'sha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'results':results,
        'passed':all(not r['geometryMismatches'] and not r['orderMismatches'] for r in results)}
    if saved:report['fixturesSource']={'path':args.fixtures_report,'sha256':hashlib.sha256((ROOT/args.fixtures_report).read_bytes()).hexdigest()}
    suffix='-'+'-'.join(map(str,args.arena)) if len(args.arena)!=8 else ''
    (ROOT/f'private/verification/gamegen-queries-native{suffix}.json').write_text(json.dumps(report,separators=(',',':'))+'\n')


if __name__=='__main__':main()
