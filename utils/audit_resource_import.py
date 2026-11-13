"""Verify the two supported media and the code-only static distribution.

Run after converting both inputs in separate scratch directories. No original
resource contents are embedded in this script or its report.
"""
from pathlib import Path
import argparse,json,hashlib,wave,struct,sys,zipfile
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'utils/browser_converter'))
from archive import read_media,safe_name,blast
parser=argparse.ArgumentParser()
parser.add_argument('--demo',default=str(ROOT/'private/disc/DDROME.zip'))
parser.add_argument('--iso',default=str(ROOT/'private/disc/Deathdrome.iso'))
parser.add_argument('--converted-demo',default='/tmp/dd-convert-demo')
parser.add_argument('--converted-cd',default='/tmp/dd-convert-cd')
parser.add_argument('--static',default=str(ROOT/'dist'))
args=parser.parse_args()
checks={}
for name,path in [('demo',args.demo),('cd',args.iso)]:
    raw=Path(path).read_bytes();files=list(read_media(raw));profile=json.loads((Path(getattr(args,'converted_'+name))/'private/assets/installation.json').read_text())
    assert profile['sourceSha256']==hashlib.sha256(raw).hexdigest()
    assert profile['arenas']==([1] if name=='demo' else list(range(1,9)))
    checks[name]={'mediaSha256':profile['sourceSha256'],'archiveFiles':len(files),'extractedBytes':sum(len(b) for _,b in files),'arenas':profile['arenas'],'executableSha256':profile['executableSha256']}
# Check actual InstallShield output against the preserved CD installation.
original={str(p.relative_to(ROOT/'private/original/game')).lower():p for p in (ROOT/'private/original/game').rglob('*') if p.is_file()}
matched=0
for name,content in read_media(Path(args.iso).read_bytes()):
    if name.lower() in original:
        assert original[name.lower()].read_bytes()==content,name
        matched+=1
checks['cd']['sourceFilesByteIdentical']=matched
# PNG compression may differ; decoded colors and alpha must remain exact.
converted=Path(args.converted_cd)/'private/assets';golden=ROOT/'private/assets';images=0;sounds=0
for p in converted.rglob('*.png'):
    q=golden/p.relative_to(converted)
    if not q.is_file():continue
    a,b=Image.open(p).convert('RGBA'),Image.open(q).convert('RGBA')
    assert a.size==b.size and a.tobytes()==b.tobytes(),str(p)
    images+=1
for p in (converted/'audio').glob('*.wav'):
    q=golden/'audio'/p.name
    with wave.open(str(p)) as a,wave.open(str(q)) as b:
        assert (a.getnchannels(),a.getframerate(),a.getnframes())==(b.getnchannels(),b.getframerate(),b.getnframes())
        def samples(w):
            data=w.readframes(w.getnframes())
            return tuple((v-128)*256 for v in data) if w.getsampwidth()==1 else struct.unpack('<'+'h'*(len(data)//2),data)
        assert samples(a)==samples(b),p.name
    sounds+=1
checks['cd']['pixelIdenticalImages']=images;checks['cd']['sampleIdenticalSounds']=sounds
for name in ['training.json','credits.json','ai-paths.json','recharge-paths.json']:
    assert json.loads((converted/name).read_text())==json.loads((golden/name).read_text()),name
for bad in ['/absolute','../escape','a/../../escape','C:\\escape']:
    try:safe_name(bad)
    except ValueError:pass
    else:raise AssertionError(bad)
assert blast(bytes.fromhex('00 04 82 24 25 8f 80 7f'),13)==b'AIAIAIAIAIAIA' # blast's documented reference vector
try:blast(bytes.fromhex('00 04 82 24 25 8f 80 7f'),1)
except ValueError:pass
else:raise AssertionError('Output size must be bounded')
manifest=json.loads((Path(args.static)/'build-manifest.json').read_text())
assert manifest['gameResourcesIncluded'] is False
assert not any(path.startswith(('assets/','reference/')) for path in manifest['files'])
with zipfile.ZipFile(ROOT/'public/resource-code/converter.zip') as z:
    assert all(p.startswith('utils/') and p.endswith(('.py','.json')) for p in z.namelist())
checks['static']={'files':len(manifest['files']),'originalResourcesBundled':False,'defaultImage':'assets/cd.iso','missingDefaultImage':'English file picker'}
report={'passed':True,'checks':checks,'limits':['ISO9660 DATA.Z images, installed demo ZIPs and image ZIPs with a largest ISO or a largest raw BIN plus its CUE are supported. Raw BIN without a CUE cannot supply audio track boundaries.','ISO files without CD audio cannot supply music.','Remote image URLs require CORS from their server.']}
(ROOT/'private/verification/resource-import.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
