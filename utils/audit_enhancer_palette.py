"""Check exported enhancer palette/index bytes against the preserved ZB archive.
This audits source asset conversion, not the original software rasterizer.
"""
from pathlib import Path
import hashlib,json,re,struct
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
archive=(ROOT/'private/original/game/DATA/TEXTURES/texture.zb').read_bytes()
palette=(ROOT/'private/original/game/RUN/domain.act').read_bytes()[:768]
names={Path(n).stem.lower() for n in re.findall(r'CycleTextureSetMap\s+(\S+)',(ROOT/'private/original/game/RUN/enhcycle.gw').read_text(),re.I)}
records=[];mismatches=[]
for entry in json.loads((ROOT/'private/assets/texture-manifest.json').read_text()):
 if Path(entry['name']).stem not in names:continue
 image=Image.open((ROOT/'private/assets'/entry['name']).with_suffix('.png'))
 start=entry['offset']+16;source=archive[start:start+entry['width']*entry['height']];indices=image.tobytes()
 alpha=image.convert('RGBA').getchannel('A').tobytes();expected=bytes(0 if i==0 else 255 for i in source)
 size,width,height=struct.unpack_from('<IHH',archive,entry['offset'])
 passed=image.size==(width,height) and len(indices)==size and indices==source and bytes(image.getpalette())==palette and alpha==expected
 if not passed:mismatches.append(entry['name'])
 records.append({'name':entry['name'],'sourcePixelsSha256':hashlib.sha256(source).hexdigest(),'decodedPixelsSha256':hashlib.sha256(indices).hexdigest(),'transparentPixels':source.count(0),'passed':passed})
if len(records)!=8*len(names):mismatches.append('Incomplete frame coverage')
report={'scope':'Palette indices, palette bytes and zero-key alpha for the 80 GW enhancer frames in all eight arena texture sets. Does not execute the original rasterizer.','frames':len(records),'mismatches':mismatches,'passed':not mismatches,'records':records}
(ROOT/'private/verification/enhancer-palette-alpha.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'frames':len(records),'mismatches':len(mismatches)}))
if mismatches:raise SystemExit(1)
