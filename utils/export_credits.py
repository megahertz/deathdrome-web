"""Decode the straight-line credits queue setup in the supplied executable."""
from pathlib import Path
import struct,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
exe=(ROOT/'private/original/game/RUN/ddrome.exe').read_bytes()
def code(va):return va-0x410000+0x400
pe=struct.unpack_from('<I',exe,60)[0]
section_start=pe+24+struct.unpack_from('<H',exe,pe+20)[0]
sections=[struct.unpack_from('<IIII',exe,section_start+i*40+8) for i in range(struct.unpack_from('<H',exe,pe+6)[0])]
def string(va):
 for _,rva,size,raw in sections:
  if raw and 0x400000+rva<=va<0x400000+rva+size:
   return exe[raw+va-0x400000-rva:].split(b'\0')[0].decode('ascii')
 raise ValueError('String pointer outside executable')
colors=['grey','yelo','blue','red','gren','lblu','purp','whit','orng','pink']
fonts=[]
for color in colors:
 fonts.append({'color':color,'size':10})
for color in colors:
 fonts.append({'color':color,'size':7})
# Both retail and demo use the same straight-line credits setup. Locate the
# initial two blank queue rows rather than assuming a retail code address.
import re
match=re.search(rb'\xba\x7d\x00\x00\x00\xb8....\xe8....\xba\x32\x00\x00\x00\x31\xdb\x31\xc0',exe,re.S)
if not match:raise ValueError('Unsupported credits setup')
start=match.start()+0x410000-0x400
queue_target=start+15+struct.unpack_from('<i',exe,match.start()+11)[0]
registers={'eax':0,'ebx':7,'edx':0};rows=[];y=240;p=start;center_reference=None
end=exe.index(bytes.fromhex('b8 02 00 00 00 89 f2'),code(start),code(start)+4096)+0x410000-0x400
while p<end:
 o=code(p);op=exe[o]
 if op in [0xb8,0xbb,0xba]:
  registers[{0xb8:'eax',0xbb:'ebx',0xba:'edx'}[op]]=struct.unpack_from('<I',exe,o+1)[0];p+=5
 elif op==0x31:
  registers[{0xc0:'eax',0xdb:'ebx',0xd2:'edx'}[exe[o+1]]]=0;p+=2
 elif op==0x89:
  target,source={0xda:('edx','ebx'),0xc2:('edx','eax')}[exe[o+1]];registers[target]=registers[source];p+=2
 elif op==0xe8:
  destination=p+5+struct.unpack_from('<i',exe,o+1)[0]
  if destination!=queue_target:
   # This helper centers by atlas cell width, including narrow glyph cells.
   center_reference=registers['edx'];value=string(center_reference);size=fonts[registers['eax']]['size'];registers['eax']=160-len(value)*size//2
  else:
   assert destination==queue_target,(hex(p),hex(destination))
   address=registers['eax'];value=string(address)[:50] if address else '';font_id=registers['ebx'];font=fonts[font_id]
   rows.append({'text':value,'address':hex(address) if address else None,'sourceCall':hex(p),'font':font_id,**font,'x':registers['edx'],'y':y,'centerReference':hex(center_reference) if center_reference else None})
   y+=font['size']+2;registers.update(eax=1,ebx=len(value),edx=address+len(value));center_reference=None
  p+=5
 else:raise ValueError(('Unexpected credits instruction',hex(p),hex(op)))
assert len(rows)<200 and rows[0]['text']=='CREDITS'
result={'source':'private/original/game/RUN/ddrome.exe','sha256':hashlib.sha256(exe).hexdigest(),'sourceFunctions':['0x425780','0x4255b0','0x425664','0x414df8'],'background':'dombak4','startY':240,'scrollPixels':1,'framesPerScroll':2,'referenceHz':60,'finishY':-20,'rows':rows,'limitation':'Original queue, font assignments, row advances and per-update scroll divisor are recovered. Native update frequency, fade and independent visual comparison remain unverified.'}
(ROOT/'private/assets/credits.json').write_text(json.dumps(result,indent=2)+'\n')
print('Exported credits:',len(rows),'queue rows,',sum(bool(r['text']) for r in rows),'text rows')
