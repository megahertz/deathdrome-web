"""Compare reconstructed partition assignment with original 444418."""
import hashlib, json, subprocess, struct
from native_gamegen_loader import GameGenLoader
from native_ai_audit import ROOT, EXE

n=GameGenLoader();n.configure_world();node=n.reserve(0x200)
fixtures=[]
for arena in range(1,9):
    data=json.loads((ROOT/f'private/assets/models/arena{arena}.json').read_text())
    fixtures.extend({'arena':arena,**b} for b in data['worldObjects'].values())
for x,z in [(-896,896),(-768,768),(-128,128),(0,0),(768,-768)]:
    for left in [-3.01,-3,0,.1]:
        for width in [0,64,128,131,131.01,256]:
            for depth in [0,64,128,131,131.01,256]:
                fixtures.append({'name':'boundary','min':[x+left,0,z-depth],'max':[x+left+width,10,z]})
native=[]
bits=lambda x:struct.unpack('<f',struct.pack('<I',x))[0]
for case in fixtures:
    lo,hi=case['min'],case['max']
    n.call(0x444418,[lo[0],hi[0],lo[2],hi[2],bits(n.output),bits(n.output+4)],eax=n.world,edx=node)
    cell=list(n.read(n.output,'2i'));native.append(None if cell==[-1,-1] else cell)
script="""import {worldPartition} from './src/world-partition.js';let s='';for await(const c of process.stdin)s+=c;console.log(JSON.stringify(JSON.parse(s).map(c=>worldPartition(c.min.map(Math.fround),c.max.map(Math.fround)))));"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js','--input-type=module','-e',script],cwd=ROOT,input=json.dumps(fixtures).encode()))
mismatches=[{'case':i,'native':a,'rebuild':b} for i,(a,b) in enumerate(zip(native,rebuilt)) if a!=b]
report={'scope':'Original 444418 cell selection and three-unit fit margin, original World constructor/SETUP settings; input bounds are supplied from source metadata and synthetic boundary cases. Full node bounds construction is verified separately by native GameGen loading.',
    'sha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'fixtures':fixtures,'native':native,
    'mismatches':mismatches,'passed':not mismatches}
(ROOT/'private/verification/world-partition-native.json').write_text(json.dumps(report,separators=(',',':'))+'\n')
print(json.dumps({'cases':len(fixtures),'mismatches':mismatches[:5],'passed':not mismatches}))
if mismatches:raise SystemExit(1)
