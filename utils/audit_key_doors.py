"""Execute the original secret-door key gate and float lift action in Unicorn.

Child lookup, string formatting and callback registration are supplied. Real
45a6a4/45a6bc read/write translations; the native scene scheduler is not run.
"""
import hashlib,itertools,json,struct,subprocess
from unicorn import UC_HOOK_CODE,__version__
from native_ai_audit import Native,ROOT,EXE,RUNNER,SCRATCH,f32

n=Native();parent=RUNNER;lift=RUNNER+0x400;fields=RUNNER+0x800;runner=RUNNER+0x1000
n.cpu.mem_write(0x443f20,b'\xc3') # format output unused by supplied lookup
n.cpu.mem_write(0x434b44,b'\xa1'+struct.pack('<I',SCRATCH+0x200)+b'\xc3')
n.cpu.mem_write(0x44b628,b'\x89\x50\x54\xc3') # node callback field only
translations=[]
n.cpu.hook_add(UC_HOOK_CODE,lambda *args:translations.append(True),begin=0x45a6bc,end=0x45a6bc)
assert n.read(0x48578c,'f')[0]==3

def reset(key='x',height=0,remaining=0,callback=False,enabled=True):
    n.cpu.mem_write(RUNNER,b'\0'*0x2000);n.cpu.mem_write(0x51a9b0,b'\0'*36)
    n.cpu.mem_write(parent,('door_'+key+'\0').encode());n.cpu.mem_write(lift,('lift_'+key+'\0').encode())
    for node in [parent,lift]:
        n.write(node+0x24,'I',int(enabled));n.write(node+0x28,'I',1);n.write(node+0x44,'I',fields)
    n.write(fields+0x24,'3f',12.5,height,-7)
    n.write(lift+0x54,'I',0x440998 if callback else 0)
    n.write(0x51a9b0+'xyz'.index(key)*12,'If',lift,remaining)
    translations.clear()

def state(key):
    return {'height':n.read(fields+0x28,'f')[0],'remaining':n.read(0x51a9b4+'xyz'.index(key)*12,'f')[0],
            'callback':bool(n.read(lift+0x54,'I')[0]),'enabled':bool(n.read(lift+0x24,'I')[0])}

touches=[]
for key,mask,override,enabled,child in itertools.product('xyz',range(8),[False,True],[False,True],[False,True]):
    reset(key,remaining=2)
    n.write(parent+0x24,'I',int(enabled));n.write(0x48f790,'B',int(override))
    ring={k:bool(mask&(1<<i)) for i,k in enumerate('xyz')}
    n.write(runner+0x14e,'3B',*(int(ring[k]) for k in 'xyz'))
    n.write(SCRATCH+0x200,'I',lift if child else 0)
    n.call(0x4408c0,eax=parent,edx=runner)
    pointer,remaining=n.read(0x51a9b0+'xyz'.index(key)*12,'If')
    selected=lift if child else parent
    touches.append({'key':key,'keyring':ring,'override':override,'enabled':enabled,'child':child,
                    'accepted':n.read(selected+0x54,'I')[0]==0x440998,
                    'pointer':('lift' if pointer==lift else 'parent' if pointer==parent else 'other'),
                    'remaining':remaining})

fixtures=[]
for key,height,remaining,dt,enabled in itertools.product('xyz',[0,1,9.99,9.999999046325684,10,10.05],
        [8,4.000000476837158,4,3.999999761581421,f32(1/60),0,-f32(1/60)],
        [0,1/120,1/60,1/30,.5,4],[False,True]):
    reset(key,f32(height),f32(remaining),True,enabled);before=state(key);n.write(0x518aa8,'f',dt)
    n.call(0x440998,eax=lift)
    assert n.read(fields+0x24,'f')[0]==12.5 and n.read(fields+0x2c,'f')[0]==-7
    fixtures.append({'key':key,'before':before,'dt':f32(dt),'after':state(key),'writes':len(translations)})

