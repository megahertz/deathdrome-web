"""Historical naive UV comparison; counts mix rendered and stored LOD geometry."""
from collections import Counter
import hashlib,json,math,random
from native_gamegen_loader import GameGenLoader
from native_ai_audit import ROOT,EXE,f32
from export_models import decode,files

def normalize(uv):
    q=[[math.trunc((f32(x)+1/512)*256)/256 for x in p] for p in uv]
    origin=[math.floor(min(p[i] for p in q)) for i in [0,1]]
    return [[f32(x-origin[i]) for i,x in enumerate(p)] for p in q]

def main():
    n=GameGenLoader();buffer=n.reserve(1024);rng=random.Random(46224);errors=[];vectors=0
    for case in range(300):
        uv=[[f32(rng.uniform(-4,4)),f32(rng.uniform(-4,4))] for _ in range(3+case%20)]
        # Cover exact and adjacent half-steps, including negative coordinates.
        uv[0]=[f32(-1+(case%17-.5)/256),f32((case%19+.5)/256)]
        n.write(buffer,'f'*(2*len(uv)),*(x for p in uv for x in p))
        n.call(0x462d24,eax=len(uv),edx=buffer)
        actual=[list(n.read(buffer+i*8,'2f')) for i in range(len(uv))]
        if actual!=normalize(uv):errors.append(case)
        vectors+=len(uv)
    n.configure_world();root=n.load('PNKRUNR.GAM');graph=n.graph(root,n.world)
    source=decode(files['pnkrunr.gam'],'runners/textures')
    naive=Counter(tuple(sorted(map(tuple,normalize([[v[3],f32(1-v[4])] for v in face['v']])))) for face in source['meshes'] if face['texture'])
    native=Counter()
    for node in graph.values():
        shape=node['shape']
        if not shape:continue
        count=n.read(shape+8,'I')[0];polys=n.read(shape+32,'I')[0]
        for i in range(count):
            poly=polys+i*40;material=n.read(0x95caa8,'I')[0]+n.read(poly+16,'i')[0]*56
            if not n.read(material+2,'B')[0]:continue
            count=n.read(poly+4,'I')[0];uv=n.read(poly+20,'I')[0]
            native[tuple(sorted(n.read(uv+j*8,'2f') for j in range(count)))]+=1
    report={'scope':__doc__,'executableSha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),
        'source':str(files['pnkrunr.gam'].relative_to(ROOT)),
        'normalizationFunction':'0x462d24','normalizationCases':300,'normalizationVectors':vectors,
        'normalizationMismatches':errors,'normalizationPassed':not errors,
        'normalizationRule':'trunc((UV + 1/512) * 256) / 256, then subtract floor of the polygon minimum',
        'exportedTexturedFaces':sum(naive.values()),'nativeTexturedPolygons':sum(native.values()),
        'matchingWholeFaceUVSets':sum((naive&native).values()),
        'naiveWholeFaceEquivalent':naive==native,
        'resolvedBy':'private/verification/model-texture-import-native.json',
        'countInterpretation':'The 26 exported faces select near-zero LODs; 48 native stored polygons include additional LOD geometry. Their count difference alone does not establish subdivision.',
        'nextStep':'The source plane fit, normalization and subdivision predicates are now recovered. Continue face correspondence, LOD/instance eligibility and full original rasterization.',
        'limits':['UV normalization executes directly on supplied input pairs. The source comparison executes native GameGen loading, not original rendering.','Counter comparison detects a mismatch without establishing correspondence or the cause of every individual split.']}
    (ROOT/'private/verification/gamegen-uv-probe.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
    if errors:raise SystemExit(1)

if __name__=='__main__':main()
