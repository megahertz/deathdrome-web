"""Execute original palette upload, stubbing only DirectDraw COM methods."""
from pathlib import Path
import hashlib,json,struct,subprocess
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_ESP,UC_X86_REG_EAX
from native_gamegen_loader import GameGenLoader
from native_ai_audit import ROOT,EXE,RUNNER
from native_palette import PaletteNative
n=PaletteNative();default=n.read(0x48f8bc,'B')[0]
synthetic=bytes(v for i in range(256) for v in [i,255-i,(37*i)%256,(13*i)%256])
fixtures=[];native=[];checks=[]
for source,data in [('all-byte-values',synthetic)]+[(name,b''.join(raw[i:i+3]+b'\0' for i in range(0,768,3))) for name,raw in [(p.name,p.read_bytes()) for p in [ROOT/'private/original/game/RUN/domain.act',ROOT/'private/original/game/RUN/ddi.ACT',ROOT/'private/original/game/RUN/runner.act']]]:
    palette_results=[]
    for level in range(10):
        actual=n.palette(data,level);offset=8*(level-4)
        expected=bytes(data[i] if i%4==3 else min(255,max(0,data[i]+offset)) for i in range(1024))
        assert actual==expected,(source,level)
        palette_results.append(hashlib.sha256(actual).hexdigest())
        if source=='all-byte-values':
            for i in range(256):fixtures.append({'level':level,'color':list(data[i*4:i*4+3])});native.append(list(actual[i*4:i*4+3]))
    checks.append({'source':source,'sha256':hashlib.sha256(data).hexdigest(),'outputHashes':palette_results})
report={'scope':__doc__,'nativeFunction':'0x4478d0','executableSha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'initialBrightness':default,'levels':10,'paletteUploads':40,'rgbChannelsCompared':40*256*3,'reservedBytesCompared':40*256,'sourceBackupPreserved':True,'fixtures':fixtures,'native':native,'palettes':checks,'passed':True,'limits':['The original upload arithmetic executes; DirectDraw surface/color-key and SetEntries calls are inert capture stubs.','This does not audit per-face lighting, pixel rasterization, display gamma, fades, shadows or the entire original settings lifecycle.']}
(ROOT/'private/verification/palette-brightness-native.json').write_text(json.dumps(report,separators=(',',':'))+'\n')
print(json.dumps({k:report[k] for k in ['initialBrightness','paletteUploads','rgbChannelsCompared','reservedBytesCompared','sourceBackupPreserved','passed']},indent=2))
