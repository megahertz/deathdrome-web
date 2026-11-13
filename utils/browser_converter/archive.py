"""Browser-safe ZIP / ISO9660 / InstallShield v3 reader. No executable is run.

DCL decoder is an altered Python translation of blast 1.3 by Mark Adler
(C) 2003, 2012, 2013. See public/resource-code/BLAST-LICENSE.txt.
InstallShield directory layout follows unshieldv3 by Wolfgang Frisch (2019),
Apache-2.0; see public/resource-code/UNSHIELD-LICENSE.txt.
"""
import io, struct, zipfile, re, wave
from pathlib import PurePosixPath
MAX_OUTPUT = 256 * 1024 * 1024
MAX_IMAGE = 1024 * 1024 * 1024

def safe_name(name):
    name = name.replace('\\', '/').rstrip('/')
    p = PurePosixPath(name)
    if not name or p.is_absolute() or '..' in p.parts or ':' in name:
        raise ValueError('Unsafe archive path')
    return str(p)

def table(runs):
    lengths = [length for v in runs for length in [v & 15] * ((v >> 4) + 1)]
    counts = [lengths.count(n) for n in range(14)]
    symbols = [i for n in range(1, 14) for i, v in enumerate(lengths) if v == n]
    return counts, symbols
LIT = table([11,124,8,7,28,7,188,13,76,4,10,8,12,10,12,10,8,23,8,9,7,6,7,8,7,6,55,8,23,24,12,11,7,9,11,12,6,7,22,5,7,24,6,11,9,6,7,22,7,11,38,7,9,8,25,11,8,11,9,12,8,12,5,38,5,38,5,11,7,5,6,21,6,10,53,8,7,24,10,27,44,253,253,253,252,252,252,13,12,45,12,45,12,61,12,45,44,173])
LEN = table([2,35,36,53,38,23]); DIST = table([2,20,53,230,247,151,248])
BASE = [3,2,4,5,6,7,8,9,10,12,16,24,40,72,136,264]
EXTRA = [0,0,0,0,0,0,0,0,1,2,3,4,5,6,7,8]
def blast(data, expected, progress=None):
    pos = buf = count = 0
    next_report = 65536
    def bits(n):
        nonlocal pos, buf, count
        while count < n:
            if pos >= len(data): raise ValueError('Truncated DCL stream')
            buf |= data[pos] << count; pos += 1; count += 8
        value = buf & ((1 << n) - 1); buf >>= n; count -= n
        return value
    def decode(h):
        code = first = index = 0
        counts, symbols = h
        for length in range(1,14):
            code |= bits(1) ^ 1
            n = counts[length]
            if code < first + n: return symbols[index + code - first]
            index += n; first = (first + n) << 1; code <<= 1
        raise ValueError('Invalid DCL code')
    literal, dictionary = bits(8), bits(8)
    if literal > 1 or dictionary not in (4,5,6): raise ValueError('Invalid DCL header')
    out = bytearray()
    while True:
        if bits(1):
            symbol = decode(LEN); length = BASE[symbol] + bits(EXTRA[symbol])
            if length == 519: break
            n = 2 if length == 2 else dictionary
            distance = (decode(DIST) << n) + bits(n) + 1
            if distance > len(out): raise ValueError('Invalid DCL distance')
            if len(out) + length > expected: raise ValueError('DCL output exceeds declared size')
            for _ in range(length): out.append(out[-distance])
        else:
            if len(out) >= expected: raise ValueError('DCL output exceeds declared size')
            out.append(decode(LIT) if literal else bits(8))
        if progress and len(out) >= next_report:
            progress(len(out)); next_report = len(out) + 65536
    if len(out) != expected: raise ValueError('DCL size mismatch')
    if progress: progress(expected)
    return bytes(out)

