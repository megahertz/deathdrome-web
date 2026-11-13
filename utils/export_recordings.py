"""Copy original demo data unchanged; export provenance and record statistics.

Format recovered from ddrome.exe 437e00, 437d5c and 438122: 44-byte
header, 8-byte record headers, 72-byte controls or 68-byte runner states.
"""
from pathlib import Path
import struct,hashlib,json,shutil,collections
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'private/assets/recordings';OUT.mkdir(exist_ok=True)
manifest=[]
for i in range(9):
 source=ROOT/f'private/original/game/RUN/D{i}PBK';data=source.read_bytes()
 assert struct.unpack_from('<III',data)==(0x02265847,0,3)
 pos=44;counts=collections.Counter();end=None
 while pos<len(data):
  kind,time=struct.unpack_from('<If',data,pos);pos+=8
  assert kind in [0,1,2],(source,pos,kind)
  size={0:72,1:68,2:0}[kind];assert pos+size<=len(data)
  counts[kind]+=1;pos+=size
  if kind==2:end=time
 assert pos==len(data) and counts[2]==1 and counts[1]==counts[0]*8
 destination=f'd{i}pbk.bin';shutil.copyfile(source,OUT/destination)
 manifest.append({'name':f'D{i}PBK','file':destination,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'date':data[12:44].split(b'\0')[0].decode().strip(),'durationSeconds':end/1000,'inputRecords':counts[0],'runnerStateRecords':counts[1]})
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Exported',len(manifest),'unchanged original recordings,',sum(m['runnerStateRecords'] for m in manifest),'runner states')
