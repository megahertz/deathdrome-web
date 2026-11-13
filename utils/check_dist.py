"""Verify the exact file inventory and hashes of a publication build."""
from pathlib import Path
import argparse,hashlib,json,zipfile,re
from build_static import ROOT,public_files

def check_dist(directory):
    directory=Path(directory).resolve();manifest=json.loads((directory/'build-manifest.json').read_text())
    expected={p.name for p in (ROOT/'src').iterdir() if p.is_file()}|set(public_files())
    actual={str(p.relative_to(directory)) for p in directory.rglob('*') if p.is_file()}
    assert actual==expected|{'build-manifest.json'},'Unexpected/missing distribution files'
    assert set(manifest['files'])==expected,'Build manifest inventory differs'
    assert manifest['gameResourcesIncluded'] is False
    assert not any((directory/'assets').rglob('*')),'Original media cannot be included in assets/'
    for name,digest in manifest['files'].items():
        path=directory/name
        assert not path.is_symlink() and path.resolve().is_relative_to(directory),'Symlink escapes publication root'
        assert hashlib.sha256(path.read_bytes()).hexdigest()==digest,f'Hash mismatch: {name}'
    # Converter contains authored code and file-name metadata, never game bytes.
    with zipfile.ZipFile(directory/'resource-code/converter.zip') as archive:
        assert archive.namelist() and all(n.startswith('utils/') and n.endswith(('.py','.json')) for n in archive.namelist())
        assert 'utils/extract_regions.py' in archive.namelist()
    # Source dependencies must resolve after flattening src into the release root.
    for path in directory.glob('*.js'):
        for target in re.findall(r'''(?:from\s*|import\s*\()\s*['"](\./[^'"]+)['"]''',path.read_text()):
            assert (directory/target.split('?')[0]).is_file(),f'Broken module import in {path.name}: {target}'
    html=(directory/'index.html').read_text()
    assert '"#three"' in html and 'vendor/three.module.js' in html
    for name in ['THREE-LICENSE.txt','pyodide/LICENSE','pyodide/Python-LICENSE.txt']:assert (directory/'vendor'/name).is_file()
    return {'buildId':manifest['buildId'],'files':len(expected),'gameResourcesIncluded':False,'privateFilesIncluded':False,'passed':True}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--dir',default=str(ROOT/'dist'));args=parser.parse_args()
    print(json.dumps(check_dist(args.dir),indent=2))
