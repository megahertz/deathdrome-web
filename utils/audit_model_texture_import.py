"""Compare source render UVs with native GameGen import and direct x86 math.

Signature membership is checked per model. Counts are retained but not treated
as equal: native loading retains LODs, and source export expands instances.
This does not prove individual polygon correspondence, visibility or rendering.
"""
from collections import Counter
import hashlib,json,random,struct
from unicorn.x86_const import UC_X86_REG_ESI
from native_gamegen_loader import GameGenLoader
from native_ai_audit import ROOT,EXE,f32
from export_models import decode,files,render_polygons,clean_polygon,polygon_planar,texture_slopes

def signature(uv):
    # Signed zero has identical texel-address semantics; canonicalize it.
    return hashlib.sha256(b''.join(struct.pack('<2f',*(0. if x==0 else x for x in p)) for p in sorted(uv))).hexdigest()

def source_vertices(data):
    def walk(node):
        if node.get('near',0)>0:return
        if 'vertices' in node:yield node
        if 'instance' in node:yield from walk(data['sourceInstances'][node['instance']])
        for child in node['children']:yield from walk(child)
    yield from walk(data['sourceTree'])

def main():
    math_native=GameGenLoader();buffer=math_native.reserve(4096);out=math_native.reserve(16)
    plane_cases=0;plane_errors=[];slope_errors=[];rng=random.Random(77)
    for case in range(1000):
        points=[[f32(rng.uniform(-8,8)),f32(rng.uniform(-8,8))] for _ in range(3)]
        values=[f32(rng.uniform(-3,3)) for _ in range(3)]
        math_native.cpu.reg_write(UC_X86_REG_ESI,out)
        math_native.call(0x463a04,[x for p in points for x in p]+values)
        if list(math_native.read(out,'2f'))!=texture_slopes(points,values):slope_errors.append(case)
    results=[]
    for name,path in files.items():
        data=decode(path,'arena/textures',True);expected=Counter()
        for node in source_vertices(data):
            vs=clean_polygon(node['vertices'])
            if len(vs)<3:continue
            math_native.write(buffer,'f'*(len(vs)*3),*(x for p in vs for x in p[:3]))
            native_planar=bool(math_native.call(0x462788,eax=len(vs),edx=buffer))
            plane_cases+=1
            if native_planar!=polygon_planar(vs):plane_errors.append({'model':name,'face':node['name']})
            if node.get('texture') in data['textures']:
                for p in render_polygons(vs):expected[signature(p['uv'])]+=1
        if not expected:continue
        n=GameGenLoader();n.configure_world();root=n.load(path.name);native=Counter()
        for node in n.graph(root,n.world).values():
            shape=node['shape']
            if not shape:continue
            count=n.read(shape+8,'I')[0];polys=n.read(shape+32,'I')[0]
            for i in range(count):
                poly=polys+i*40;material=n.read(0x95caa8,'I')[0]+n.read(poly+16,'i')[0]*56
                if not n.read(material+2,'B')[0]:continue
                count=n.read(poly+4,'I')[0];uv=n.read(poly+20,'I')[0]
                native[signature([n.read(uv+j*8,'2f') for j in range(count)])]+=1
        missing=sorted(set(expected)-set(native))
        result={'model':path.stem.lower(),'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),
            'sourceRenderPolygons':sum(expected.values()),'nativeStoredPolygons':sum(native.values()),
            'sourceUniqueUVSets':len(expected),'missingUVSets':missing,'nativeUVSignatures':sorted(native)}
        results.append(result);print(json.dumps({k:v for k,v in result.items() if k!='nativeUVSignatures'}),flush=True)
    report={'scope':__doc__,'executableSha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),
        'nativeFunctions':['0x462788','0x462624','0x462e34','0x463a04','0x463b00','0x462d24'],
        'planeCases':plane_cases,'planeMismatches':plane_errors,'slopeCases':1000,'slopeMismatches':slope_errors,
        'models':results,'sourceRenderPolygons':sum(x['sourceRenderPolygons'] for x in results),
        'missingUVSets':sum(len(x['missingUVSets']) for x in results),
        'passed':not plane_errors and not slope_errors and not any(x['missingUVSets'] for x in results),
        'limits':['UV signature membership does not establish face-by-face pairing, complete polygon order or scene draw eligibility.',
            'Stored native polygon counts include LODs and referenced models; source export expands instances and currently selects near-zero LODs.',
            'Native welding, all transform rounding, perspective gradients, shaded/keyed pixel spans, raster edges and complete rendered rounds remain separate work.']}
    (ROOT/'private/verification/model-texture-import-native.json').write_text(json.dumps(report,separators=(',',':'))+'\n')
    print(json.dumps({k:report[k] for k in ['planeCases','planeMismatches','slopeCases','slopeMismatches','sourceRenderPolygons','missingUVSets','passed']}))
    if not report['passed']:raise SystemExit(1)

if __name__=='__main__':main()
