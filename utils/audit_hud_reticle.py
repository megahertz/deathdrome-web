"""Execute original reticle projection/clamping with camera-local points.

417664 and 458b78 run unmodified. Camera-local transformation and image lookup
are supplied; this does not certify world-camera transforms or lock lifecycle.
"""
import json,math,struct,subprocess,hashlib,itertools
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX,UC_X86_REG_EDX
from native_ai_audit import Native,ROOT,EXE,RUNNER,f32
fixtures=[];native=[]
for small in [False,True]:
 n=Native();scale=1 if small else 2;width=320*scale;height=138*scale;top=17*scale;sprite=RUNNER+0x1000
 for address in [0x455a54,0x455a64,0x455a5c,0x458930,0x414348]:n.cpu.mem_write(address,b'\xc3')
 n.cpu.mem_write(0x448970,b'\xb8'+struct.pack('<I',sprite)+b'\xc3');n.write(sprite,'4H',0,0,8*scale,8*scale)
 n.cpu.mem_write(0x41a298,b'\xb8'+struct.pack('<I',5 if small else 0)+b'\xc3')
 n.write(0x95d7b8,'ff',f32(width/2/math.tan(math.radians(31))),f32(height/2/math.tan(math.radians(17.5))))
 n.write(0x95caf0,'ff',width/2,height/2);n.write(0x95d180,'ff',0,top)
 n.call(0x414c58,eax=0,ebx=top,edx=width,ecx=top+height-1)
 def local_transform(cpu,address,size,data):cpu.mem_write(cpu.reg_read(UC_X86_REG_EDX),bytes(cpu.mem_read(cpu.reg_read(UC_X86_REG_EAX),12)))
 n.cpu.hook_add(UC_HOOK_CODE,local_transform,begin=0x458930,end=0x458930)
 records=[]
 def capture(cpu,address,size,data):
  p=cpu.reg_read(UC_X86_REG_EAX);x,y=n.read(p+12,'ii');records.append({'x':x,'y':y,'width':8,'height':8})
 n.cpu.hook_add(UC_HOOK_CODE,capture,begin=0x414348,end=0x414348)
 for x,y,z in itertools.product([-500,-10,0,10,500],[-100,-1,0,1,100],[-100,0,20,100]):
  point=dict(zip('xyz',map(f32,[x,y,z])));n.write(RUNNER,'fff',*point.values());n.call(0x417664,eax=RUNNER);fixtures.append({'point':point,'options':{'small':small}});native.append(records[-1])
script="""import {projectReticle} from './src/hud-reticle.ts';let s='';for await(const c of process.stdin)s+=c;console.log(JSON.stringify(JSON.parse(s).map(f=>projectReticle(f.point,f.options))));"""
rebuild=json.loads(subprocess.run(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',script],cwd=ROOT,input=json.dumps(fixtures),capture_output=True,text=True,check=True).stdout)
mismatches=[{'fixture':i,'native':a,'rebuild':b} for i,(a,b) in enumerate(zip(native,rebuild)) if a!=b]
report={'scope':'Unmodified native 417664 reticle placement and 458b78 projection with supplied camera-local points and native gameplay viewport/FOV. Original 414c58 clip setup is executed.','sha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'fixtures':fixtures,'native':native,'rebuild':rebuild,'cases':len(fixtures),'mismatches':mismatches,'passed':not mismatches,'limitations':['World-to-camera transformation and image lookup are supplied. This is not a comparison of full native camera/lock scheduling.','Only production high-resolution HUD is connected; low-resolution action is compared as an isolated component.']}
(ROOT/'private/verification/hud-reticle-native.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'cases':len(fixtures),'mismatches':len(mismatches),'examples':mismatches[:5]}))
if mismatches:raise SystemExit(1)
