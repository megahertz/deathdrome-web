"""Execute the original span depth comparator and row insertion/splitting.

Compare exact visible intervals and stored depth endpoints after every incoming
span. This is the opaque row manager, not native scene initialization or shaded,
keyed or translucent rendering.
"""
import json,random,struct,hashlib,subprocess
from pathlib import Path
from audit_world_texture import TextureNative
from native_ai_audit import ROOT,EXE,f32

def span(x0,x1,q,dq):
    return {'x0':x0,'x1':x1,'q0':f32(q),'q1':f32(f32(dq)*(x1-x0)+f32(q)),'dq':f32(dq)}
class RowNative(TextureNative):
    def __init__(self):
        super().__init__(320,200);self.pool=self.reserve(2*1024*1024);self.out=self.reserve(4096);self.a=self.reserve(24);self.b=self.reserve(24)
    def record(self,address):
        a,b,q0,q1,dq=self.read(address,'iifff');return dict(x0=a,x1=b,q0=q0,q1=q1,dq=dq)
    def put(self,address,s):self.write(address,'iifffI',s['x0'],s['x1'],s['q0'],s['q1'],s['dq'],0)
    def reset(self):self.write(0x491034,'I',self.pool);self.write(self.rows,'I',0)
    def compare(self,a,b):
        self.put(self.a,a);self.put(self.b,b);return bool(self.call(0x46c404,eax=self.a,edx=self.b)&255)
    def insert(self,s):
        cursor=self.read(0x491034,'I')[0];self.put(cursor,s)
        count=self.call(0x46ccf8,eax=self.out,edx=0)
        assert count<1000
        visible=[self.record(p) for p in self.read(self.out,'I'*count)] if count else []
        row=[];address=self.read(self.rows,'I')[0];seen=set()
        while address:
            assert address not in seen and len(row)<1000;seen.add(address)
            row.append(self.record(address));address=self.read(address+20,'I')[0]
        return {'visible':visible,'row':row}

def main():
    n=RowNative();rng=random.Random(0x46ccf8);comparisons=[];sequences=[]
    for i in range(3200):
        a0=rng.randrange(-10,290);b0=rng.randrange(-10,290);alen=rng.randrange(1,81);blen=rng.randrange(1,81)
        if i%4==0:alen=0
        if i%5==0:blen=0
        aq=10**rng.uniform(-4,.2);bq=10**rng.uniform(-4,.2)
        if i%3==0:bq=aq+[-.000101,-.0001,-.000099,0,.000099,.0001,.000101][i%7]
        a=span(a0,a0+alen,aq,rng.uniform(-.8,.8)*aq/(alen+1));b=span(b0,b0+blen,bq,rng.uniform(-.8,.8)*bq/(blen+1))
        comparisons.append({'a':a,'b':b,'native':n.compare(a,b)})
    for case in range(200):
        incoming=[]
        if case<80:
            # All containment, adjacency, single-pixel and both depth directions.
            endpoints=[[0,100],[0,0],[100,100],[30,70],[-10,120],[100,120],[101,150],[40,110],[10,20],[25,90]]
            for j in range(12):
                x0,x1=endpoints[(case+j)%len(endpoints)];q=[1,.5,1.00005,1.0002][(case+j)%4]
                incoming.append(span(x0,x1,q,0 if case%3 else (j%3-1)*.001))
        else:
            for j in range(60):
                x0=rng.randrange(0,318);x1=rng.randrange(x0,320);q=10**rng.uniform(-3,.1)
                if j%5==0:q=1
                incoming.append(span(x0,x1,q,rng.uniform(-.8,.8)*q/(x1-x0+1)))
        n.reset();states=[]
        for s in incoming:states.append(n.insert(s))
        sequences.append({'incoming':incoming,'native':states})
    js="""import {compareSpanDepth,SpanBuffer} from './src/span-buffer.ts';let s='';for await(const c of process.stdin)s+=c;const q=JSON.parse(s);console.log(JSON.stringify({comparisons:q.comparisons.map(f=>compareSpanDepth(f.a,f.b)),sequences:q.sequences.map(f=>{const buffer=new SpanBuffer(1);return f.incoming.map(span=>{const visible=buffer.insert(0,span);return structuredClone({visible,row:buffer.rows[0]})})})}));"""
    rebuilt=json.loads(subprocess.run(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],cwd=ROOT,input=json.dumps({'comparisons':comparisons,'sequences':sequences}),text=True,capture_output=True,check=True).stdout)
    errors=[]
    for i,(f,v) in enumerate(zip(comparisons,rebuilt['comparisons'])):
        if f['native']!=v:errors.append({'kind':'depth','case':i,'fixture':f,'actual':v})
    for i,(f,states) in enumerate(zip(sequences,rebuilt['sequences'])):
        for j,(expected,actual) in enumerate(zip(f['native'],states)):
            if expected!=actual:errors.append({'kind':'row','sequence':i,'step':j,'incoming':f['incoming'][j],'expected':expected,'actual':actual})
    report={'scope':__doc__,'executableSha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'comparisonCases':len(comparisons),'sequencesCount':len(sequences),'insertionCases':sum(len(f['incoming']) for f in sequences),'mismatchCount':len(errors),'mismatches':errors[:12],'passed':not errors,'comparisons':comparisons,'sequences':sequences,'limits':['Exact supplied row records. Complete polygon raster/frame integration, priority assignment, keyed/shaded/translucent paths and native scene initialization remain open.']}
    (ROOT/'private/verification/span-buffer-native.json').write_text(json.dumps(report,separators=(',',':'))+'\n')
    print(json.dumps({k:report[k] for k in ['comparisonCases','sequencesCount','insertionCases','mismatchCount','mismatches','passed']},indent=2))
    if errors:raise SystemExit(1)
if __name__=='__main__':main()
