"""Execute 437620 with supplied health, active shared locks and frame clocks."""
import json,struct,subprocess,itertools,hashlib
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX,UC_X86_REG_ESP
from native_ai_audit import Native,ROOT,EXE,RUNNER,SCRATCH,f32
fixtures=[{'health':f32(h),'locked':lock,'active':active,'timer':f32(timer),'dt':f32(dt)} for h,lock,active,timer,dt in itertools.product([0,.9,24.999,25,100],[False,True],[False,True],[0,.99,1.99],[1/60,.1,.5])];native=[]
for fixture in fixtures:
 n=Native();effects=[]
 def ret(address,value):n.cpu.mem_write(address,b'\xb8'+struct.pack('<I',value)+b'\xc3')
 ret(0x4187b0,8);n.cpu.mem_write(0x434ad4,b'\xc1\xe0\x0c\x05'+struct.pack('<I',RUNNER)+b'\xc3');n.write(RUNNER+4,'I',0);n.write(0x48d8d0,'f',fixture['health']);n.write(RUNNER+0x6f0,'B',int(fixture['active']));n.write(RUNNER+0x6f4,'f',fixture['timer']);n.write(RUNNER+0x1000+0x15e,'B',1);n.write(RUNNER+0x1000+0x6f8,'I',RUNNER if fixture['locked'] else 0)
 n.write(SCRATCH,'f',fixture['dt']);n.cpu.mem_write(0x44ca3c,b'\xd9\x05'+struct.pack('<I',SCRATCH)+b'\xc3')
 for address in [0x443f20,0x4159ec,0x415a5c,0x415ac8,0x415a50,0x41837c,0x4182f4]:n.cpu.mem_write(address,b'\xc3')
 def effects_hook(cpu,address,size,user):
  value=cpu.reg_read(UC_X86_REG_EAX)
  if address==0x443f20:
   dest,source=n.read(cpu.reg_read(UC_X86_REG_ESP)+4,'II');text=bytes(cpu.mem_read(source,80)).split(b'\0')[0];cpu.mem_write(dest,text+b'\0')
  elif address==0x4159ec:effects.append({'kind':'message','value':bytes(cpu.mem_read(value,80)).split(b'\0')[0].decode()})
  elif address==0x415a5c:effects.append({'kind':'shade','value':'h' if value else 'l'})
  elif address==0x415a50:effects.append({'kind':'clear'})
 for address in [0x443f20,0x4159ec,0x415a5c,0x415a50]:n.cpu.hook_add(UC_HOOK_CODE,effects_hook,begin=address,end=address)
 n.call(0x437620,eax=RUNNER);native.append({'active':bool(n.read(RUNNER+0x6f0,'B')[0]),'timer':n.read(RUNNER+0x6f4,'f')[0],'message':next((e['value'] for e in effects if e['kind']=='message'),None),'shade':next((e['value'] for e in reversed(effects) if e['kind']=='shade'),None),'clear':any(e['kind']=='clear' for e in effects)})
js="""import {stepHudWarning} from './src/hud-warning.js';let s='';for await(const c of process.stdin)s+=c;console.log(JSON.stringify(JSON.parse(s).map(f=>{let state={active:f.active,timer:f.timer};let result=stepHudWarning(state,f,f.dt);return {active:state.active,timer:state.timer,message:result.started?state.message:null,shade:state.shade??null,clear:result.clear}})));"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js','--input-type=module','-e',js],cwd=ROOT,input=json.dumps(fixtures).encode()));mismatches=[{'fixture':i,'native':a,'rebuild':b} for i,(a,b) in enumerate(zip(native,rebuilt)) if a!=b]
report={'scope':'Original warning action 437620 with actual profile health lookup, active lock scan, float timer and sound/drawing hooks. No global scene scheduling comparison.','sha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'fixtures':fixtures,'native':native,'rebuild':rebuilt,'mismatches':mismatches,'passed':not mismatches};(ROOT/'private/verification/hud-warning-native.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'cases':len(fixtures),'mismatches':len(mismatches),'examples':mismatches[:3]}))
if mismatches:raise SystemExit(1)
