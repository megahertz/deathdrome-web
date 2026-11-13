"""Capture 415300 opponent health rectangle endpoints with supplied profiles.
Display queue/rasterization and original profile lookup are isolated.
"""
import sys,struct,json
sys.path.insert(0,'utils')
from native_ai_audit import Native,ROOT,RUNNER
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX
rows=[]
for health in [0,.9,1,5,10,24,25,49,50,75,90,98,100]:
 n=Native();records=[]
 def ret(address,value):n.cpu.mem_write(address,b'\xb8'+struct.pack('<I',value)+b'\xc3')
 for address,value in [(0x418fd4,0),(0x419008,0),(0x411ee8,0),(0x417534,192),(0x41a298,0),(0x418b28,1)]:ret(address,value)
 n.write(0x48bf8c,'i',156);n.write(RUNNER+0xf000,'f',health)
 n.cpu.mem_write(0x418dc0,b'\xd9\x05'+struct.pack('<I',RUNNER+0xf000)+b'\xc3')
 n.cpu.mem_write(0x434ad4,b'\xc1\xe0\x0c\x05'+struct.pack('<I',RUNNER)+b'\xc3')
 for i in range(8):n.write(RUNNER+i*0x1000+0x15e,'B',1)
 n.cpu.mem_write(0x414348,b'\xc3');n.cpu.mem_write(0x443f20,b'\xc3')
 def cap(cpu,address,size,user):
  p=cpu.reg_read(UC_X86_REG_EAX)
  if n.read(p,'I')[0]==3:records.append(list(n.read(p+12,'ffffffff')))
 n.cpu.hook_add(UC_HOOK_CODE,cap,begin=0x414348,end=0x414348)
 n.call(0x415300,eax=1)
 rows.append(dict(health=health,records=records))
report={'sourceFunction':'0x415300','scope':'Original opponent health rectangle endpoints; supplied profile values, active runner and rendering hooks. Raster coverage and complete HUD scheduling are not compared.','samples':[{'health':r['health'],'bar':({'x':r['records'][-1][0],'width':r['records'][-1][6]-r['records'][-1][0]} if len(r['records'])>1 else {'x':198,'width':0})} for r in rows]};(ROOT/'private/verification/opponent-health-bars-native.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
