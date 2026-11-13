"""Small indexed PNG writer for original palette data (Pillow-compatible subset)."""
import struct,zlib,sys,types
class IndexedImage:
    def __init__(self, mode, size, pixels):
        if mode != 'P' or len(pixels) != size[0]*size[1]: raise ValueError('Invalid indexed image')
        self.size=size;self.pixels=pixels
    def putpalette(self,palette): self.palette=bytes(palette)
    def save(self,path,transparency=None):
        def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
        w,h=self.size
        out=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,3,0,0,0))+chunk(b'PLTE',self.palette)
        if transparency is not None:out+=chunk(b'tRNS',bytes([255])*transparency+b'\0')
        raw=b''.join(b'\0'+self.pixels[y*w:(y+1)*w] for y in range(h))
        out+=chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
        with open(path,'wb') as f:f.write(out)
def install():
    image=types.ModuleType('PIL.Image');image.frombytes=IndexedImage
    pil=types.ModuleType('PIL');pil.Image=image
    sys.modules['PIL']=pil;sys.modules['PIL.Image']=image
