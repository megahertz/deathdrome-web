"""Capture original HUD display records with supplied profile values.

Scene drawing/queueing is replaced with record capture. This recovers layout,
not original raster coverage, scheduling, radar contacts or complete gameplay.
"""
import json,struct,hashlib
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX,UC_X86_REG_EIP,UC_X86_REG_ESP
import re
from native_ai_audit import Native,ROOT,EXE,RUNNER

result={'source':'private/original/game/RUN/ddrome.exe','sha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'limitations':['Supplied profile values; drawing and display-list insertion are stubbed. No renderer or complete gameplay equivalence claim.'],'modes':{}}
for mode in [0,5]:
 n=Native();records=[]
 def ret(address,value):n.cpu.mem_write(address,b'\xb8'+struct.pack('<I',value)+b'\xc3')
 for address,value in [(0x41a298,mode),(0x418fd4,0),(0x419008,0),(0x418b28,1),(0x418efc,3),(0x418bb4,0),(0x4187dc,2),(0x4392ac,0),(0x411ee8,0),(0x4496b4,10 if mode!=5 else 7),(0x417534,192),(0x43414c,8)]:ret(address,value)
 n.write(0x48bf8c,'i',156);n.write(0x48d8d0,'f',98.);n.write(0x48d8c4,'I',500);n.write(0x48d8d8,'I',0)
 n.cpu.mem_write(0x434ad4,b'\xc1\xe0\x0c\x05'+struct.pack('<I',RUNNER)+b'\xc3')
 for i in range(8):n.write(RUNNER+i*0x1000+0x15e,'B',int(i<5));n.write(RUNNER+i*0x1000+0xd8,'I',1)
 n.write(RUNNER+0x498,'I',4);n.write(RUNNER+0x4ac,'I',1)
 n.cpu.mem_write(0x448970,b'\xc3');n.cpu.mem_write(0x414348,b'\xc3')
 n.cpu.mem_write(0x443f20,b'\xc3')
 def sprintf(cpu,address,size,user):
  sp=cpu.reg_read(UC_X86_REG_ESP);dest,fmt=n.read(sp+4,'II');fmt=bytes(cpu.mem_read(fmt,120)).split(b'\0')[0].decode('ascii');specs=re.findall(r'%(?:[-+0 #]*\d*(?:\.\d+)?)[ldius]',fmt);values=[]
  for i,spec in enumerate(specs):
   value=n.read(sp+12+i*4,'i')[0]
   if spec.endswith('s'):value=bytes(cpu.mem_read(value,120)).split(b'\0')[0].decode('ascii')
   values.append(value)
  value=(fmt%tuple(values)).encode('ascii');cpu.mem_write(dest,value+b'\0');cpu.reg_write(UC_X86_REG_EAX,len(value))
 n.cpu.hook_add(UC_HOOK_CODE,sprintf,begin=0x443f20,end=0x443f20)
 def capture(cpu,address,size,user):
  pointer=cpu.reg_read(UC_X86_REG_EAX);kind=n.read(pointer,'I')[0]
  record={'address':hex(pointer),'kind':kind,'x':n.read(pointer+12,'i')[0],'y':n.read(pointer+16,'i')[0]}
  if kind==1:record['image']=n.read(pointer+20,'I')[0]
  elif kind==4:
   record['text']=bytes(cpu.mem_read(pointer+20,100)).split(b'\0')[0].decode('ascii');record['font']=n.read(pointer+120,'I')[0]
  elif kind==3:record['points']=list(n.read(pointer+12,'ffffffff'))
  records.append(record)
 n.cpu.hook_add(UC_HOOK_CODE,capture,begin=0x414348,end=0x414348)
 for address,args in [(0x416380,()),(0x416420,()),(0x415c20,()),(0x415d40,()),(0x415004,()),(0x415124,(296.2,)),(0x415300,()),(0x4156d0,()),(0x416854,()),(0x416038,())]:
  try:n.call(address,args,eax=3 if address==0x415c20 else 0)
  except Exception as e:raise RuntimeError(f'{address:x} at {n.cpu.reg_read(UC_X86_REG_EIP):x}') from e
 result['modes'][str(mode)]=list(records)
 if mode==0:
  notifications=[]
  for message in ['Health','Nitro','Missile']:
   n.cpu.mem_write(RUNNER+0xe000,message.encode()+b'\0');n.call(0x415b70,eax=RUNNER+0xe000)
   rows=[]
   for i in range(len(notifications)+1):
    pointer=0x4b4aa0+i*128
    rows.append({'text':bytes(n.cpu.mem_read(pointer+20,100)).split(b'\0')[0].decode(),'x':n.read(pointer+12,'i')[0],'y':n.read(pointer+16,'i')[0],'seconds':n.read(pointer+124,'f')[0]})
   notifications.append(sorted(rows,key=lambda r:r['y']))
  result['notifications']=notifications
  meters=[]
  for active,age,count,retract in [(False,0,0,0),(True,0,1,0),(True,1,2,0),(True,4.49,19,0),(True,4.49,20,0),(True,4.5,10,3),(True,5,20,19)]:
   n.write(RUNNER+0x454,'I',int(active));n.write(RUNNER+0x458,'f',age);n.write(RUNNER+0x488,'II',count,retract);records.clear();n.call(0x416854)
   meters.append({'active':active,'age':age,'count':count,'retract':retract,'width':records[-1]['points'][6]-51})
  result['barrierMeter']=meters
  keys=[];ret(0x440990,0)
  palette=(ROOT/'private/original/game/RUN/domain.act').read_bytes()
  for bits in range(8):
   for i in range(3):n.write(RUNNER+0x14e+i,'B',(bits>>i)&1)
   records.clear();n.call(0x414c7c,eax=RUNNER);rows=[]
   for i,record in enumerate(records):
    index=n.read(0x4b5050+i*0x78+112,'I')[0]
    rows.append({'x':record['points'][0],'y':record['points'][1],'width':record['points'][6]-record['points'][0],'height':record['points'][4]-record['points'][1],'color':'#'+palette[index*3:index*3+3].hex()})
   keys.append({'bits':bits,'rects':rows})
  result['keys']=keys
(ROOT/'private/verification/hud-layout-native.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result['modes'],ensure_ascii=False))
