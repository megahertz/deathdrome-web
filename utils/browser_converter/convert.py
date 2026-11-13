"""Offline resource installation, also runnable in a Pyodide worker."""
import sys,json,runpy,hashlib,shutil,re
from pathlib import Path
from archive import read_media
from palette_png import install

def convert(media, root, progress=lambda phase:None, progress_detail=None):
    root=Path(root);source=root/'private/original/game';output=root/'private/assets'
    source.mkdir(parents=True,exist_ok=True);output.mkdir(parents=True,exist_ok=True)
    catalog=json.loads((root/'utils/case-catalog.json').read_text())
    progress('Extracting files')
    last_extract=-2
    def extracting(fraction):
        nonlocal last_extract
        value=max(0,min(1000,int(fraction*1000)))
        if progress_detail and (value>=last_extract+2 or value==1000 and last_extract!=1000):
            last_extract=value;progress_detail('Extracting files',value,1000)
    last_model=-2
    def preparing_models(done,total):
        nonlocal last_model
        value=max(0,min(1000,int(done/max(1,total)*1000)))
        if value>=last_model+2 or value==1000 and last_model!=1000:
            last_model=value;progress_detail('Preparing models',value,1000)
    if progress_detail:extracting(0)
    count=0;music_tracks=[]
    for name,data in read_media(media,progress=extracting if progress_detail else None):
        music=re.fullmatch(r'AUDIO/track(\d{2})\.wav',name,re.I)
        if music:
            track=int(music[1])
            if 2<=track<=99:
                progress(f'Preparing CD music track {track}')
                audio=output/'audio';audio.mkdir(exist_ok=True);(audio/f'track{track:02}.wav').write_bytes(data);music_tracks.append(track)
            continue
        parts=name.split('/')
        index=next((i for i,p in enumerate(parts) if p.upper() in ('DATA','RUN')),None)
        if index is None:continue
        relative='/'.join(parts[index:]);relative=catalog.get(relative.lower(),relative)
        path=source/relative;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data);count+=1
    if not (source/'RUN/ddrome.exe').is_file() or not (source/'DATA/TEXTURES/texture.zb').is_file():
        raise ValueError('DeathDrome resources were not found in this file')
    install()
    for script,phase in [('extract_assets.py','Preparing textures'),('export_support.py','Preparing fonts'),('export_models.py','Preparing models'),('export_training.py','Preparing menus'),('export_credits.py','Preparing credits'),('export_recharge_paths.py','Preparing paths'),('export_scene_effects.py','Preparing animations'),('extract_regions.py','Preparing paths')]:
        progress(phase)
        options={'_model_progress':preparing_models} if script=='export_models.py' and progress_detail else {}
        previous_args=sys.argv;sys.argv=['converter']
        try:runpy.run_path(str(root/'utils'/script),run_name='__main__',init_globals=options)
        finally:sys.argv=previous_args
    progress('Preparing sounds')
    audio=output/'audio';audio.mkdir(exist_ok=True)
    for path in source.rglob('*'):
        if path.suffix.lower()=='.wav':shutil.copyfile(path,audio/path.name.lower())
    arenas=sorted(int(p.stem[5:]) for p in (output/'models').glob('arena[1-8].json'))
    profile={'version':1,'kind':'demo' if arenas==[1] else 'cd','arenas':arenas,'musicTracks':sorted(music_tracks),'musicExtension':'wav',
             'sourceSha256':hashlib.sha256(media).hexdigest(),'executableSha256':hashlib.sha256((source/'RUN/ddrome.exe').read_bytes()).hexdigest(),'sourceFiles':count}
    (output/'installation.json').write_text(json.dumps(profile))
    return profile
