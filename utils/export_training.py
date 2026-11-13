"""Training-page strings/layout from executable functions 41c590..41c948."""
from pathlib import Path
import json,hashlib
ROOT=Path(__file__).resolve().parents[1];exe=(ROOT/'private/original/game/RUN/ddrome.exe').read_bytes()
# The demo moves this contiguous string block, while preserving its layout.
anchor=exe.index(b'Attention Criminals...\0')
def string(va):return exe[anchor+va-0x481470:].split(b'\0')[0].decode('ascii')
# address, x, y, font index, frames between characters, end pause frames
pages=[
 [(0x481470,25,32,14,2,30),(0x481488,25,47,14,1,40),(0x4814f4,25,72,14,1,60),(0x4815d8,25,117,14,1,60),(0x4816b4,25,169,14,1,40)],
 [(0x4816d8,30,32,13,1,5),(0x4816ec,115,48,13,1,5),(0x481704,55,150,13,1,5),(0x48171c,148,161,13,1,5),(0x481734,30,172,13,1,5)],
 [(0x481754,30,40,14,1,60),(0x481790,30,70,13,1,30),(0x4817a8,30,80,14,1,60),(0x48181c,30,124,13,1,30),(0x481834,30,134,14,1,45)],
 [(0x4818a8,20,31,14,1,60),(0x481918,55,58,13,1,60),(0x481928,55,66,14,1,60),(0x481968,55,84,13,1,60),(0x48197c,55,92,14,1,60),(0x4819a4,55,104,13,1,60),(0x4819b4,55,112,14,1,60),(0x4819fc,55,130,13,1,60),(0x481a0c,55,138,14,1,60),(0x481a4c,55,156,13,1,60),(0x481a5c,55,164,14,1,60)],
 [(0x481a90,25,31,14,1,60),(0x481ad8,25,57,14,1,60),(0x481b24,25,86,14,1,60),(0x481b58,25,113,14,1,60),(0x481b94,25,133,14,1,60),(0x481bd0,25,160,14,1,60)]
]
result={'source':'private/original/game/RUN/ddrome.exe','sha256':hashlib.sha256(exe).hexdigest(),'sourceFunctions':['0x41c590','0x41c650','0x41c710','0x41c7d0','0x41c948','0x419d7c','0x419e98','0x419fa0'],'pages':[]}
icons={3:[('tg_nr',20,48),('tg_sm',20,74),('tg_sw',20,98),('tg_ds',20,122),('tg_is',20,148)],4:[('tg_ns',240,22),('tg_ep',238,49),('tg_lc',240,75)]}
for i,page in enumerate(pages):
 result['pages'].append({'background':'runnerc' if i==1 else 'screen','paragraphs':[{'address':hex(a),'text':string(a),'x':x,'y':y,'color':'red' if f==13 else 'gren','intervalFrames':interval,'delayFrames':10,'pauseFrames':pause} for a,x,y,f,interval,pause in page],'icons':[{'name':n,'x':x,'y':y}for n,x,y in icons.get(i,[])]})
(ROOT/'private/assets/training.json').write_text(json.dumps(result,indent=2)+'\n')
print('Exported five native training pages')
