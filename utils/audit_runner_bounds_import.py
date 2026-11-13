"""Round-trip supported demo/ISO imports through the packaged converter code.

Native geometry is audited separately. This checks that format-six imports
carry the same runner query bounds tree into both supported media profiles.
No source media or generated game resources are added to a release.
"""
import json,zipfile,subprocess,tempfile,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
NAMES=['redrunr','blurunr','ylwrunr','whtrunr','prprunr','grnrunr','pnkrunr','orgrunr']

def main():
    rows=[];source=json.loads((ROOT/'private/verification/resource-import.json').read_text())['checks']
    for kind,path in [('demo',ROOT/'private/disc/DDROME.zip'),('cd',ROOT/'private/disc/Deathdrome.iso')]:
        digest=hashlib.sha256(path.read_bytes()).hexdigest();assert digest==source[kind]['mediaSha256']
        with tempfile.TemporaryDirectory(prefix='dd-runner-bounds-import-') as scratch:
            work=Path(scratch)
            with zipfile.ZipFile(ROOT/'public/resource-code/converter.zip') as z:z.extractall(work)
            code="import sys;from pathlib import Path;sys.path.insert(0,sys.argv[2]+'/utils');from convert import convert;convert(Path(sys.argv[1]).read_bytes(),Path(sys.argv[2]),lambda phase:print(phase,flush=True))"
            subprocess.run(['python3','-c',code,str(path),str(work)],check=True)
            assets=work/'private/assets';profile=json.loads((assets/'installation.json').read_text());bounds={}
            for name in NAMES:
                model=assets/'models'/f'{name}.json'
                if not model.exists():continue
                data=json.loads(model.read_text());assert data.get('queryBounds');tree=data['attachments']['chassis']['collisionBounds'];expected=json.loads((ROOT/f'private/assets/models/{name}.json').read_text())['attachments']['chassis']['collisionBounds'];assert tree==expected,name
                regions=json.loads((assets/'region-data.json').read_text());assert len(regions['arenas'])==8;assert all(regions['arenas'][i-1] for i in profile['arenas']);
                bounds[name]=hashlib.sha256(json.dumps(tree,sort_keys=True).encode()).hexdigest()
            assert len(bounds)==8
            golden=json.loads((ROOT/'private/assets/region-data.json').read_text());assert all(regions[k]==golden[k] for k in ['origin','extents','partition']);assert all(regions['arenas'][i-1]==golden['arenas'][i-1] for i in profile['arenas'])
            rows.append({'regionFaces':sum(len(a) for a in regions['arenas']),'regionDataMatchesLocalOriginal':True,'kind':kind,'sourceSha256':digest,'arenas':profile['arenas'],'runnerCount':len(bounds),'boundsHashes':bounds,'passed':True})
    report={'scope':__doc__,'cacheFormat':6,'profiles':rows,'passed':all(r['passed'] for r in rows),'limits':['Packaged browser converter executes under host Python; Pyodide/browser import and physical-phone behavior still need a fresh browser check.']}
    (ROOT/'private/verification/runner-bounds-import.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
if __name__=='__main__':main()
