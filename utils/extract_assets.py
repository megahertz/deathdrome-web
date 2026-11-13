"""Extract the supplied disc's indexed ZIM artwork without altering source files."""
from pathlib import Path
import json, struct, re, argparse
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'private/original/game'
out=ROOT/'private/assets'
out.mkdir(parents=True,exist_ok=True)
args=argparse.ArgumentParser()
args.add_argument('--keyed-only',action='store_true',help='Re-export only the enhancer texture frames, preserving their palette-zero alpha.')
keyed_only=args.parse_args().keyed_only
keyed_names={Path(name).stem.lower() for name in re.findall(r'CycleTextureSetMap\s+(\S+)',(source/'RUN/enhcycle.gw').read_text(),re.I)}
b=(source/'DATA/TEXTURES/texture.zb').read_bytes()
first=struct.unpack_from('<I',b,60)[0]
entries=[]
for i in range(first//68):
 r=b[i*68:(i+1)*68]
 name=r[:60].split(b'\0')[0].decode().replace('\\','/').lower().replace('../data/','')
 if not name: break
 offset=struct.unpack_from('<I',r,60)[0]
 size,w,h=struct.unpack_from('<IHH',b,offset)
 if w*h!=size: raise ValueError((name,size,w,h))
 pal='domain.act'
 stem=Path(name).stem
 entries.append({'name':name,'width':w,'height':h,'offset':offset,'bytes':size+16})
 if keyed_only and stem not in keyed_names:continue
 if stem.startswith('ddi') or stem=='ddeye':pal='ddi.ACT'
 elif stem in ['judge','prisoner']:pal=stem+'.act'
 elif stem=='runintro':pal='runner.act'
 palette=(source/'RUN'/pal).read_bytes()
 im=Image.frombytes('P',(w,h),b[offset+16:offset+16+size]); im.putpalette(palette)
 target=(out/name).with_suffix('.png');target.parent.mkdir(parents=True,exist_ok=True)
 if stem in keyed_names:im.save(target,transparency=0)
 elif not name.startswith('arena/textures'):im.save(target,transparency=192 if name=='images/dombak3.zim' else 0)
 else:im.save(target)
if not keyed_only:(out/'texture-manifest.json').write_text(json.dumps(entries))
print('Extracted',sum(Path(e['name']).stem in keyed_names for e in entries) if keyed_only else len(entries),'textures')
