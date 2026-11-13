"""Original AI targeting through real loaded runner chassis geometry.

Original model loading, posed bounds, World ray traversal, candidate scanning
and runner-ancestor checks run without geometry/visibility stubs. The scene
contains one target; the caller's visual model is absent and its own surface
setter points to a valid empty node. Actor positions and poses are supplied.
Complete arenas, moving actors and frame scheduling remain separate work.
"""
import json,subprocess,hashlib,math
from native_runner_queries import RunnerQueries
from native_ai_audit import ROOT,EXE,f32
from audit_runner_queries import NAMES

class TargetScene(RunnerQueries):
    def __init__(self,name):
        super().__init__(name);self.actor=self.reserve(0x800);self.target=self.reserve(0x800);self.empty=self.call(0x44b2bc);self.result=self.reserve(4)
        label=self.reserve(32);self.cpu.mem_write(label,b'runner_1\0');self.call(0x44b570,eax=self.root,edx=label)
        self.write(self.empty+0x4c,'I',self.actor);self.write(self.root+0x4c,'I',self.target);self.write(0x48f104,'8I',self.empty,self.root,0,0,0,0,0,0)
        self.write(self.actor+0xc,'I',self.empty);self.write(self.actor+0x15e,'B',1);self.write(self.target+0x15e,'B',1);self.write(self.target+0x2c,'3f',100,0,100);self.write(0x518aa0,'I',self.world)
    def acquire(self,position,radius):
        self.write(self.actor+0x2c,'3f',*position)
        ok=self.call(0x42c9bc,[radius],eax=self.actor,edx=self.result)&255
        result=self.read(self.result,'I')[0]
        if ok and result!=self.target:raise AssertionError('Unexpected target pointer')
        return 1 if ok else None

def main():
    fixtures=[]
    for name in NAMES:
        n=TargetScene(name)
        for case in range(15):
            yaw=[0,30,90,180,270][case%5];pitch=[0,7.5,-7.5][case%3];roll=[0,5,-5][case%3];turn=[0,200,-200][case%3];n.pose(yaw,pitch,roll,f32(f32(turn)*f32(.12)))
            for j in range(12):
                angle=j*math.tau/12;distance=[15,25,31.623,60][j%4];height=[0,3,5,5.000001][j%4]
                position=list(map(f32,[100+math.cos(angle)*distance,height,100+math.sin(angle)*distance]));radius=[1000,10000][j%2]
                fixtures.append({'name':name,'pose':{'yaw':yaw,'pitch':pitch,'roll':roll,'turn':turn},'position':position,'radiusSquared':radius,'nativeTarget':n.acquire(position,radius)})
        print(name,'complete',flush=True)
    js="""import fs from 'node:fs';import {makeRunnerModel,View,THREE} from './src/renderer.js';import {acquireAITarget} from './src/ai-actions.js';let input='';for await(const c of process.stdin)input+=c;const entries=new Map();console.log(JSON.stringify(JSON.parse(input).map(f=>{let model=entries.get(f.name);if(!model){const data=JSON.parse(fs.readFileSync('private/assets/models/'+f.name+'.json'));data.meshes=data.meshes.map(p=>({...p,texture:null,cycle:undefined}));model=makeRunnerModel(data);entries.set(f.name,model)}const p=f.pose,r={id:0,x:f.position[0],y:f.position[1],z:f.position[2],dead:0},target={id:1,x:100,y:0,z:100,yaw:p.yaw*Math.PI/180,chassisPitchDegrees:p.pitch,chassisRollDegrees:p.roll,turn:p.turn*Math.PI/180,health:100,dead:0,actionMode:1},runners=[r,target],view={arenaGroup:new THREE.Group()},sim={runners,sceneContacts:(a,b,r)=>View.prototype.lineContacts.call(view,a,b,{runners,models:[null,model],ignore:r.id})};return acquireAITarget(sim,r,f)?.id??null})));"""
    actual=json.loads(subprocess.run(['node','--import','./utils/tests/setup.js','--input-type=module','-e',js],cwd=ROOT,input=json.dumps(fixtures),capture_output=True,text=True,check=True).stdout)
    errors=[{'case':i,'fixture':f,'actual':got} for i,(f,got) in enumerate(zip(fixtures,actual)) if f['nativeTarget']!=got]
    report={'scope':__doc__,'executableSha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'cases':len(fixtures),'originalAccepted':sum(f['nativeTarget'] is not None for f in fixtures),'mismatchCount':len(errors),'mismatches':errors[:10],'passed':not errors,'fixtures':fixtures}
    (ROOT/'private/verification/ai-targeting-scene-native.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['cases','originalAccepted','mismatchCount','mismatches','passed']},indent=2))
    if errors:raise SystemExit(1)
if __name__=='__main__':main()
