"""Compare recorded static menus; this does not score gameplay equivalence.

Browser screenshots are JPEG and the rebuild's CSS viewport may be scaled.
Normalize to the original 320x200 raster before reporting RGB error.
"""
from pathlib import Path
import json
from PIL import Image, ImageChops, ImageStat, ImageEnhance, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
CAPTURES = ROOT / 'private/verification/captures'
results = []
for screen in ['game-type', 'game-options']:
    reference = Image.open(CAPTURES / f'original-{screen}.jpg').convert('RGB')
    if sum(ImageStat.Stat(reference).stddev)<15:
        results.append({'screen':screen,'status':'rejected','reason':'Original capture is blank or a transition; recapture required.'})
        continue
    rebuild = Image.open(CAPTURES / f'rebuild-{screen}.jpg').convert('RGB')
    reference = reference.resize((320, 200), Image.Resampling.NEAREST)
    rebuild = rebuild.resize((320, 200), Image.Resampling.NEAREST)
    difference = ImageChops.difference(reference, rebuild)
    mean = sum(ImageStat.Stat(difference).mean) / 3
    results.append({'screen': screen, 'meanAbsoluteRGBError0to255': round(mean, 3),
                    'limitations': 'JPEG captures, CSS scaling, focus highlight; static menu only. Not a similarity percentage.'})
    board = Image.new('RGB', (960, 222), '#151a20')
    draw = ImageDraw.Draw(board)
    for x, label, picture in [(0, 'Original', reference), (320, 'Rebuild', rebuild),
                               (640, 'Difference (4x amplified)', ImageEnhance.Brightness(difference).enhance(4))]:
        draw.text((x + 8, 5), label, fill='white')
        board.paste(picture, (x, 22))
    board.resize((1920, 444), Image.Resampling.NEAREST).save(CAPTURES / f'comparison-{screen}.png')
(ROOT / 'private/verification/menu-comparison.json').write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps(results, indent=2))