def installshield(data, progress=None):
    if struct.unpack_from('<II',data) != (0x8c655d13,0x02013a): raise ValueError('Not InstallShield v3')
    toc = struct.unpack_from('<I',data,41)[0]; dirs = struct.unpack_from('<H',data,49)[0]
    p = toc; directories = []
    for _ in range(dirs):
        files, size, n = struct.unpack_from('<HHH',data,p)
        name = data[p+6:p+6+n].decode('cp437'); directories.append((name,files)); p += size
    total = 0; entries = []
    for directory, files in directories:
        for _ in range(files):
            unpacked, packed, offset = struct.unpack_from('<III',data,p+3)
            size = struct.unpack_from('<H',data,p+23)[0]
            attr, split, _, volume, n = data[p+25:p+30]
            name = data[p+30:p+30+n].decode('cp437'); p += size
            if split: raise ValueError('Split InstallShield files are unsupported')
            total += unpacked
            if total > MAX_OUTPUT or offset+packed > len(data): raise ValueError('Invalid archive sizes')
            entries.append((safe_name(directory+'/'+name if directory else name),offset,packed,unpacked,attr))
    completed = 0
    if progress: progress(0)
    for name,offset,packed,unpacked,attr in entries:
        content = data[offset:offset+packed]
        notify = (lambda done:progress((completed+done)/max(1,total))) if progress else None
        content = content if attr & 16 else blast(content,unpacked,notify)
        if len(content) != unpacked: raise ValueError('Archive file size mismatch')
        completed += unpacked
        yield name,content
        if progress: progress(completed/max(1,total))

