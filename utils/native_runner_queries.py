"""Original loaded runner geometry with RUNNER_X.GW's chassis BBOX flag.

Root/yaw/chassis/cockpit pose assignments are supplied. Native import, bounds
updates, World insertion and ray queries run. Other runner effects and the
complete Domain controller are outside this geometry reference.
"""
from native_gamegen_loader import GameGenLoader

class RunnerQueries(GameGenLoader):
    def __init__(self,name):
        super().__init__();self.configure_world();self.root=self.load(name+'.gam');nodes=self.graph(self.root);self.named={v['name']:a for a,v in nodes.items()}
        label=self.reserve(32);self.cpu.mem_write(label,b'runner_0\0');self.call(0x44b570,eax=self.root,edx=label)
        self.call(0x44b66c,eax=self.root,edx=0);self.call(0x44b684,eax=self.named['chassis'],edx=1);self.call(0x444f70,eax=self.world,edx=self.root);self.update()
    def pose(self,yaw=0,pitch=0,roll=0,cockpit=0):
        self.call(0x45a6bc,[100,0,100],eax=self.root);self.call(0x45a54c,[0,yaw,0],eax=self.named['yaw']);self.call(0x45a54c,[pitch,0,roll],eax=self.named['chassis']);self.call(0x45a54c,[0,0,cockpit],eax=self.named['cockpit']);self.update()
        return [list(self.read(self.named['chassis']+0xf4+i*12,'3f')) for i in range(2)]
