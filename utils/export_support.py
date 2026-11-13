from pathlib import Path
from PIL import Image
import struct,json
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'private/original/game'
out=ROOT/'private/assets/fonts';out.mkdir(exist_ok=True)
for p in (source/'DATA/FONTS').glob('*'):
 b=p.read_bytes();w,h=struct.unpack_from('<HH',b);im=Image.frombytes('P',(w,h*50),b[804:]);im.putpalette((source/'RUN/domain.act').read_bytes());im.save(out/(p.stem.lower()+'.png'),transparency=0)
paths=[]
for p in sorted((source/'DATA/ARENA/AIPaths').glob('*.ZXF')):
 rows=[x.strip() for x in p.read_text().splitlines() if x.strip()];assert int(rows[0])==100;i=1;nodes=[]
 while i+5<len(rows):
  idx=int(rows[i]);color=int(rows[i+1]);xyz=[float(x) for x in rows[i+2].split()];links=[int(x) for x in rows[i+3:i+6]]
  assert len(xyz)==3;nodes.append({'id':idx,'color':color,'position':xyz,'links':links});i+=6
 assert i==len(rows);paths.append(nodes)
(ROOT/'private/assets/ai-paths.json').write_text(json.dumps(paths));print('AI graph sizes:',[len(g) for g in paths])
