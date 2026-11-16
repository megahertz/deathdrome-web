"""Serve the engine/public overlay, or the exact publication output.

Development mounts private/ at /private by default, as explicitly requested.
--clean and --dist disable that mount and use static-host media defaults.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote,urlsplit
import argparse,socket,json,io
from build_static import compile_sources
ROOT=Path(__file__).resolve().parents[1]
DEV_MEDIA_SOURCES={'cd':'/private/disc/Death-Drome_Win_EN.zip','demo':'/private/disc/DDROME.zip','nomusic':'/private/disc/Deathdrome.iso'}

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,private=True,dist=False,**kwargs):
        self.private=private;self.dist=dist
        super().__init__(*args,directory=str(ROOT/'dist' if dist else ROOT/'src'),**kwargs)
    def translate_path(self,path):
        parts=unquote(urlsplit(path).path).strip('/').split('/')
        if any(p in {'.','..'} or '\\' in p or '\x00' in p for p in parts):return str(ROOT/'__not_served__')
        relative='/'.join(parts) or 'index.html'
        if any(p.startswith('.') for p in parts):return str(ROOT/'__not_served__')
        if self.dist:return self.contained(ROOT/'dist',relative)
        if relative.endswith('.js') or relative=='index.html':compile_sources()
        for directory in [ROOT/'.build/src',ROOT/'src',ROOT/'public']:
            candidate=directory/relative
            if candidate.is_file():return self.contained(directory,relative)
        if self.private:
            routes={'private':ROOT/'private','assets':ROOT/'private/assets','reference':ROOT/'private/reference','evidence':ROOT/'private/verification'}
            if parts[0] in routes:return self.contained(routes[parts[0]],'/'.join(parts[1:]) or 'index.html')
            browser_dir=ROOT/'.build/utils/browser' if relative.endswith('.js') else ROOT/'utils/browser'
            candidate=browser_dir/relative
            if candidate.is_file():return self.contained(browser_dir,relative)
            candidate=ROOT/'private'/relative
            if len(parts)==1 and relative.endswith('-fixtures.json') and candidate.is_file():return str(candidate)
        return str(ROOT/'__not_served__')
    @staticmethod
    def contained(directory,relative):
        candidate=(directory/relative).resolve()
        return str(candidate) if candidate.is_relative_to(directory.resolve()) else str(ROOT/'__not_served__')
    def send_head(self):
        # A virtual source module selects dev media without changing a static
        # release's defaults or adding any original bytes to the build.
        if self.private and not self.dist and urlsplit(self.path).path=='/resource-defaults.js':
            content=('export const MEDIA_SOURCES=Object.freeze('+json.dumps(DEV_MEDIA_SOURCES)+');\n').encode()
            self.send_response(200);self.send_header('Content-Type','text/javascript; charset=utf-8');self.send_header('Content-Length',str(len(content)));self.end_headers()
            return io.BytesIO(content)
        return super().send_head()
    def list_directory(self,path):
        self.send_error(404,'Not found');return None
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy','same-origin')
        self.send_header('Cross-Origin-Embedder-Policy','require-corp')
        if urlsplit(self.path).path.endswith(('.js','.json','.html','.css','/')):self.send_header('Cache-Control','no-cache')
        super().end_headers()

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--host',default=None);parser.add_argument('--port',type=int,default=8080)
    mode=parser.add_mutually_exclusive_group();mode.add_argument('--private',action='store_true');mode.add_argument('--clean',action='store_true');mode.add_argument('--dist',action='store_true')
    args=parser.parse_args()
    args.host=args.host or '0.0.0.0'
    private=not args.clean and not args.dist
    if not args.dist:compile_sources()
    server=ThreadingHTTPServer((args.host,args.port),partial(Handler,private=private,dist=args.dist))
    print(f'DeathDrome: http://localhost:{args.port}/',flush=True)
    print('Serving '+('dist only' if args.dist else 'src + public'+(' + /private (local development)' if private else '')),flush=True)
    if args.host=='0.0.0.0':
        try:
            with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as probe:
                probe.connect(('192.0.2.1',80));address=probe.getsockname()[0]
            print(f'Phone / LAN: http://{address}:{args.port}/ (same Wi-Fi)',flush=True)
        except OSError:pass
    server.serve_forever()
