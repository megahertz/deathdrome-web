"""Compare browser CD import with the preserved original BIN/CUE, without ffmpeg."""
from pathlib import Path
import hashlib,io,json,re,sys,wave
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'utils/browser_converter'))
from archive import read_media
from cd_source import pcm_tracks
raw=(ROOT/'private/disc/Death-Drome_Win_EN.zip').read_bytes()
original={str(p.relative_to(ROOT/'private/original/game')).lower():p for p in (ROOT/'private/original/game').rglob('*') if p.is_file()}
matched=0;music=[];original_tracks=iter(pcm_tracks())
for name,data in read_media(raw):
    key=name.lower()
    if key in original:
        assert data==original[key].read_bytes(),name;matched+=1
    m=re.fullmatch(r'AUDIO/track(\d+)\.wav',name)
    if not m:continue
    number=int(m[1]);expected_number,start,stop,expected=next(original_tracks);assert number==expected_number
    with wave.open(io.BytesIO(data)) as w:
        assert (w.getnchannels(),w.getsampwidth(),w.getframerate())==(2,2,44100)
        assert w.getnframes()==(stop-start)*588
        samples=w.readframes(w.getnframes())
    assert samples==expected,number
    music.append({'track':number,'samplesPerChannel':len(samples)//4,'pcmSha256':hashlib.sha256(samples).hexdigest()})
assert list(original_tracks)==[]
assert len(music)==12 and matched>=350
report={'passed':True,'sourceSha256':hashlib.sha256(raw).hexdigest(),'sourceFilesByteIdentical':matched,'musicTracks':music,'defaultPath':'/private/disc/Death-Drome_Win_EN.zip','staticDefaultPath':'assets/cd.iso','defaultContainer':'Original full-CD ZIP containing BIN and CUE, detected by content','rawBINWithoutCueSupported':False}
(ROOT/'private/verification/cd-music-import.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
