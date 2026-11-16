"""Build engine code and public files."""
from pathlib import Path
import shutil,json,hashlib,argparse,re,subprocess,threading
ROOT=Path(__file__).resolve().parents[1]

_compile_lock=threading.Lock()

def compile_sources():
    """Compile owned TS modules; generated files never share a source directory."""
    with _compile_lock:
        sources=sorted([*(ROOT/'src').rglob('*.ts'),*(ROOT/'utils/browser').rglob('*.ts'),ROOT/'utils/compile.ts',ROOT/'package-lock.json'])
        fingerprint=hashlib.sha256('\n'.join(f'{p.relative_to(ROOT)}:{p.stat().st_mtime_ns}:{p.stat().st_size}' for p in sources).encode()).hexdigest()
        stamp=ROOT/'.build/source-fingerprint'
        if stamp.exists() and stamp.read_text()==fingerprint:return ROOT/'.build'
        subprocess.run(['node','utils/compile.ts'],cwd=ROOT,check=True)
        stamp.write_text(fingerprint)
        return ROOT/'.build'

def engine_files():
    """Publication names include compiled modules, HTML and CSS, never TS types."""
    result={}
    for p in (ROOT/'src').iterdir():
        if p.is_symlink() or not p.is_file():raise ValueError(f'Unexpected engine source: {p.name}')
        if p.name.endswith('.d.ts'):continue
        if p.suffix=='.ts':result[p.with_suffix('.js').name]=ROOT/'.build/src'/p.with_suffix('.js').name
        elif p.suffix in {'.html','.css'}:result[p.name]=p
        else:raise ValueError(f'Unexpected engine source: {p.name}')
    return result

def public_files():
    return sorted(str(p.relative_to(ROOT/'public')) for p in (ROOT/'public').rglob('*') if p.is_file())

def build(output):
    out=Path(output).resolve()
    # Build cannot erase sources, private media, or tooling, even with --out.
    if out==ROOT or ROOT.is_relative_to(out) or any(out.is_relative_to(ROOT/p) for p in ['src','public','private','utils']):raise ValueError('Choose a separate output directory')
    compile_sources()
    public=public_files()
    if out.exists():
        if not (out/'build-manifest.json').is_file():raise ValueError('Output exists and is not a generated distribution')
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for name,p in engine_files().items():shutil.copyfile(p,out/name)
    for name in public:
        target=out/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/'public'/name,target)
    (out/'assets').mkdir()
    source_hash=hashlib.sha256()
    for p in sorted(out.rglob('*')):
        if p.is_file():source_hash.update(str(p.relative_to(out)).encode());source_hash.update(p.read_bytes())
    build_id=source_hash.hexdigest()[:16]
    pattern=re.compile(r"(?P<quote>['\"])(?P<path>(?:\./)?[A-Za-z0-9_./-]+\.(?:js|mjs|css|zip|png|jpg|jpeg|svg|ttf)(?:\?[^'\"]*)?)(?P=quote)")
    for p in out.iterdir():
        if not p.is_file() or p.suffix not in {'.js','.html','.css'}:continue
        def version(match):
            path=match['path'];target=path.split('?',1)[0]
            if not (out/target).is_file():return match[0]
            return match['quote']+path+('&' if '?' in path else '?')+'build='+build_id+match['quote']
        p.write_text(pattern.sub(version,p.read_text()))
    files={str(p.relative_to(out)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.rglob('*')) if p.is_file()}
    (out/'build-manifest.json').write_text(json.dumps({'buildId':build_id,'gameResourcesIncluded':False,'sources':['src','public'],'files':files},indent=2)+'\n')
    print(f'Static distribution: {out} ({len(files)} files, no original media)')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--out',default=str(ROOT/'dist'));args=parser.parse_args()
    try:build(args.out)
    except ValueError as e:raise SystemExit(str(e))
