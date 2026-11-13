"""Bind original GW texture sequences to the decoded model hierarchy."""
from pathlib import Path
import json
import re

ROOT=Path(__file__).resolve().parents[1]
RUN=ROOT/'private/original/game/RUN'
ASSETS=ROOT/'private/assets'
rules=[]
selected={'domain_x.gw','enhcycle.gw','key.gw','scrub.gw','vid_mon.gw','runner_x.gw','explodex.gw','ionswrdx.gw'}
for script in sorted(RUN.iterdir()):
    name=script.name.lower()
    if name not in selected and not re.fullmatch(r'arena[1-8]\.gw',name):continue
    current=None
    for line_number,line in enumerate(script.read_text(errors='replace').splitlines(),1):
        parts=line.split('#',1)[0].split()
        if not parts:continue
        command=parts[0].lower()
        if command=='findnode':
            current={'node':parts[1].lower(),'frames':[],'rate':0,'enabled':False,'source':script.name,'line':line_number}
            rules.append(current)
        elif current and command=='cycletextureseton':
            current['enabled']=int(parts[1])>0
            if int(parts[1])>0:current['count']=int(parts[1])
        elif current and command=='cycletexturesetspeed':current['rate']=float(parts[1])
        elif current and command=='cycletexturesetmap':current['frames'].append(Path(parts[1]).stem.lower()+'.png')
rules=[rule for rule in rules if rule['frames']]
texture_files={}
for path in ASSETS.rglob('*.png'):texture_files.setdefault(path.name,[]).append(path)
bound=0
for path in sorted((ASSETS/'models').glob('*.json')):
    model=json.loads(path.read_text())
    for face in model['meshes']:
        face.pop('cycle',None)
        nodes=face['name'].lower().split('/')
        for rule in rules:
            source=rule['source'].lower()
            if re.fullmatch(r'arena[1-8]\.gw',source) and path.stem!=source[:-3]:continue
            if source=='scrub.gw' and path.stem!='scrub':continue
            if source=='key.gw' and path.stem!='keytest':continue
            if source=='runner_x.gw' and not path.stem.startswith('runrex_'):continue
            if source=='explodex.gw' and path.stem not in ['fx_col_1','fx_smexp','fx_lgexp']:continue
            if source=='ionswrdx.gw' and path.stem!='ionflare':continue
            if rule['node'] not in nodes:continue
            frames=[]
            for name in rule['frames']:
                candidate=ASSETS/Path(face.get('texture') or 'arena/textures/ar1/default.png').parent/name
                if not candidate.exists():
                    alternatives=texture_files.get(name,[])
                    if not alternatives:raise ValueError(f'Missing cycle texture {name}')
                    candidate=sorted(alternatives,key=lambda p:('ar1' not in str(p),str(p)))[0]
                frames.append(str(candidate.relative_to(ASSETS)))
            assert len(frames)==rule['count'],rule
            cycle={'frames':frames,'rate':rule['rate'],'enabled':rule['enabled'],'source':rule['source'],'line':rule['line']}
            if source=='vid_mon.gw':cycle['clockDigit']={'minute':'minutes','l_num':'tens','r_num':'ones'}[rule['node']]
            face['cycle']=cycle
        if 'cycle' in face:bound+=1
    path.write_text(json.dumps(model,separators=(',',':')))
(ASSETS/'scene-effects.json').write_text(json.dumps(rules,indent=2)+'\n')
print(f'Bound {len(rules)} original texture sequences to {bound} model polygons')
