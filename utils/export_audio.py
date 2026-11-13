from pathlib import Path
import re,subprocess,json
ROOT=Path(__file__).resolve().parents[1];out=ROOT/'private/assets/audio';out.mkdir(exist_ok=True)
for p in (ROOT/'private/original/game/DATA/SOUNDS').glob('*.WAV'):
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(p),str(out/(p.stem.lower()+'.wav'))],check=True)
from cd_source import pcm_tracks
manifest=[]
for number,start,stop,raw in pcm_tracks():
 target=out/f'track{number:02}.ogg'
 subprocess.run(['ffmpeg','-v','error','-y','-f','s16le','-ar','44100','-ac','2','-i','pipe:0','-c:a','libvorbis','-q:a','4',str(target)],input=raw,check=True)
 manifest.append({'track':number,'sector':start,'end':stop,'seconds':(stop-start)/75,'file':target.name})
(out/'cd-tracks.json').write_text(json.dumps(manifest,indent=2));print('Audio exported')
