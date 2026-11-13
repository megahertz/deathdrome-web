"""Execute original IN AREA counting with recovered masks from all arenas."""
import json,struct,subprocess,hashlib
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_ESP
from native_ai_audit import Native,ROOT,EXE,RUNNER

n=Native();captured=[]
def ret(address,value=0):
    n.cpu.mem_write(address,b'\xb8'+struct.pack('<I',value)+b'\xc3')
    n.cpu.ctl_remove_cache(address,address+6)
for address in [0x414348,0x443f20,0x411ee8,0x41a298]:ret(address)
n.cpu.mem_write(0x434ad4,b'\xc1\xe0\x0c\x05'+struct.pack('<I',RUNNER)+b'\xba'+struct.pack('<I',RUNNER+0x9000)+b'\xc3')
n.write(0x48bf8c,'I',156);ret(0x43414c,8)
def count(cpu,address,size,user):captured.append(n.read(cpu.reg_read(UC_X86_REG_ESP)+12,'i')[0])
n.cpu.hook_add(UC_HOOK_CODE,count,begin=0x443f20,end=0x443f20)
audited=json.loads((ROOT/'private/verification/world-regions-native.json').read_text())
fixtures=[];native=[]
for arena in audited['arenas']:
    for player in range(8):
        for variant in range(4):
            runners=[]
            for model in range(8):
                cell=(model*23+variant*29+player*11)%196
                mask=arena['masks'][cell];active=model==player or (model+variant)%3!=0
                runners.append({'id':model,'zoneMask':mask,'inactive':not active})
                n.write(RUNNER+model*0x1000+0xd8,'I',mask);n.write(RUNNER+model*0x1000+0x15e,'B',int(active))
            ret(0x419008,player);captured.clear();n.call(0x416038)
            assert len(captured)==1
            fixtures.append({'arena':arena['arena'],'player':player,'runners':runners});native.append(captured[0])
script="""import {inAreaCount} from './src/hud.js';let s='';for await(const c of process.stdin)s+=c;console.log(JSON.stringify(JSON.parse(s).map(f=>inAreaCount(f,f.player))));"""
rebuild=json.loads(subprocess.run(['node','--import','./utils/tests/setup.js','--input-type=module','-e',script],cwd=ROOT,input=json.dumps(fixtures),text=True,capture_output=True,check=True).stdout)
mismatches=[{'index':i,'native':a,'rebuild':b} for i,(a,b) in enumerate(zip(native,rebuild)) if a!=b]
report={'scope':'Original 416038 IN AREA count with actual region masks, all eight arena grids, all eight selected model IDs and four active-model patterns.',
        'sha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'cases':len(fixtures),'fixtures':fixtures,'native':native,'rebuild':rebuild,'mismatches':mismatches,'passed':not mismatches,
        'limitations':['Single-player branch; profile lookup, model pointers, activity and draw-record insertion are supplied.','Full profile/model mapping and activity transitions during death, respawn and exit remain separate.']}
(ROOT/'private/verification/hud-regions-native.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'cases':len(fixtures),'mismatches':mismatches[:5],'passed':not mismatches}))
if mismatches:raise SystemExit(1)
