"""Original AI candidate scan and one-runner-hit visibility predicate.

Original 42c9bc, distance helper, ID lookup and runner-ancestor name check run.
Candidate poses/active flags and classified query hits are supplied; this does
not verify mesh traversal, authored chassis bounding boxes or scene scheduling.
"""
import json,random,struct,hashlib,subprocess
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX,UC_X86_REG_ESP
from native_ai_audit import Native,ROOT,EXE,RUNNER,SCRATCH,f32

class TargetNative(Native):
    def __init__(self):
        super().__init__();self.current=0;self.queries=[]
        self.records=[RUNNER+i*0x800 for i in range(8)];self.roots=[RUNNER+0x5000+i*0x100 for i in range(8)];self.output=RUNNER+0x7000;self.wall=RUNNER+0x6800
        self.write(0x48f104,'8I',*self.roots);self.cpu.mem_write(self.wall,b'wall\0')
        for i,(root,record) in enumerate(zip(self.roots,self.records)):
            self.cpu.mem_write(root,('runner_'+str(i)).encode()+b'\0');self.write(root+0x4c,'I',record);self.write(record+0xc,'I',root)
        self.cpu.hook_add(UC_HOOK_CODE,self.lookup,begin=0x434ad4,end=0x434ad4);self.cpu.hook_add(UC_HOOK_CODE,self.ray,begin=0x446764,end=0x446764)
    def lookup(self,cpu,address,size,data):self.current=cpu.reg_read(UC_X86_REG_EAX)
    def ray(self,cpu,address,size,data):
        esp=cpu.reg_read(UC_X86_REG_ESP);out=self.read(esp+28,'I')[0];hits=self.fixture['hits'][self.current]
        self.queries.append({'candidate':self.current,'ray':list(self.read(esp+4,'6f'))});self.write(out,'I',len(hits))
        for i,hit in enumerate(hits):self.write(out+4+i*32+28,'I',self.roots[hit.get('runner',0)] if hit['kind']=='runner' else self.wall)
        self.visibility(not hits)
    def run(self,fixture):
        self.fixture=fixture;self.queries=[]
        for r,record in zip(fixture['runners'],self.records):
            self.write(record+0x2c,'3f',r['x'],r['y'],r['z']);active=not any(r.get(k) for k in ['dead','inactive','respawn','escaped','opponentExit']);self.write(record+0x15e,'B',int(active))
        ok=bool(self.call(0x42c9bc,[fixture['radiusSquared']],eax=self.records[fixture['actor']],edx=self.output)&255);chosen=self.read(self.output,'I')[0]
        return {'target':self.records.index(chosen) if ok else None,'queries':self.queries}

def main():
    rng=random.Random(0x42c9bc);n=TargetNative();fixtures=[]
    for case in range(1000):
        actor=case%8;origin=[f32(rng.uniform(65,200)),f32(rng.uniform(-5,15)),f32(rng.uniform(-200,200))];radius=[1000,10000,90000][case%3];runners=[];hits=[]
        for i in range(8):
            point=[f32(origin[0]+rng.uniform(-80,80)),f32(origin[1]+rng.uniform(-6,6)),f32(origin[2]+rng.uniform(-80,80))]
            state={'id':i,**dict(zip('xyz',point))}
            if (case+i)%9==0:state[['dead','inactive','respawn','escaped','opponentExit'][(case+i)%5]]=True
            if (case+i)%6==0:state.update(x=f32([60,59.999996,60.000004,-60][case%4]),y=0)
            if (case+i)%7==0:state['y']=f32(origin[1]+[5,5.000001,4.999999,-5][case%4])
            runners.append(state)
            choices=[[],[{'kind':'runner','runner':i}],[{'kind':'wall'}],[{'kind':'runner','runner':i},{'kind':'wall'}],[{'kind':'runner','runner':(i+1)%8}],[{'kind':'runner','runner':i},{'kind':'runner','runner':(i+1)%8}]]
            hits.append(choices[(case+i)%6])
        runners[actor]={'id':actor,**dict(zip('xyz',origin))};hits[actor]=[]
        fixture={'actor':actor,'radiusSquared':radius,'runners':runners,'hits':hits};fixture['native']=n.run(fixture);fixtures.append(fixture)
    js="""import {acquireAITarget} from './src/ai-actions.js';let input='';for await(const c of process.stdin)input+=c;console.log(JSON.stringify(JSON.parse(input).map(f=>{const queries=[],sim={runners:f.runners,sceneContacts(a,b,r,q){queries.push({candidate:q.id,ray:[a.x,a.y,a.z,b.x,b.y,b.z]});return f.hits[q.id]}};return {target:acquireAITarget(sim,sim.runners[f.actor],f)?.id??null,queries}})));"""
    actual=json.loads(subprocess.run(['node','--import','./utils/tests/setup.js','--input-type=module','-e',js],cwd=ROOT,input=json.dumps(fixtures),text=True,capture_output=True,check=True).stdout)
    errors=[{'case':i,'expected':f['native'],'actual':got} for i,(f,got) in enumerate(zip(fixtures,actual)) if f['native']!=got]
    report={'scope':__doc__,'executableSha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'cases':len(fixtures),'nativeRayQueries':sum(len(f['native']['queries']) for f in fixtures),'mismatchCount':len(errors),'mismatches':errors[:8],'passed':not errors,'fixtures':fixtures}
    (ROOT/'private/verification/ai-targeting-native.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['cases','nativeRayQueries','mismatchCount','mismatches','passed']},indent=2))
    if errors:raise SystemExit(1)
if __name__=='__main__':main()
