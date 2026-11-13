"""Compare saved production UI captures with the supplied gameplay recording.

Video compression/scaling prevents exact RGB equality. Errors below are pixel
errors in a static presentation fixture, never a gameplay similarity score.
"""
import json,subprocess
from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'private/verification/video'
js="""import {hudCommands} from './src/hud.js';const sim={player:6,arena:1,round:1,score:0,lives:3,time:296.2,requiredKills:2,runners:Array.from({length:8},(_,id)=>({id,health:id===6?98:100,kills:0,weapons:[null],selectedWeapon:0,inactive:id>3&&id!==6}))};console.log(JSON.stringify(hudCommands(sim,6)));"""
commands=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.js','--input-type=module','-e',js],cwd=ROOT))
mask=Image.new('L',(640,400));glyphs='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,-_!?<>/"=| *'
for c in commands:
 if c['kind']=='image':
  im=Image.open(ROOT/'private/assets/hud/big'/f"{c['name']}.png").convert('RGBA');alpha=im.getchannel('A');mask.paste(alpha,(c['x']*2,c['y']*2),alpha)
 elif c['kind']=='rect':
  ImageDraw.Draw(mask).rectangle((c['x']*2,c['y']*2,(c['x']+c['width'])*2-1,(c['y']+c['height'])*2-1),fill=255)
 else:
  font=Image.open(ROOT/'private/assets/fonts/10x_gren.png').convert('RGBA');x=c['x']*2
  for letter in c['value'].upper().replace(':','*'):
   if letter in glyphs:
    i=glyphs.index(letter);alpha=font.crop((0,i*10,10,i*10+10)).getchannel('A');mask.paste(alpha,(x,c['y']*2),alpha)
   x+=6 if letter in 'I1.,!' else 10
mask=np.asarray(mask)>250
warningMask=Image.fromarray(mask.astype('uint8')*255)
ImageDraw.Draw(warningMask).rectangle((288,364,353,377),fill=255)
for text,y,color in [('NEXUS DIED',49,'pink'),("YOU'VE BEEN LOCKED ON",60,'red')]:
 font=Image.open(ROOT/f'private/assets/fonts/10x_{color}.png').convert('RGBA');x=2*(160-len(text)*10//4)
 for letter in text:
  if letter in glyphs:
   i=glyphs.index(letter);alpha=font.crop((0,i*10,10,i*10+10)).getchannel('A');warningMask.paste(alpha,(x,y*2),alpha)
  x+=6 if letter in 'I1.,!' else 10
warningMask=np.asarray(warningMask)>250
warningMask[36:56,520:625]=False # source capture's empty/blinking kills panel
reports=[]
for name,source,capture,m in [('hud','hud-00-01-50.png','rebuild-hud.png',mask),('warning','messages-00-03-15.png','rebuild-warning.png',warningMask),('results','results-00-04-39.png','rebuild-results.png',np.ones((400,640),bool))]:
 reference=Image.open(OUT/source).convert('RGB').resize((640,400),Image.Resampling.BILINEAR);rebuild=Image.open(OUT/capture).convert('RGB');a=np.asarray(reference,dtype=float);b=np.asarray(rebuild,dtype=float)
 # A single translation compensates the recording's frame origin. It never
 # moves or warps individual labels, and never changes production coordinates.
 best=(1e9,0,0)
 for dx in range(-16,17):
  for dy in range(-3,4):
   y0=max(0,dy);y1=min(400,400+dy);x0=max(0,dx);x1=min(640,640+dx);valid=m[y0:y1,x0:x1].copy()
   if name=='results':valid[max(0,250-y0):max(0,275-y0),max(0,440-x0):max(0,500-x0)]=False # captured blink phase
   error=np.abs(a[y0-dy:y1-dy,x0-dx:x1-dx]-b[y0:y1,x0:x1])[valid].mean()
   if error<best[0]:best=(float(error),dx,dy)
 error,dx,dy=best;aligned=Image.new('RGB',(640,400));aligned.paste(reference,(dx,dy));masked=Image.fromarray((np.asarray(aligned)*m[:,:,None]).astype('uint8'))
 board=Image.new('RGB',(1280,438),'#111a20');board.paste(masked,(0,38));board.paste(rebuild,(640,38));draw=ImageDraw.Draw(board);draw.text((12,12),f'VIDEO: {name.upper()} (one frame-origin translation)',fill='white');draw.text((652,12),'REBUILD: SHARED PRODUCTION RENDERER',fill='white');board.save(OUT/f'{name}-comparison.png')
 reports.append({'screen':name,'source':source,'capture':capture,'frameTranslationPixels640x400':[dx,dy],'meanAbsoluteRGBError0to255':error,'comparedPixels':int(m.sum()),'limitations':'Static UI fixture, compressed/rescaled video. HUD masks original opaque sprite/glyph pixels; excludes 3D scene. Warning excludes the empty/blinking kills panel; results excludes blinking credit numeral. Supplied actor values do not validate gameplay state generation. Not a fidelity percentage.'})
(OUT/'comparison.json').write_text(json.dumps({'comparisons':reports},indent=2)+'\n');print(json.dumps(reports))
