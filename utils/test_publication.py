"""Synthetic publication/route checks; no private media is required."""
from pathlib import Path
from tempfile import TemporaryDirectory
from contextlib import redirect_stdout
from io import StringIO
import json,sys,unittest
from build_static import ROOT,build,public_files
from check_dist import check_dist
from serve import Handler,DEV_MEDIA_SOURCES

class PublicationTests(unittest.TestCase):
    def test_public_files(self):
        files=public_files()
        self.assertIn('resource-code/converter.zip',files)
        self.assertFalse(any(n.startswith(('assets/','private/')) for n in files))
        self.assertIn('/private/',(ROOT/'.gitignore').read_text().splitlines())
    def test_build_and_check(self):
        with TemporaryDirectory(prefix='dd-publication-') as temp:
            out=Path(temp)/'site'
            with redirect_stdout(StringIO()):build(out)
            self.assertTrue(check_dist(out)['passed'])
            self.assertFalse((out/'region-data.json').exists())
            self.assertNotIn('vertices',(out/'region-data.js').read_text())
            (out/'unapproved.iso').write_bytes(b'synthetic')
            with self.assertRaises(AssertionError):check_dist(out)
    def test_source_and_private_destinations_are_protected(self):
        for folder in ['src','public','private','utils']:
            with self.assertRaises(ValueError):build(ROOT/folder/'nested-output')
        with self.assertRaises(ValueError):build(ROOT)
    def test_dev_private_mount_and_clean_publication_route_boundaries(self):
        handler=object.__new__(Handler);handler.private=False;handler.dist=False
        self.assertEqual(handler.translate_path('/'),str(ROOT/'src/index.html'))
        self.assertEqual(handler.translate_path('/vendor/three.module.js'),str(ROOT/'public/vendor/three.module.js'))
        for path in ['/private/original/game/RUN/ddrome.exe','/utils/serve.py','/.git/config','/assets/cd.iso','/reference/','/%2e%2e/private/original/video.mkv']:
            self.assertEqual(handler.translate_path(path),str(ROOT/'__not_served__'),path)
        handler.private=True
        self.assertEqual(handler.translate_path('/assets/cd.iso'),str(ROOT/'private/assets/cd.iso'))
        self.assertEqual(handler.translate_path('/private/original/video.mkv'),str(ROOT/'private/original/video.mkv'))
        for path in ['/private/disc/DDROME.zip','/private/disc/Deathdrome.iso','/private/disc/Death-Drome_Win_EN.zip']:self.assertEqual(handler.translate_path(path),str(ROOT/path.lstrip('/')))
        self.assertEqual(handler.translate_path('/private/%2e%2e/package.json'),str(ROOT/'__not_served__'))
        handler.dist=True;handler.private=False
        self.assertEqual(handler.translate_path('/assets/cd.iso'),str(ROOT/'dist/assets/cd.iso'))
        self.assertEqual(handler.translate_path('/'),str(ROOT/'dist/index.html'))
    def test_dev_defaults_use_only_canonical_private_disc_paths(self):
        handler=object.__new__(Handler);handler.private=True;handler.dist=False;handler.path='/resource-defaults.js?build=example'
        handler.send_response=lambda status:self.assertEqual(status,200)
        handler.send_header=lambda *args:None;handler.end_headers=lambda:None
        response=handler.send_head();text=response.read().decode()
        self.assertIn('/private/disc/Death-Drome_Win_EN.zip',text)
        self.assertIn('/private/disc/DDROME.zip',text);self.assertIn('/private/disc/Deathdrome.iso',text)
        self.assertNotIn('Downloads',text)
        self.assertEqual(DEV_MEDIA_SOURCES['cd'],'/private/disc/Death-Drome_Win_EN.zip')
    def test_missing_asset_uses_picker_and_region_cache_is_invalidated(self):
        # Startup still requests the deployment-relative full CD. Region data is
        # configured only after pinning the selected image's local resources.
        self.assertIn("'assets/cd.iso'",(ROOT/'src/resource-defaults.js').read_text())
        bootstrap=(ROOT/'src/bootstrap.js').read_text()
        self.assertLess(bootstrap.index('await pinResources'),bootstrap.index('configureRegionData(await'))
        self.assertIn('RESOURCE_VERSION=6',(ROOT/'src/resource-db.js').read_text())

if __name__=='__main__':unittest.main()
