"""Original attack-action fixture, with supplied contacts and counted dispatch.

The attack action and inventory cycle execute; geometry queries and launch
side effects are supplied. Used by firing and consecutive lock-timing audits.
"""
import struct
from unicorn import UC_HOOK_CODE
from native_ai_audit import Native,ROOT,RUNNER,f32
TARGET=RUNNER+0x6000

def aggression_rows():
    rows=[]
    for line in (ROOT/'private/original/game/RUN/ag_lev.txt').read_text().splitlines():
        text=line.split('#',1)[0].strip()
        if text and not text.startswith('\x1a'):rows.append([f32(float(x)) for x in text.split()])
    assert len(rows)==5 and all(len(row)==8 for row in rows)
    return rows

class AttackNative(Native):
    def __init__(self,level=0,weapon=1,selected=None,target=(100,50)):
        super().__init__();self.shots=[]
        for i,row in enumerate(aggression_rows()):self.write(0x48f020+i*32,'8f',*row)
        for address in [0x431d88,0x4156d0,0x43753c]:self.cpu.mem_write(address,b'\xc3')
        self.cpu.mem_write(0x434ad4,b'\xb8'+struct.pack('<I',RUNNER)+b'\xc3')
        self.cpu.hook_add(UC_HOOK_CODE,self.capture_fire,begin=0x43753c,end=0x43753c)
        selected=int(weapon!=4) if selected is None else selected;self.cells=[4,weapon,0,0];self.count=2 if weapon!=4 else 1
        self.write(RUNNER,'I',1);self.write(RUNNER+0x2c,'3f',100,0,100);self.write(RUNNER+0x80,'6f',0,0,-1,0,0,-1);self.write(RUNNER+0xfc,'2f',185,80)
        self.write(RUNNER+0x180,'f',-100);self.write(RUNNER+0x1ea,'B',1);self.write(RUNNER+0x1f4,'f',1000);self.write(RUNNER+0x1f8,'3f',0,0,-1);self.write(RUNNER+0x224,'f',0);self.write(RUNNER+0x234,'I',TARGET);self.write(RUNNER+0x244,'B',1)
        self.write(RUNNER+0x498,'4I',*self.cells);self.write(RUNNER+0x4a8,'2I',selected,self.count)
        self.write(TARGET+0x15e,'B',1);self.write(TARGET+0x2c,'3f',target[0],0,target[1]);self.write(TARGET+0x198,'f',-30)
        self.write(0x48f018,'I',level);self.write(0x48f00c,'I',1)
    def capture_fire(self,cpu,address,size,data):
        selected=self.read(RUNNER+0x4a8,'I')[0];self.shots.append(self.read(RUNNER+0x498+selected*4,'I')[0])
    def step(self,clock=7,lock=None,contactClear=True,probeClear=True,enabled=True):
        self.shots=[];self.write(0x518aa4,'2f',clock,f32(1/60));self.write(0x48f00c,'I',int(enabled));self.write(RUNNER+0x244,'B',int(contactClear));self.visibility(probeClear)
        self.write(RUNNER+0x6f8,'I',TARGET if lock is not None else 0)
        self.call(0x42befc,eax=RUNNER)
        return {'shots':self.shots,'selected':self.read(RUNNER+0x4a8,'I')[0],'shotAt':self.read(RUNNER+0x224,'f')[0],'lockActive':bool(self.read(RUNNER+0x6fc,'B')[0]),'lockTarget':0 if self.read(RUNNER+0x6f8,'I')[0] else None}
