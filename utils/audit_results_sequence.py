"""Execute original result presenter with supplied clock and display hooks.
Default captures stub score/life services; the optional profile argument runs
real score/life mutations. No renderer, resource loading or real input runs.
"""
import json,struct,hashlib
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX,UC_X86_REG_EBX,UC_X86_REG_ECX,UC_X86_REG_EDX,UC_X86_REG_EIP
from native_ai_audit import Native,ROOT,EXE,RUNNER

def capture(key_frame=None,network=False,profile=None):
 n=Native();state={'frame':0,'score':5300};frames=[];sounds=[];pending=[]
 def ret(address,value=0,stack=0):n.cpu.mem_write(address,b'\xb8'+struct.pack('<I',value)+(b'\xc2'+struct.pack('<H',stack) if stack else b'\xc3'))
 for address in [0x44733c,0x447530,0x447bc8,0x4485f4,0x44887c,0x448970,0x449020,0x449030,0x4493bc,0x41837c,0x441810,0x441644,0x413894,0x44834c,0x449704,0x4182f4,0x418990,0x418964,0x467925]:ret(address)
 for address,value in [(0x418fd4,0),(0x418efc,3),(0x418bb4,profile['kills'] if profile else 2),(0x418934,0),(0x418954,0),(0x411ee8,int(network))]:ret(address,value)
 for address in [0x441810,0x418964,0x4493bc,0x467925]:n.cpu.mem_write(address,b'\xc3')
 ret(0x418490,stack=4);n.write(RUNNER,'f',profile['time'] if profile else 133.75);n.cpu.mem_write(0x43c160,b'\xd9\x05'+struct.pack('<I',RUNNER)+b'\xc3')
 if profile:
  original=EXE.read_bytes()
  for address in [0x418efc,0x418990,0x418964]:
   offset=address-0x410000+0x400;n.cpu.mem_write(address,original[offset:offset+16])
  n.write(0x48d8bc,'i',profile['score']);n.write(0x48d8d4,'ii',profile['lives'],0)
 def hook(cpu,address,size,user):
  eax=cpu.reg_read(UC_X86_REG_EAX);edx=cpu.reg_read(UC_X86_REG_EDX)
  if address==0x424c73:
   if state['frame']:frames.append({'frame':state['frame'],'labels':list(pending)})
   pending.clear();state['frame']+=1
  elif address==0x441810:cpu.reg_write(UC_X86_REG_EAX,round(state['frame']*1000/60))
  elif address==0x467925:cpu.mem_write(edx,str(eax).encode()+b'\0');cpu.reg_write(UC_X86_REG_EAX,edx)
  elif address==0x418990 and not profile:state['score']+=edx
  elif address==0x418964 and not profile:cpu.reg_write(UC_X86_REG_EAX,state['score'])
  elif address==0x4493bc:cpu.reg_write(UC_X86_REG_EAX,128 if key_frame and state['frame']>=key_frame else 0)
  elif address==0x449704:
   text=bytes(cpu.mem_read(eax,100)).split(b'\0')[0].decode('ascii');pending.append({'text':text,'x':edx,'y':cpu.reg_read(UC_X86_REG_EBX)})
  elif address==0x4182f4:sounds.append({'frame':state['frame'],'id':eax})
  elif address==0x425072:
   frames.append({'frame':state['frame'],'labels':list(pending)});cpu.reg_write(UC_X86_REG_EIP,0x3000000)
 for address in [0x424c73,0x441810,0x467925,0x418990,0x418964,0x4493bc,0x449704,0x4182f4,0x425072]:n.cpu.hook_add(UC_HOOK_CODE,hook,begin=address,end=address)
 n.call(0x424b70)
 result={'keyFrame':key_frame,'network':network,'sounds':sounds,'endFrame':state['frame'],'score':state['score'],'frames':frames}
 if profile:result.update(score=n.read(0x48d8bc,'i')[0],lives=n.read(0x48d8d4,'i')[0])
 return result
if __name__=='__main__':
 runs=[capture(),capture(200),capture(network=True)]
 report={'sourceFunction':'0x424b70','sha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'runs':runs,'limitations':['Supplied 60Hz frame clock and profiles; resource, queue and drawing functions are hooks.','Score increments captured by a supplied integer score store; no original score thresholds, life credits or real round completion are executed.','Network fixture only recovers the presentation branch, not multiplayer networking.']}
 (ROOT/'private/verification/results-sequence-native.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps([{'key':r['keyFrame'],'network':r['network'],'sounds':r['sounds'],'end':r['endFrame'],'score':r['score'],'firstRows':[(y,next((f['frame'] for f in r['frames'] if any(l['y']==y for l in f['labels'])),None)) for y in [65,95,125,175]]} for r in runs]))
