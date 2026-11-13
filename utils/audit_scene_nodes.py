"""Verify parent direction using real Object3D add/remove and contact lookup.

Only allocation/free are supplied; native 45a3dc/44b760 install the parent
and child arrays, 45a3e4/44b898 remove them, and 434c54 searches the result.
"""
import hashlib,json,struct,subprocess
from unicorn import UC_HOOK_CODE,__version__
from unicorn.x86_const import UC_X86_REG_EAX,UC_X86_REG_EDX
from native_ai_audit import Native,ROOT,EXE,RUNNER

n=Native();heap=RUNNER+0x7000;sizes={}
n.cpu.mem_write(0x468c6c,b'\xc3');n.cpu.mem_write(0x467940,b'\xc3')
def allocate(cpu,address,size,data):
    global heap
    old=cpu.reg_read(UC_X86_REG_EAX);length=cpu.reg_read(UC_X86_REG_EDX);out=heap;heap+=(length+15)&~15
    if heap>=RUNNER+0x10000:raise RuntimeError('Supplied node allocation pool exhausted')
    cpu.mem_write(out,bytes(cpu.mem_read(old,min(length,sizes[old]))) if old else b'\0'*length)
    sizes[out]=length;cpu.reg_write(UC_X86_REG_EAX,out)
n.cpu.hook_add(UC_HOOK_CODE,allocate,begin=0x468c6c,end=0x468c6c)
graphs=[
 {'name':'nearest ancestor and case-sensitive prefixes','names':['world','runner_outer','runner_inner','chassis','cockpit','Runner_wrong','geometry'],
  'edges':[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6]],'remove':[[3,4]]},
 {'name':'matching descendants and siblings are not ancestors','names':['world','assembly','plain','EKey_sibling','runner_child','enh_descendant'],
  'edges':[[0,1],[1,2],[1,3],[2,4],[4,5]],'remove':[[2,4]]},
 {'name':'shared node searches newest parent first','names':['world','runner_first','runner_last','shared','leaf','EKey_parent'],
  'edges':[[0,1],[0,2],[1,3],[2,3],[3,4],[5,3]],'remove':[[5,3],[2,3]]},
 {'name':'nested categories and detached world node','names':['world','HotSpot_parent_outer','barrier_2','enh_inner','shape','scrub_model','runner_detached','door_x','lift_x'],
  'edges':[[0,1],[1,2],[2,3],[3,4],[0,5],[0,7],[7,8]],'remove':[[2,3],[7,8]]}
]
cases=[];stages=[]
for graphindex,g in enumerate(graphs):
    n.cpu.mem_write(RUNNER,b'\0'*0x10000);heap=RUNNER+0x7000;sizes.clear();addresses=[RUNNER+0x1000+i*0x200 for i in range(len(g['names']))]
    for address,name in zip(addresses,g['names']):
        n.cpu.mem_write(address,name.encode()+b'\0');n.write(address+0x28,'I',1);n.write(address+0x40,'B',5)
    for parent,child in g['edges']:n.call(0x45a3dc,eax=addresses[parent],edx=addresses[child])
    for stage in range(1+len(g['remove'])):
        if stage:
            parent,child=g['remove'][stage-1];n.call(0x45a3e4,eax=addresses[parent],edx=addresses[child])
        links=[]
        for address in addresses:
            def array(offset):
                count,pointer=n.read(address+offset,'II');return [addresses.index(p) for p in n.read(pointer,'I'*count)] if count else []
            links.append({'parents':array(0x58),'children':array(0x68)})
        stages.append({'graph':graphindex,'stage':stage,'links':links})
        for index,address in enumerate(addresses):
            for prefix in ['runner_','Runner_','EKey','enh_','HotSpot_parent','barrier_','scrub_model','door_','lift_','missing']:
                n.cpu.mem_write(RUNNER+0x100,prefix.encode()+b'\0')
                found=n.call(0x434c54,eax=address,edx=RUNNER+0x100,ebx=len(prefix))
                child=n.call(0x44b47c,eax=address,edx=RUNNER+0x100,ebx=len(prefix))
                cases.append({'graph':graphindex,'stage':stage,'node':index,'prefix':prefix,'native':addresses.index(found) if found else None,'nativeChildSearch':addresses.index(child) if child else None})
script="""import {findContactNode} from './src/scene-nodes.js';let s='';for await(const c of process.stdin)s+=c;let q=JSON.parse(s);let graphs=q.graphs.map(g=>g.names.map((name,id)=>({name,id,parents:[],children:[]})));let snapshots=[];for(let t of q.stages){let nodes=graphs[t.graph];t.links.forEach((l,i)=>{nodes[i].parents=l.parents.map(p=>nodes[p]);nodes[i].children=l.children.map(p=>nodes[p])});snapshots.push(q.cases.filter(c=>c.graph===t.graph&&c.stage===t.stage).map(c=>findContactNode(nodes[c.node],c.prefix)?.id??null))}console.log(JSON.stringify(snapshots.flat()));"""
rebuild=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js','--input-type=module','-e',script],cwd=ROOT,input=json.dumps({'graphs':graphs,'stages':stages,'cases':cases}).encode()))
mismatches=[{'case':i,'native':a['native'],'rebuild':b} for i,(a,b) in enumerate(zip(cases,rebuild)) if a['native']!=b]
report={'scope':'Real native 45a3dc/44b760 and 45a3e4/44b898 add/remove Object3D edges; actual 434c54 parent lookup. 44b47c child lookup is recorded independently to establish direction.',
        'sha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'emulator':'Unicorn '+__version__,'graphs':graphs,'stages':stages,'cases':cases,'rebuild':rebuild,'mismatches':mismatches,'passed':not mismatches,
        'limitations':['Node allocation/free use a supplied memory pool, and pre-marked transform notifications avoid the global dirty-node scheduler.','Graphs are acyclic and supplied; native GameGen loading/pruning, complete runtime node identity and geometry collection are not executed.','Production facet paths still supply a single ancestor chain rather than all native parent instances.']}
(ROOT/'private/verification/scene-nodes-native.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'graphs':len(graphs),'stages':len(stages),'queries':len(cases),'mismatches':mismatches[:3],'passed':not mismatches}))
if mismatches:raise SystemExit(1)