def iso_files(data):
    block = 2048
    if data[16*block+1:16*block+6] != b'CD001': raise ValueError('Expected an ISO9660 image')
    def record(p):
        size = data[p]; extent = struct.unpack_from('<I',data,p+2)[0]; length = struct.unpack_from('<I',data,p+10)[0]
        flags = data[p+25]; n = data[p+32]; name = data[p+33:p+33+n]
        return size, extent, length, flags, name
    root = record(16*block+156); pending=[('',root[1],root[2])]; seen=set()
    while pending:
        prefix, extent, length = pending.pop()
        if extent in seen: continue
        seen.add(extent); p = extent*block; end=p+length
        if end > len(data): raise ValueError('Truncated ISO directory')
        while p < end:
            if not data[p]: p = ((p//block)+1)*block; continue
            size, start, count, flags, raw = record(p); p += size
            if raw in (b'\0',b'\1'): continue
            name = safe_name(prefix+raw.decode('ascii').split(';')[0])
            if flags & 2: pending.append((name+'/',start,count))
            else:
                if start*block+count > len(data): raise ValueError('Truncated ISO file')
                yield name, memoryview(data)[start*block:start*block+count]

def cue_tracks(text):
    files = re.findall(r'^\s*FILE\s+"([^"\n]+)"\s+BINARY\s*$',text,re.I|re.M)
    if len(files)!=1: raise ValueError('Expected a single BIN file in the CD cue sheet')
    tracks=[]; current=None
    for line in text.splitlines():
        match=re.match(r'\s*TRACK\s+(\d+)\s+(\S+)',line,re.I)
        if match:
            current={'number':int(match[1]),'mode':match[2].upper()};tracks.append(current)
        match=re.match(r'\s*INDEX\s+01\s+(\d+):(\d+):(\d+)',line,re.I)
        if match and current is not None:
            m,sec,frame=map(int,match.groups())
            if sec>=60 or frame>=75:raise ValueError('Invalid CD track time')
            current['sector']=(m*60+sec)*75+frame
    if len(tracks)<2 or tracks[0].get('sector')!=0 or tracks[0]['mode'] not in ('MODE1/2352','MODE2/2352'):
        raise ValueError('Expected a mixed-mode data and audio CD')
    if any(t.get('sector',-1)<0 or t['number']!=i+1 or (i and (t['mode']!='AUDIO' or t['sector']<=tracks[i-1]['sector'])) for i,t in enumerate(tracks)):
        raise ValueError('Invalid CD track sequence')
    return safe_name(files[0]),tracks

def read_exact(stream,count):
    data=stream.read(count)
    if len(data)!=count:raise ValueError('Truncated CD image')
    return data

def mixed_cd(archive,cue,image=None,progress=None):
    if cue.file_size>65536:raise ValueError('CD cue sheet is too large')
    filename,tracks=cue_tracks(archive.read(cue).decode('utf-8-sig'))
    folder=str(PurePosixPath(cue.filename).parent)
    path=safe_name((folder+'/' if folder!='.' else '')+filename)
    entries={safe_name(e.filename).lower():e for e in archive.infolist() if not e.is_dir()}
    entry=entries.get(path.lower())
    if entry is None:raise ValueError('The BIN named in the cue sheet is missing')
    if image is not None and entry.header_offset!=image.header_offset:raise ValueError('The cue sheet must describe the largest file in the ZIP')
    if entry.file_size>1024*1024*1024 or entry.file_size%2352:raise ValueError('Invalid CD image size')
    end=entry.file_size//2352
    if tracks[-1]['sector']>=end:raise ValueError('CD track lies outside the image')
    # Stream the compressed BIN once: never materialize the full raw disc.
    data_sectors=tracks[1]['sector']
    if data_sectors*2048>MAX_OUTPUT:raise ValueError('CD data track is too large')
    with archive.open(entry) as stream:
        iso=bytearray(data_sectors*2048);offset=24 if tracks[0]['mode']=='MODE2/2352' else 16
        for start in range(0,data_sectors,128):
            count=min(128,data_sectors-start);raw=read_exact(stream,count*2352)
            for i in range(count):iso[(start+i)*2048:(start+i+1)*2048]=raw[i*2352+offset:i*2352+offset+2048]
            if progress:progress(.12*(start+count)/data_sectors)
        yield from read_media(iso,progress=(lambda value:progress(.12+.88*value)) if progress else None)
        del iso
        for i,track in enumerate(tracks[1:],1):
            stop=tracks[i+1]['sector'] if i+1<len(tracks) else end
            count=(stop-track['sector'])*2352
            # Original CDDA is signed 16-bit little-endian stereo at 44.1 kHz.
            out=io.BytesIO()
            with wave.open(out,'wb') as wav:
                wav.setnchannels(2);wav.setsampwidth(2);wav.setframerate(44100);wav.setnframes(count//4)
                while count:
                    n=min(count,2352*128);wav.writeframesraw(read_exact(stream,n));count-=n
            yield f'AUDIO/track{track["number"]:02}.wav',out.getvalue()

def read_media(data, _depth=0, progress=None):
    # Content, not a filename/URL suffix, selects the reader. Non-ZIP input
    # defaults to ISO9660, including extensionless image= URLs.
    if _depth>3:raise ValueError('Too many nested image archives')
    if data[:4] == b'PK\x03\x04':
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries=[e for e in archive.infolist() if not e.is_dir()]
            for entry in entries:safe_name(entry.filename)
            if not entries:raise ValueError('The ZIP is empty')
            names={safe_name(e.filename).lower() for e in entries}
            # A demo contains an installation tree, not an image. Its texture
            # archive is normally the largest file and must not be read as ISO.
            demo=any(n.endswith('/run/ddrome.exe') or n=='run/ddrome.exe' for n in names) and any(n.endswith('/data/textures/texture.zb') or n=='data/textures/texture.zb' for n in names)
            if demo:
                total=sum(e.file_size for e in entries);completed=0
                if total>MAX_OUTPUT:raise ValueError('Archive exceeds size limit')
                if progress:progress(0)
                for entry in entries:
                    chunks=[];loaded=0
                    with archive.open(entry) as source:
                        while True:
                            chunk=source.read(262144)
                            if not chunk:break
                            chunks.append(chunk);loaded+=len(chunk)
                            if progress:progress((completed+loaded)/max(1,total))
                    yield safe_name(entry.filename),b''.join(chunks)
                    completed+=entry.file_size
                return
            image=max(entries,key=lambda e:e.file_size)
            if image.file_size>MAX_IMAGE:raise ValueError('CD image exceeds size limit')
            cues=[e for e in entries if e.filename.lower().endswith('.cue')]
            if cues:
                if len(cues)!=1:raise ValueError('Select an archive containing one CD cue sheet')
                yield from mixed_cd(archive,cues[0],image,progress);return
            # Generic image ZIP: the largest member is the disc regardless of
            # its extension. Mixed BIN/CUE discs take the streaming path above.
            chunks=[];loaded=0
            with archive.open(image) as source:
                while True:
                    chunk=source.read(262144)
                    if not chunk:break
                    chunks.append(chunk);loaded+=len(chunk)
                    if progress:progress(.1*loaded/max(1,image.file_size))
            yield from read_media(b''.join(chunks),_depth+1,progress=(lambda value:progress(.1+.9*value)) if progress else None)
    else:
        found=False
        for name, content in iso_files(data):
            if name.rsplit('/',1)[-1].upper() == 'DATA.Z':
                yield from installshield(bytes(content),progress) if progress else installshield(bytes(content));found=True
            elif re.fullmatch(r'AUDIO/track\d{2}\.wav',name,re.I):yield name,content
        if not found:raise ValueError('DATA.Z was not found in this ISO')
