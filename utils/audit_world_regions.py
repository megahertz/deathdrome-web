"""Compare native partition/region construction and lookup with the JS port.

DXF text is decoded by extract_regions.py. The original WorldPartition,
WorldClearRegions, color-bit allocator, WorldAddRegions polygon action and
point lookup run unmodified; only allocation is replaced with an empty heap.
"""
import hashlib,json,struct,subprocess
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX,UC_X86_REG_EDX,UC_X86_REG_ESP,UC_X86_REG_EIP
from native_ai_audit import Native,ROOT,EXE,RUNNER
from extract_regions import region_data

def bits(value):return struct.unpack('<f',struct.pack('<I',value))[0]
data=region_data();n=Native();heap=0x3100000;n.cpu.mem_map(heap,0x100000)
def allocate(cpu,address,size,user):
    global heap
    count=cpu.reg_read(UC_X86_REG_EAX);size=cpu.reg_read(UC_X86_REG_EDX)
    result=heap;heap+=(count*size+15)&~15
    sp=cpu.reg_read(UC_X86_REG_ESP);cpu.reg_write(UC_X86_REG_EAX,result)
    cpu.reg_write(UC_X86_REG_EIP,n.read(sp,'I')[0]);cpu.reg_write(UC_X86_REG_ESP,sp+4)
n.cpu.hook_add(UC_HOOK_CODE,allocate,begin=0x469eb7,end=0x469eb7)
world,fields,polygon,output=RUNNER,RUNNER+0x100,RUNNER+0x800,RUNNER+0x1000
n.write(world+0x44,'I',fields)
n.write(0x490ce4,'II',RUNNER+0x2000,RUNNER+0x3000)
n.call(0x444710,data['extents'],eax=world)
n.call(0x4446c8,data['origin'],eax=world)
n.call(0x444754,data['partition'],eax=world)
columns,rows=n.read(fields+0x60,'II');table=n.read(fields+0x68,'I')[0]
cell=lambda row,col:n.read(table+row*4,'I')[0]+col*0x44
arenas=[]
for number,faces in enumerate(data['arenas'],1):
    n.call(0x4111e4,eax=world)
    for face in faces:
        mask=n.call(0x411140,eax=face['color'])
        n.write(polygon,'f'*12,*(v for p in face['vertices'] for v in p))
        n.call(0x444d4c,eax=world,edx=polygon,ebx=4,ecx=mask)
    masks=[n.read(cell(r,c)+4,'I')[0] for r in range(rows) for c in range(columns)]
    colors=list(n.read(0x4b0280,'I'*n.read(0x48bf60,'I')[0]))
    probes=[]
    for z in [1200,896,895.9999,*range(832,-897,-64),-896.0001,-1200]:
        for x in [-1200,-896,-895.9999,*range(-832,897,64),896.0001,1200]:
            n.call(0x444bd8,[x,z,bits(output)],eax=world)
            probes.append({'x':x,'z':z,'mask':n.read(output,'I')[0]})
    arenas.append({'arena':number,'colors':colors,'masks':masks,'probes':probes})
script="""import {WorldRegions} from './src/world-regions.js';let text='';for await(const c of process.stdin)text+=c;console.log(JSON.stringify(JSON.parse(text).map(a=>{const grid=new WorldRegions(a.arena);return {colors:grid.colors,masks:[...grid.masks],probes:a.probes.map(p=>grid.maskAt(p.x,p.z))}})));"""
rebuilt=json.loads(subprocess.run(['node','--import','./utils/tests/setup.js','--input-type=module','-e',script],cwd=ROOT,input=json.dumps(arenas),text=True,capture_output=True,check=True).stdout)
mismatches=[]
for arena,rebuild in zip(arenas,rebuilt):
    if arena['colors']!=rebuild['colors']:mismatches.append({'arena':arena['arena'],'kind':'colors'})
    for i,(a,b) in enumerate(zip(arena['masks'],rebuild['masks'])):
        if a!=b:mismatches.append({'arena':arena['arena'],'kind':'cell','index':i,'native':a,'rebuild':b})
    for i,(a,b) in enumerate(zip(arena['probes'],rebuild['probes'])):
        if a['mask']!=b:mismatches.append({'arena':arena['arena'],'kind':'point','probe':a,'rebuild':b})
report={'scope':'Original 444754 partition initialization, 4111e4 region clear, 411140 color masks, 444d4c region union and 444bd8/44437c position lookup using original SETUP.GW and all eight DXF region files.',
        'sha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'columns':columns,'rows':rows,
        'cellCases':rows*columns*len(arenas),'lookupCases':sum(len(a['probes']) for a in arenas),
        'arenas':arenas,'mismatches':mismatches,'passed':not mismatches,
        'limitations':['DXF text decoding is supplied; raw vertex coordinates/order and colors are preserved. Native file I/O is not executed.',
                       'This verifies region masks, not the full scene collector or object hierarchy.',
                       'HUD population/profile lifecycle and native out-of-region death timing are separate.']}
(ROOT/'private/verification/world-regions-native.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['columns','rows','cellCases','lookupCases','passed']}))
print(json.dumps(mismatches[:10]))
if mismatches:raise SystemExit(1)
