"""Native World/Object3D queries on supplied decoded GameGen subtrees.

The real grid initialization/insertion, Object3D links, bounds construction and
query traversal execute. Initial node fields and child-bound unions are
supplied. File loading, pruning, unresolved externals and dirty transform
scheduling are NOT reproduced by this harness.
"""
import struct
from unicorn import UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EAX,UC_X86_REG_EDX
from native_ai_audit import Native,ROOT,EXE,f32
from export_models import decode,ID

def bits(value):return struct.unpack('<f',struct.pack('<I',value))[0]

class SceneQueries(Native):
 def __init__(self):
  super().__init__();self.heap=0x3100000;self.cpu.mem_map(self.heap,0x1000000);self.sizes={};self.nodes={};self.paths={}
  image=EXE.read_bytes();self.cpu.mem_write(0x446764,image[0x446764-0x410000+0x400:0x446aa6-0x410000+0x400])
  for address in [0x468c6c,0x469eb7,0x467940]:self.cpu.mem_write(address,b'\xc3')
  self.cpu.hook_add(UC_HOOK_CODE,self._realloc,begin=0x468c6c,end=0x468c6c)
  self.cpu.hook_add(UC_HOOK_CODE,self._calloc,begin=0x469eb7,end=0x469eb7)
  self.write(0x490ce0,'III',self.reserve(0x40000),self.reserve(0x40000),self.reserve(0x40000))
  self.world=self.reserve(0x200);self.fields=self.reserve(0x100);self.write(self.world+0x44,'I',self.fields)
  self.write(self.world+0x40,'B',3);self.write(self.world+0x24,'II',1,1)
  self.call(0x444710,[1792,-1792],eax=self.world);self.call(0x4446c8,[-896,896],eax=self.world);self.call(0x444754,[128,-128],eax=self.world);self.call(0x4449f0,[3,3],eax=self.world)
  self.output=self.reserve(0x1000)
 def reserve(self,length):
  result=self.heap;self.heap+=(length+15)&~15
  if self.heap>=0x4100000:raise RuntimeError('Native scene allocation pool exhausted')
  self.sizes[result]=length;return result
 def _calloc(self,cpu,address,size,data):cpu.reg_write(UC_X86_REG_EAX,self.reserve(cpu.reg_read(UC_X86_REG_EAX)*cpu.reg_read(UC_X86_REG_EDX)))
 def _realloc(self,cpu,address,size,data):
  old=cpu.reg_read(UC_X86_REG_EAX);length=cpu.reg_read(UC_X86_REG_EDX);out=self.reserve(length)
  if old:self.cpu.mem_write(out,bytes(self.cpu.mem_read(old,min(length,self.sizes[old]))))
  cpu.reg_write(UC_X86_REG_EAX,out)
 def load_subtree(self,arena,path):
  data=decode(ROOT/f'private/original/game/DATA/ARENA/MODELS/ARENA{arena}.GAM',f'arena/textures/ar{arena}',source_tree=True)
  def find(node,names):
   if not names:return node
   return find(next(c for c in node['children'] if c['name']==names[0]),names[1:])
  source=find(data['sourceTree'],path.split('/'));node=self._node(source,path);self.call(0x444f70,eax=self.world,edx=node);return data,node
 def _node(self,source,path):
  if source.get('matrix',ID)!=ID:raise ValueError('This local harness requires identity source transforms: '+path)
  if source.get('op') not in [644,638]:raise ValueError('Unsupported supplied container '+path)
  node=self.reserve(0x180);fields=self.reserve(0x80);self.nodes[path]=node;self.paths[node]=path
  self.cpu.mem_write(node,source['name'].encode()[:31]+b'\0');self.write(node+0x24,'II',1,1);self.write(node+0x40,'B',5);self.write(node+0x44,'I',fields)
  comment=source.get('comment','').lower();self.write(node+0x30,'III',int('altitude_off' not in comment),int('intersect_off' not in comment),int('intersect_bbox' in comment))
  self.write(fields+0x18,'3f',1,1,1);self.write(fields+0x30,'I',1);self.write(fields+0x38,'12f',1,0,0,0,1,0,0,0,1,0,0,0)
  polygons=[c for c in source['children'] if c.get('op')==583];vertices=[]
  if polygons:
   shape=self.reserve(0x40);polydata=self.reserve(40*len(polygons));self.write(node+0x48,'I',shape)
   for i,poly in enumerate(polygons):
    points=[[f32(v) for v in p[:3]] for p in poly['vertices']];indices=self.reserve(len(points)*4);self.write(indices,'I'*len(points),*range(len(vertices),len(vertices)+len(points)))
    self.write(polydata+i*40+4,'II',len(points),indices);self.write(polydata+i*40+0x18,'B',poly.get('drawType',0)&1);vertices+=points
   positions=self.reserve(len(vertices)*12);self.write(positions,'f'*(len(vertices)*3),*(v for p in vertices for v in p));self.write(shape+8,'II',len(polygons),len(vertices));self.write(shape+0x20,'II',polydata,positions)
   self.write(node+0xd4,'I',1);self.write(node+0xd8,'6f',*([min(p[i] for p in vertices) for i in range(3)]+[max(p[i] for p in vertices) for i in range(3)]))
  children=[]
  for child in source['children']:
   if child.get('op')==583:continue
   target=self._node(child,path+'/'+child['name']);children.append(target);self.call(0x45a3dc,eax=node,edx=target)
  self._bounds(node,children);return node
 def _bounds(self,node,children=None):
  if children is None:
   count,pointer=self.read(node+0x68,'II');children=list(self.read(pointer,'I'*count)) if count else []
   for child in children:self._bounds(child)
  corners=[list(self.read(child+0x74+i*12,'3f')) for child in children if self.read(child+0x70,'I')[0] for i in range(8)]
  self.write(node+0xf0,'I',int(bool(corners)))
  if corners:self.write(node+0xf4,'6f',*([min(p[i] for p in corners) for i in range(3)]+[max(p[i] for p in corners) for i in range(3)]))
  self.call(0x44bbe0,eax=node)
 def set_lift(self,path,height):
  node=self.nodes[path];fields=self.read(node+0x44,'I')[0];self.write(fields+0x28,'f',height);self.write(fields+0x30,'I',int(height==0));self.write(fields+0x60,'f',height)
  roots=[p for p in self.nodes if not any(p.startswith(q+'/') for q in self.nodes)];[self._bounds(self.nodes[p]) for p in roots]
 def query(self,kind,**values):
  if kind=='ground':self.call(0x4459a4,[values['x'],values['z'],bits(self.output)],eax=self.world)
  else:self.call(0x446764,[*[values['from'][k] for k in 'xyz'],*[values['to'][k] for k in 'xyz'],bits(self.output)],eax=self.world)
  result=[]
  for i in range(self.read(self.output,'I')[0]):
   address=self.output+4+i*32;normal=dict(zip('xyz',self.read(address,'3f')));node=self.read(address+28,'I')[0]
   result.append({'normal':normal,**({'height':self.read(address+16,'f')[0]} if kind=='ground' else {'point':dict(zip('xyz',self.read(address+12,'3f')))}),'node':self.paths.get(node,hex(node))})
  return result

if __name__=='__main__':
 import json
 n=SceneQueries();data,root=n.load_subtree(6,'g1/walls/t21/g3535');print('nodes',n.nodes)
 for z in [-575.8,-575.9049072265625,-576,-576.01,-577]:print('ground',z,json.dumps(n.query('ground',x=480,z=z)))
 print('sweep',n.query('sweep',**{'from':{'x':480,'y':19.5,'z':-567},'to':{'x':480,'y':19.5,'z':-577}}))
