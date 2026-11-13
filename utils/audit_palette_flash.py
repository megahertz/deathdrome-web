"""Compare real palette flash scheduler/callback and DirectDraw upload bytes.

The action-queue insertion/removal and DirectDraw methods are observation
stubs. Native 440294/44023c/440198 and 4478d0 execute on a synthetic palette.
"""
import hashlib,json,subprocess
from native_palette import PaletteNative
from native_ai_audit import ROOT,EXE

def main():
 n=PaletteNative();n.cpu.mem_write(0x44b628,b'\xc3')
 source=bytes(byte for i in range(256) for byte in [i,255-i,(i*37)%256,0]);fixtures=[];native=[]
 steps=[{'trigger':True},{'render':True},{'trigger':True},{'render':True},{'render':True},{'trigger':True},{'trigger':True},{'render':True},{'render':True},{'render':True}]
 for level in range(10):
  n.write(0x48f8bc,'B',level);n.write(0x48f784,'I',1);n.write(0x51a760,'I',0);n.cpu.mem_write(0x51a360,source)
  n.uploads=[];trace=[]
  for step in steps:
   before=len(n.uploads)
   if step.get('trigger'):n.call(0x440294,eax=2)
   else:n.call(0x44023c,eax=0)
   upload=n.uploads[-1]['bytes'] if len(n.uploads)>before else None
   trace.append({'active':not bool(n.read(0x48f784,'I')[0]),'remaining':n.read(0x51a760,'I')[0],'upload':list(upload) if upload is not None else None})
  fixtures.append({'level':level,'steps':steps});native.append(trace)
 js=r"""import {PaletteFlash,flashedPaletteColor} from './src/palette-flash.js';import {paletteBrightness} from './src/palette-brightness.js';let input='';for await(const c of process.stdin)input+=c;console.log(JSON.stringify(JSON.parse(input).map(f=>{const flash=new PaletteFlash();return f.steps.map(step=>{let upload=null;if(step.trigger)flash.trigger();else{const amount=flash.frame();upload=Array.from({length:256},(_,i)=>paletteBrightness(flashedPaletteColor([i,255-i,(i*37)%256,0],amount),f.level)).flat()}return {active:flash.active,remaining:flash.remaining,upload}})})));"""
 rebuild=json.loads(subprocess.check_output(['node','--input-type=module','-e',js],cwd=ROOT,input=json.dumps(fixtures).encode()))
 mismatches=[dict(fixture=i,step=j) for i,(a,b) in enumerate(zip(native,rebuild)) for j,(x,y) in enumerate(zip(a,b)) if x!=y]
 report=dict(scope=__doc__,executableSha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),sequences=len(fixtures),callbacks=sum('render' in s for f in fixtures for s in f['steps']),uploadedBytesCompared=sum(len(s['upload'])for a in native for s in a if s['upload'] is not None),fixtures=fixtures,native=native,mismatches=mismatches,passed=not mismatches,limits=['Original action-queue scheduling and rendered/DOM output are not executed; callback times are supplied.','Synthetic palette covers every channel byte and all brightness levels. Scene rasterization, UI layering, browser SVG quantization and physical-phone presentation remain unverified.'])
 (ROOT/'private/verification/palette-flash-native.json').write_text(json.dumps(report,separators=(',',':'))+'\n');print(json.dumps({k:report[k]for k in ['sequences','callbacks','uploadedBytesCompared','mismatches','passed']},indent=2))
 if mismatches:raise SystemExit(1)
if __name__=='__main__':main()
