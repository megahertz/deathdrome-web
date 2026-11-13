"""Execute original palette upload, stubbing only DirectDraw COM methods."""
from pathlib import Path
import hashlib,json,struct,subprocess
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_ESP,UC_X86_REG_EAX
from native_gamegen_loader import GameGenLoader
from native_ai_audit import ROOT,EXE,RUNNER
class PaletteNative(GameGenLoader):
    def __init__(self):
        super().__init__();self.uploads=[]
        surface,surface_vtable,palette,palette_vtable,restore,upload=[RUNNER+x for x in [0x1000,0x1100,0x1200,0x1300,0x1400,0x1500]]
        self.write(0x48f8a0,'B',1);self.write(0x48f8cc,'I',surface);self.write(surface,'I',surface_vtable);self.write(surface_vtable+0x58,'I',restore)
        self.cpu.mem_write(restore,b'\x31\xc0\xc2\x0c\x00')
        self.write(0x48f8d8,'I',palette);self.write(palette,'I',palette_vtable);self.write(palette_vtable+0x18,'I',upload)
        self.cpu.mem_write(upload,b'\x31\xc0\xc2\x14\x00')
        self.cpu.hook_add(UC_HOOK_CODE,self.capture,begin=upload,end=upload)
    def capture(self,cpu,address,size,data):
        args=self.read(cpu.reg_read(UC_X86_REG_ESP)+4,'5I');self.uploads.append({'start':args[2],'count':args[3],'bytes':bytes(cpu.mem_read(args[4],args[3]*4))})
    def palette(self,data,level):
        self.uploads=[];self.cpu.mem_write(RUNNER,data);self.write(0x48f8bc,'B',level)
        result=self.call(0x4478d0,eax=RUNNER)
        assert result==0 and len(self.uploads)==1 and self.uploads[0]['count']==256,(hex(result),[(u['start'],u['count']) for u in self.uploads])
        assert bytes(self.cpu.mem_read(0x48f8e8,1024))==data,'Source palette must remain unmodified'
        return self.uploads[0]['bytes']
