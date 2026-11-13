"""Check real unpack/model progress through the packaged converter.

Uses separately supplied private media. Report contains counts, sizes and
progress checkpoints, never extracted artwork or sound bytes.
"""
from pathlib import Path
import subprocess,zipfile,tempfile,json
ROOT=Path(__file__).resolve().parents[1]
PROGRAM=r'''
import sys,json
from pathlib import Path
sys.path.insert(0,str(Path(sys.argv[2])/'utils'))
from convert import convert
updates={}
def detail(phase,completed,total):updates.setdefault(phase,[]).append([completed,total])
profile=convert(Path(sys.argv[1]).read_bytes(),Path(sys.argv[2]),progress_detail=detail)
report={'kind':profile['kind'],'arenas':profile['arenas'],'musicTracks':len(profile['musicTracks']),'progress':{}}
for phase in ['Extracting files','Preparing models']:
 values=updates[phase];fractions=[v/max(1,t) for v,t in values]
 assert len(values)>10,(phase,len(values))
 assert fractions[0]==0 and fractions[-1]==1,(phase,fractions[0],fractions[-1])
 assert all(a<=b for a,b in zip(fractions,fractions[1:])),phase
 assert any(0<v<1 for v in fractions),phase
 report['progress'][phase]={'updates':len(values),'first':values[0],'last':values[-1],'checkpoints':values[::max(1,len(values)//10)]}
Path(sys.argv[2],'progress-report.json').write_text(json.dumps(report))
'''

def main():
 profiles=[]
 for name in ['DDROME.zip','Deathdrome.iso','Death-Drome_Win_EN.zip']:
  with tempfile.TemporaryDirectory(prefix='dd-loader-progress-') as folder:
   root=Path(folder)
   with zipfile.ZipFile(ROOT/'public/resource-code/converter.zip') as archive:archive.extractall(root)
   subprocess.run(['python3','-c',PROGRAM,str(ROOT/'private/disc'/name),str(root)],check=True,stdout=subprocess.DEVNULL)
   profiles.append({'source':name,**json.loads((root/'progress-report.json').read_text())})
 report={'passed':True,'scope':__doc__,'profiles':profiles,'limits':['Runs packaged converter under host Python, not Pyodide/browser. No performance or live rendering claim.','Stage fractions represent processed bytes and model work; no elapsed-time estimate is claimed.']}
 (ROOT/'private/verification/loader-progress-checks.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps({'passed':True,'profiles':[{'source':p['source'],'stages':{name:details['updates']for name,details in p['progress'].items()}}for p in profiles]},indent=2))
if __name__=='__main__':main()