traces=[]
for name,clock,frames,refresh in [('30Hz',[1/30],270,[]),('60Hz',[1/60],520,[]),
        ('120Hz',[1/120],1000,[]),('irregular',[1/120,1/30,1/60,.125],300,[]),
        ('contact refresh',[1/60],650,[120,240])]:
    reset('x',remaining=8,callback=True);samples=[]
    for frame in range(frames):
        if frame in refresh:
            n.write(0x51a9b4,'f',8);n.write(lift+0x54,'I',0x440998)
        dt=f32(clock[frame%len(clock)]);n.write(0x518aa8,'f',dt);translations.clear()
        if n.read(lift+0x54,'I')[0]:n.call(0x440998,eax=lift)
        samples.append({'dt':dt,'after':state('x'),'writes':len(translations)})
    traces.append({'name':name,'refresh':refresh,'samples':samples})

script="""import {KeyDoors,stepKeyDoor} from './src/key-doors.js';let s='';for await(const c of process.stdin)s+=c;const q=JSON.parse(s);console.log(JSON.stringify({touches:q.touches.map(t=>{let d=new KeyDoors();d.override=t.override;d.doors[t.key].touchEnabled=t.enabled;d.doors[t.key].remaining=2;let accepted=d.touch(t.key,{keyring:t.keyring});return {accepted,remaining:d.doors[t.key].remaining}}),fixtures:q.fixtures.map(t=>{let d={...t.before};let writes=+stepKeyDoor(d,t.dt);return {after:d,writes}}),traces:q.traces.map(t=>{let d={height:0,remaining:8,callback:true,enabled:true};return t.samples.map((s,i)=>{if(t.refresh.includes(i)){d.remaining=8;d.callback=true}let writes=+stepKeyDoor(d,s.dt);return {after:{...d},writes}})})}));"""
rebuilt=json.loads(subprocess.run(['node','--import','./utils/tests/setup.js','--input-type=module','-e',script],cwd=ROOT,input=json.dumps({'touches':touches,'fixtures':fixtures,'traces':traces}),text=True,capture_output=True,check=True).stdout)
mismatches=[];maximum=0
for i,(a,b) in enumerate(zip(touches,rebuilt['touches'])):
    if a['accepted']!=b['accepted'] or a['remaining']!=b['remaining'] or (a['accepted'] and a['pointer']!=('lift' if a['child'] else 'parent')):
        mismatches.append({'touch':i,'native':a,'rebuild':b})
def compare(a,b,label):
    global maximum
    error=max(abs(a['after'][k]-b['after'][k]) for k in ['height','remaining']);maximum=max(maximum,error)
    if a!=b:mismatches.append({**label,'native':a,'rebuild':b,'error':error})
for i,(a,b) in enumerate(zip(fixtures,rebuilt['fixtures'])):compare({k:a[k] for k in ['after','writes']},b,{'fixture':i})
for i,(a,b) in enumerate(zip(traces,rebuilt['traces'])):
    for frame,(c,d) in enumerate(zip(a['samples'],b)):compare({k:c[k] for k in ['after','writes']},d,{'trace':i,'frame':frame})
report={'scope':'Native 4408c0 key/active/override gate with supplied child lookup; 440998 float timer/height action with real 45a6a4 and 45a6bc translation access.',
        'sha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'emulator':'Unicorn '+__version__,
        'touches':touches,'fixtures':fixtures,'traces':traces,'maximumNumericError':maximum,'mismatches':mismatches,'passed':not mismatches,
        'limitations':['String formatting, child lookup, global callback registration and scheduler are supplied. Native geometry collection, contact dispatch and frame ordering are not executed.','The three key classes share the native per-key timer; complete multiple-door identity and dynamic enable lifecycle are not covered.','Native scene-loader BBOX propagation, runner chassis script flags, original rendering and full rounds are not covered.']}
(ROOT/'private/verification/key-doors-native.json').write_text(json.dumps(report,separators=(',',':'))+'\n')
print(json.dumps({'touchCases':len(touches),'actionCases':len(fixtures),'traceUpdates':sum(len(t['samples']) for t in traces),'maximumNumericError':maximum,'mismatchCount':len(mismatches),'firstMismatches':mismatches[:3],'passed':not mismatches}))
if mismatches:raise SystemExit(1)
