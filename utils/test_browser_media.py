"""Small synthetic fixtures for the browser converter; contains no game data."""
import io,struct,sys,wave,zipfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'browser_converter'))
import archive

def record(name,sector,size,flags=0):
    n=33+len(name);out=bytearray(n+(n%2))
    out[0]=len(out);struct.pack_into('<I',out,2,sector);struct.pack_into('<I',out,10,size);out[25]=flags;out[32]=len(name);out[33:33+len(name)]=name
    return out
iso=bytearray(22*2048);iso[16*2048+1:16*2048+6]=b'CD001'
root=record(b'\0',20,2048,2);iso[16*2048+156:16*2048+156+len(root)]=root
file=record(b'DATA.Z;1',21,5);iso[20*2048:20*2048+len(file)]=file;iso[21*2048:21*2048+5]=b'hello'
old=archive.installshield;archive.installshield=lambda content:iter([('DATA/fake',content)])
try:
    for mode,offset in [('MODE2/2352',24),('MODE1/2352',16)]:
        raw=bytearray(24*2352)
        for i in range(22):raw[i*2352+offset:i*2352+offset+2048]=iso[i*2048:(i+1)*2048]
        pcm=[bytes((i+3)%256 for i in range(2352)),bytes((i+7)%256 for i in range(2352))]
        raw[22*2352:]=b''.join(pcm)
        cue=f'FILE "disc.bin" BINARY\n TRACK 01 {mode}\n INDEX 01 00:00:00\n TRACK 02 AUDIO\n INDEX 01 00:00:22\n TRACK 03 AUDIO\n INDEX 01 00:00:23\n'
        packed=io.BytesIO()
        with zipfile.ZipFile(packed,'w',zipfile.ZIP_DEFLATED) as z:z.writestr('folder/disc.cue',cue);z.writestr('folder/disc.bin',raw)
        files=list(archive.read_media(packed.getvalue()));assert files[0]==('DATA/fake',b'hello')
        for i,(name,data) in enumerate(files[1:]):
            assert name==f'AUDIO/track{i+2:02}.wav'
            with wave.open(io.BytesIO(data)) as w:
                assert (w.getnchannels(),w.getsampwidth(),w.getframerate(),w.getnframes())==(2,2,44100,588)
                assert w.readframes(588)==pcm[i]
        for bad in [cue.replace('disc.bin','../disc.bin'),cue.replace('00:00:23','00:00:21'),cue.replace('00:00:22','00:99:00')]:
            try:archive.cue_tracks(bad)
            except ValueError:pass
            else:raise AssertionError('Invalid cue was accepted')
finally:archive.installshield=old
print('Mixed-mode fixtures passed')

# Direct/extensionless ISO and a wrapper ZIP choose by bytes and largest size,
# not a URL suffix or the member's filename.
old=archive.installshield;archive.installshield=lambda content:iter([('DATA/fake',bytes(content))])
try:
    assert list(archive.read_media(bytes(iso)))==[('DATA/fake',b'hello')]
    for filename in ['disc.iso','disc-without-extension','misleading.dat']:
        packed=io.BytesIO()
        with zipfile.ZipFile(packed,'w',zipfile.ZIP_DEFLATED) as z:
            z.writestr('README.txt',b'A smaller companion file')
            z.writestr('tiny.iso',b'Not the image')
            z.writestr('nested/'+filename,iso)
        assert list(archive.read_media(packed.getvalue()))==[('DATA/fake',b'hello')]
    # A demo remains a direct install tree even when TEXTURE.ZB is the largest.
    demo=io.BytesIO()
    with zipfile.ZipFile(demo,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('DDROME/RUN/DDROME.EXE',b'fake executable')
        z.writestr('DDROME/DATA/TEXTURES/TEXTURE.ZB',b'synthetic texture'*100)
    assert [name for name,data in archive.read_media(demo.getvalue())]==['DDROME/RUN/DDROME.EXE','DDROME/DATA/TEXTURES/TEXTURE.ZB']
    # ISO images may carry actual WAV music files in their AUDIO directory.
    out=io.BytesIO()
    with wave.open(out,'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(44100);w.writeframes(b'\x01\x02\x03\x04'*2)
    music=out.getvalue();music_iso=bytearray(25*2048);music_iso[:len(iso)]=iso
    directory=record(b'AUDIO',22,2048,2);at=20*2048+len(file);music_iso[at:at+len(directory)]=directory
    entry=record(b'TRACK02.WAV;1',23,len(music));music_iso[22*2048:22*2048+len(entry)]=entry;music_iso[23*2048:23*2048+len(music)]=music
    result=list(archive.read_media(music_iso));assert result[0]==('DATA/fake',b'hello');assert result[1][0]=='AUDIO/TRACK02.WAV';assert bytes(result[1][1])==music
    nested=bytes(iso)
    for _ in range(5):
        packed=io.BytesIO()
        with zipfile.ZipFile(packed,'w',zipfile.ZIP_DEFLATED) as z:z.writestr('disc',nested)
        nested=packed.getvalue()
    try:list(archive.read_media(nested))
    except ValueError as error:assert 'nested' in str(error)
    else:raise AssertionError('Unbounded ZIP nesting was accepted')
finally:archive.installshield=old
print('Demo, direct/music ISO, extensionless/largest-member ZIP and nesting fixtures passed')
