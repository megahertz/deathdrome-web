"""Screenshot comparison and scoped lateral-width measurement, not a raster audit."""
from collections import deque
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
VIDEO=ROOT/'private/verification/video'


def visible_floor(image):
    rgb=np.array(image.convert('RGB'),dtype=float)
    r,g,b=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
    mask=(b>r*1.8)&(g>r*1.5)&(b>18)&(g>10)
    # Native menu viewport; lower rows isolate the blue floor from the body.
    mask[:83]=False;mask[112:]=False;mask[:,:70]=False;mask[:,250:]=False
    points=[]
    for y,x in zip(*np.where(mask)):
        if not mask[y,x]:continue
        queue=deque([(y,x)]);mask[y,x]=False;component=[]
        while queue:
            yy,xx=queue.popleft();component.append((int(xx),int(yy)))
            for dy,dx in [(0,1),(1,0),(0,-1),(-1,0)]:
                y2,x2=yy+dy,xx+dx
                if 0<=y2<200 and 0<=x2<320 and mask[y2,x2]:
                    mask[y2,x2]=False;queue.append((y2,x2))
        # Keep both sides of the floor when the vehicle/shadow separates them.
        if len(component)>30:points.extend(component)
    left,right=min(x for x,y in points),max(x for x,y in points)
    return {'minX':left,'maxX':right,'width':right-left+1,'visiblePixels':len(points)}


original=Image.open(VIDEO/'original-light-menu-63.png').resize((320,200))
preview=Image.open(VIDEO/'user-preview-centred-light.png').crop((178,70,1072,630)).resize((320,200))
panels=[('ORIGINAL VIDEO 1:47 (different pose)',Image.open(VIDEO/'original-light-play-107.png').resize((640,400))),
    ('BEFORE: radius 9',Image.open(VIDEO/'light-radius-before.png').crop((24,124,656,518)).resize((640,400))),
    ('AFTER: radius 5.31',Image.open(VIDEO/'light-radius-after.png').crop((24,124,656,518)).resize((640,400)))]
sheet=Image.new('RGB',(1920,434),(17,22,27));draw=ImageDraw.Draw(sheet)
for i,(label,im) in enumerate(panels):
    sheet.paste(im,(i*640,34));draw.text((i*640+12,10),label,fill='white')
sheet.save(VIDEO/'light-radius-comparison.png')
geometry=json.loads((ROOT/'private/assets/models/pnkrunr.json').read_text())
vertices=[v for face in geometry['meshes'] if '/lcl_lt/' in face['name'].lower() for v in face['v']]
span=max(v[0] for v in vertices)-min(v[0] for v in vertices)
report={'scope':__doc__,'gameplay':{'sourceContourLateralSpan':span,'oldRadius':9,'newRadius':span/2,
    'diameterReductionPercent':100*(1-span/18),'comparison':'private/verification/video/light-radius-comparison.png',
    'browser':'private/verification/light-radius-browser.json'},
    'menu':{'originalVideo63Seconds':visible_floor(original),'previousRebuildCapture':visible_floor(preview),
        'decision':'Keep the current menu radius; the visible lateral spans are close.'},
    'limits':['The native lcl_lt contour is elongated and offset; matching its lateral width alone does not establish the complete original illumination footprint.',
        'The original gameplay panel has a different pose/camera. Only rebuild before/after share an identical pose/camera; no pixel similarity percentage is inferred.',
        'Menu segmentation measures visible blue-floor extent across a clipped viewport and compressed video; vehicle occlusion, angle and image scaling limit precision.',
        'All-image original raster, lighting, texture-world registration and multiplicative intensity remain unproved.']}
(ROOT/'private/verification/runner-light-size.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
