"""Read original PCM sectors directly from the canonical full-CD ZIP.

Keeps exporters/audits independent of a redundant unpacked 434 MB BIN copy.
"""
from pathlib import Path,PurePosixPath
import zipfile
from browser_converter.archive import cue_tracks,safe_name,read_exact
ROOT=Path(__file__).resolve().parents[1]

def pcm_tracks(path=None):
    path=Path(path) if path else ROOT/'private/disc/Death-Drome_Win_EN.zip'
    with zipfile.ZipFile(path) as archive:
        cues=[e for e in archive.infolist() if e.filename.lower().endswith('.cue')]
        if len(cues)!=1:raise ValueError('Expected one CD cue sheet')
        cue=cues[0];filename,tracks=cue_tracks(archive.read(cue).decode('utf-8-sig'))
        folder=str(PurePosixPath(cue.filename).parent)
        name=safe_name((folder+'/' if folder!='.' else '')+filename)
        entry=next(e for e in archive.infolist() if safe_name(e.filename).lower()==name.lower())
        end=entry.file_size//2352
        with archive.open(entry) as source:
            source.seek(tracks[1]['sector']*2352)
            for i,track in enumerate(tracks[1:],1):
                stop=tracks[i+1]['sector'] if i+1<len(tracks) else end
                yield track['number'],track['sector'],stop,read_exact(source,(stop-track['sector'])*2352)
