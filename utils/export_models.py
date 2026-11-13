"""Decode DeathDrome's big-endian GameGen records into browser-readable meshes."""
from pathlib import Path
import struct,json,math,re
ROOT=Path(__file__).resolve().parents[1]; SOURCE=ROOT/'private/original/game/DATA'; OUT=ROOT/'private/assets/models'; OUT.mkdir(exist_ok=True)
ID=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
def mul(a,b):return [sum(a[k*4+r]*b[c*4+k] for k in range(4)) for c in range(4) for r in range(4)]
def trans(m,v):return [sum(m[k*4+r]*v[k] for k in range(3))+m[12+r] for r in range(3)]
def f32(v):return struct.unpack('<f',struct.pack('<f',v))[0]
def polygon_plane(vertices):
 # 462624: Newell sums and length/reciprocal are stored as floats.
 normal=[0.,0.,0.];total=[0.,0.,0.]
 for i,a in enumerate(vertices):
  b=vertices[(i+1)%len(vertices)]
  normal=[f32(normal[0]+(a[1]-b[1])*(a[2]+b[2])),f32(normal[1]+(a[2]-b[2])*(a[0]+b[0])),f32(normal[2]+(a[0]-b[0])*(a[1]+b[1]))]
  total=[f32(total[k]+a[k]) for k in range(3)]
 length=f32(math.sqrt(sum(x*x for x in normal)));inverse=f32(1/length) if length else 0.
 return [f32(x*inverse) for x in normal]+[f32(-sum(total[k]*normal[k] for k in range(3))/f32(len(vertices)*length)) if length else float('nan')]
def polygon_planar(vertices):
 plane=polygon_plane(vertices)
 return all(not abs(((p[1]*plane[1]+p[0]*plane[0])+p[2]*plane[2])+plane[3])>.05 for p in vertices)
def texture_slopes(points,values):
 # 463a04 fits a scalar to the first three projected vertices. The first
 # product for the second coefficient retains an unrounded X difference.
 a=[f32(points[0][k]-points[1][k]) for k in [0,1]]+[f32(values[0]-values[1])]
 b=[f32(points[2][k]-points[1][k]) for k in [0,1]]+[f32(values[2]-values[1])]
 nx=f32(a[1]*b[2]-a[2]*b[1]);ny=f32(a[2]*(points[2][0]-points[1][0])-a[0]*b[2]);nz=f32(a[0]*b[1]-a[1]*b[0])
 inverse=f32(1/nz) if nz else 0.
 return [f32(-nx*inverse),f32(-ny*inverse)]
def fit_polygon_uv(vertices,uv):
 if len(vertices)<=3:return uv
 # 463b00 selects the dominant normal axis, fits U/V to the first three
 # vertices, then recomputes every later UV on that plane.
 a,b,c=vertices[:3];u=[f32(a[i]-b[i]) for i in range(3)];v=[f32(c[i]-b[i]) for i in range(3)]
 normal=[f32(v[1]*u[2]-v[2]*u[1]),f32(v[2]*(a[0]-b[0])-v[0]*u[2]),f32(v[0]*u[1]-v[1]*u[0])]
 axis=max(range(3),key=lambda i:abs(normal[i]));axes=[i for i in range(3) if i!=axis]
 points=[[p[i] for i in axes] for p in vertices];slopes=[texture_slopes(points[:3],[p[k] for p in uv[:3]]) for k in [0,1]]
 return uv[:3]+[[f32(uv[0][k]+(p[0]-points[0][0])*slopes[k][0]+(p[1]-points[0][1])*slopes[k][1]) for k in [0,1]] for p in points[3:]]
def render_polygons(vertices):
 # 462e34 fans non-planar faces; faces over the 48-vertex import limit
 # are split into overlapping four-vertex fans by 462a60.
 indices=list(range(len(vertices)))
 if len(vertices)>3 and not polygon_planar(vertices):pieces=[[0,i,i+1] for i in range(1,len(vertices)-1)]
 elif len(vertices)>48:pieces=[[0]+list(range(i,min(i+3,len(vertices)))) for i in range(1,len(vertices)-1,2)]
 else:pieces=[indices]
 result=[]
 ceiling=math.ceil(max(v[4] for v in vertices))
 flipped=[[f32(v[3]),f32(ceiling-v[4])] for v in vertices]
 for piece in pieces:
  uv=[flipped[i] for i in piece]
  # 46317f removes the integer origin before 462d24's fixed-grid rounding.
  origin=[math.floor(min(p[k] for p in uv)) for k in range(2)]
  uv=[[f32(p[k]-origin[k]) for k in range(2)] for p in uv]
  uv=fit_polygon_uv([vertices[i] for i in piece],uv)
  uv=[[math.trunc((x+1/512)*256)/256 for x in p] for p in uv]
  origin=[math.floor(min(p[k] for p in uv)) for k in range(2)]
  result.append({'indices':piece,'uv':[[f32(p[k]-origin[k]) for k in range(2)] for p in uv]})
 return result
def clean_polygon(vertices):
 # 46247c removes a middle vertex when 462340 produces a zero normal.
 # The scan keeps vertex zero, checks the closing triple and restarts after
 # each removal. UV coordinates travel with their original vertex.
 result=[[f32(x) for x in v[:3]]+v[3:] for v in vertices]
 while len(result)>=3:
  for middle in range(1,len(result)):
   a,b,c=result[middle-1],result[middle],result[(middle+1)%len(result)]
   u=[f32(a[i]-b[i]) for i in range(3)];v=[f32(c[i]-b[i]) for i in range(3)]
   cross=[f32(v[1]*u[2]-v[2]*u[1]),f32(v[2]*(a[0]-b[0])-v[0]*u[2]),f32(v[0]*u[1]-v[1]*u[0])]
   if all(abs(x)<=.001 for x in cross):result.pop(middle);break
  else:break
 return result
def corners(bounds):
 lo,hi=bounds
 return [[(hi if x else lo)[0],(hi if y else lo)[1],(hi if z else lo)[2]] for x,y,z in [(0,0,1),(1,0,1),(1,0,0),(0,0,0),(0,1,1),(1,1,1),(1,1,0),(0,1,0)]]
files={p.name.lower():p for p in SOURCE.rglob('*') if p.suffix.lower()=='.gam'}
def decode(path,texture_dir,source_tree=False,progress=None):
 b=path.read_bytes(); p=0;root={'name':path.stem,'children':[]};stack=[root];last=root;vbase=0;vertices={};textures={};nodes=[];palette=[];instances={};instance_refs=0
 next_report=65536
 if progress:progress(0)
 while p<len(b):
  op,n=struct.unpack_from('>HH',b,p)
  if n<4 or p+n>len(b):raise ValueError((path,p,op,n))
  r=b[p:p+n]
  if op==574:palette=[list(r[i+1:i+4])[::-1] for i in range(132,len(r),4)]
  elif op==516:vbase=p
  elif op in [643,550,666,597]:
   xyz=struct.unpack_from('>3d',r,8);uv=struct.unpack_from('>2f',r,32 if op==643 else 44) if op in [643,666] else (0,0);vertices[p-vbase]=list(xyz)+list(uv)
  elif op==691:
   name=r[4:204].split(b'\0')[0].decode(errors='replace').replace('\\','/').split('/')[-1].split('.')[0].lower()
   index=struct.unpack_from('>I',r,204)[0];textures[index]=texture_dir+'/'+name+'.png'
  elif op==611:
   # Instance definitions are templates, not children of their lexical parent.
   index=struct.unpack_from('>I',r,4)[0]
   last={'name':'instance_'+str(index),'children':[]};instances[index]=last
  elif op==579:
   index=struct.unpack_from('>I',r,4)[0]
   last={'name':'instance_ref_'+str(index),'children':[],'instance':index}
   stack[-1]['children'].append(last);instance_refs+=1
  elif op==609:stack.append(last)
  elif op==526:
   if len(stack)>1:stack.pop()
  elif op in [644,638,522,583,545]:
   last={'name':r[4:12].split(b'\0')[0].decode(errors='replace'),'children':[],'op':op,'recordOffset':p}
   if op==522:last['near']=struct.unpack_from('>d',r,24)[0]
   if op==583:last['drawType']=r[18];last['textureWhite']=bool(r[19]);last['transparency']=struct.unpack_from('>H',r,40)[0];last['colorCode']=struct.unpack_from('>H',r,20)[0];last['texture']=struct.unpack_from('>h',r,28)[0];last['flags']=struct.unpack_from('>I',r,44)[0]
   if op==545:last['external']=r[4:204].split(b'\0')[0].decode(errors='replace').replace('\\','/').split('/')[-1].lower()
   stack[-1]['children'].append(last);nodes.append(last)
  elif op==525:last['matrix']=list(struct.unpack_from('>16f',r,4))
  elif op==548:stack[-1]['vertices']=[vertices[x] for x in struct.unpack_from('>'+str((n-4)//4)+'I',r,4)]
  elif op==690:last['comment']=r[4:].split(b'\0')[0].decode(errors='replace')
  elif op==556:last['name']=r[4:].split(b'\0')[0].decode(errors='replace')
  p+=n
  if progress and p>=next_report:
   progress(.25*p/max(1,len(b)));next_report=p+65536
 if progress:progress(.25)
 meshes=[];markers=[];attachments={};collision_boxes=[];bounds_cache={};world_objects={};world_groups={};contact_ranks={};leaf_broad_phases={}
 work_cache={}
 def work(node):
  key=id(node)
  if key in work_cache:return work_cache[key]
  count=1 if node.get('near',0)>0 else 1+sum(work(c) for c in node['children'])+(work(instances[node['instance']]) if 'instance' in node else 0)
  work_cache[key]=count;return count
 work_total=work(root) if progress else 1;work_done=0;next_work_report=max(1,work_total//200)
 def query_children(node):return [c for c in node['children'] if (c.get('op') in [644,638,522,545] or 'instance' in c) and 'worldchild' not in c.get('comment','').lower()]
 def local_bounds(node,depth=0):
  if depth>100:raise ValueError(('Cyclic bounding hierarchy',path))
  if id(node) in bounds_cache:return bounds_cache[id(node)]
  if 'external' in node:return None
  points=[p[:3] for p in clean_polygon(node.get('vertices',[]))]
  children=node['children']+([instances[node['instance']]] if 'instance' in node else [])
  for child in children:
   bounds=local_bounds(child,depth+1)
   if bounds:points.extend([[f32(x) for x in trans(child.get('matrix',ID),v)] for v in corners(bounds)])
  bounds=([min(p[i] for p in points) for i in range(3)],[max(p[i] for p in points) for i in range(3)]) if points else None
  bounds_cache[id(node)]=bounds;return bounds
 def has_cockpit(node):
  return node['name']=='cockpit' or any(has_cockpit(c) for c in node['children'])
 def runner_bounds_tree(node):
  # Keep only the animated cockpit ancestry. Fixed subtrees can be reduced
  # to their native-order aggregate bounds, including every stored LOD.
  result={}
  if node.get('matrix',ID)!=ID:result['matrix']=node['matrix']
  if node['name']=='cockpit':result.update(animated='cockpit',bounds=local_bounds(node))
  elif not has_cockpit(node):result['bounds']=local_bounds(node)
  else:
   result['children']=[runner_bounds_tree(c) for c in node['children'] if local_bounds(c)]
   points=[p[:3] for p in clean_polygon(node.get('vertices',[]))]
   if points:result['bounds']=([min(p[i] for p in points) for i in range(3)],[max(p[i] for p in points) for i in range(3)])
  return result
 def animated_bounds_tree(node):
  # Preserve each runtime rotation pivot; fixed branches retain all stored LODs.
  animated={'yaw','chassis','cockpit'}
  def dynamic(n):return n['name'] in animated or any(dynamic(c) for c in n['children'])
  result={}
  if node.get('matrix',ID)!=ID:result['matrix']=node['matrix']
  if node['name'] in animated:result['animated']=node['name']
  if not any(dynamic(c) for c in node['children']):result['bounds']=local_bounds(node)
  else:
   result['children']=[animated_bounds_tree(c) for c in node['children'] if local_bounds(c)]
   points=[p[:3] for p in clean_polygon(node.get('vertices',[]))]
   if points:result['bounds']=([min(p[i] for p in points) for i in range(3)],[max(p[i] for p in points) for i in range(3)])
  return result
 for key,path_name in list(textures.items()):
  if not (ROOT/'private/assets'/path_name).exists():
   candidates=list((ROOT/'private/assets').rglob(Path(path_name).name))
   candidates.sort(key=lambda p:('ar1' not in str(p),str(p)))
   if candidates:textures[key]=str(candidates[0].relative_to(ROOT/'private/assets'))
 def walk(node,m,ancestry,altitude=True,intersect=True,depth=0,owner=None,identity='root',box_owner=None,world_owner=None,parent_count=1):
  nonlocal work_done,next_work_report
  if depth>100:raise ValueError(('Cyclic model hierarchy',path))
  if progress:
   work_done+=1
   if work_done>=next_work_report:
    progress(.25+.70*work_done/work_total);next_work_report=work_done+max(1,work_total//200)
  if node.get('near',0)>0:return
  m=mul(m,node.get('matrix',ID));name=node['name'];ancestry=ancestry+[name]
  identity=identity+'/'+str(node.get('recordOffset',name))
  if node.get('op') in [644,638,522,545] or owner is None:
   owner=identity;contact_ranks[identity]=len(contact_ranks);leaf_broad_phases[identity]=parent_count>1 and not query_children(node)
  if name in ['yaw','chassis','cockpit','hulk_parent','dedbody','fire'] or re.fullmatch(r'\d{3}_\d{2}',name):attachments[name]={'matrix':m,'position':trans(m,[0,0,0])}
  if name=='chassis' and path.stem.lower() in ['redrunr','blurunr','ylwrunr','whtrunr','prprunr','grnrunr','pnkrunr','orgrunr']:attachments[name]['collisionBounds']=runner_bounds_tree(node)
  comment=node.get('comment','').lower()
  if 'worldchild' in comment:
   world_owner=identity
   world_groups[identity]={'name':name,'order':len(world_groups)}
   bounds=local_bounds(node)
   if bounds:
    points=[[f32(x) for x in trans(m,v)] for v in corners(bounds)]
    world_objects[identity]={**world_groups[identity],'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)]}
  if 'altitude_off' in comment:altitude=False
  if 'altitude_on' in comment:altitude=True
  if 'intersect_off' in comment:intersect=False
  if 'intersect_on' in comment:intersect=True
  if 'intersect_bbox' in comment and box_owner is None:
   bounds=local_bounds(node)
   if bounds:
    box_owner=identity
    collision_boxes.append({'name':'/'.join(ancestry)+'/__bbox','contactObject':identity,'contactRank':contact_ranks[owner],'worldObject':world_owner,'vertices':[[f32(x) for x in trans(m,v)] for v in corners(bounds)],'intersect':intersect,'source':'GameGen intersect_bbox comment'})
  if 'vertices' in node:
   vs=clean_polygon(node['vertices']); pts=[[f32(x) for x in trans(m,v)] for v in vs]
   if len(pts)>=3:
    meshes.append({'name':'/'.join(ancestry),'contactObject':owner,'contactOrder':len(meshes),'contactRank':contact_ranks[owner],'shapeBroadPhase':leaf_broad_phases.get(owner,False),'worldObject':world_owner,'intersectBox':box_owner,'texture':textures.get(node.get('texture')),'v':[pt+v[3:] for pt,v in zip(pts,vs)],'altitude':altitude,'intersect':intersect,'flags':node.get('flags',0),'drawType':node.get('drawType',0),'textureWhite':node.get('textureWhite',False),'transparency':node.get('transparency',0),'color':[round(c/255*((node.get('colorCode',127)&127)/127),5) for c in palette[min(len(palette)-1,node.get('colorCode',127)>>7)]] if palette else [1,1,1]})
    if meshes[-1]['texture']:meshes[-1]['renderPolygons']=render_polygons(vs)
  if 'external' in node:
   markers.append({'name':node['external'],'matrix':m,'position':trans(m,[0,0,0]),'contactRank':contact_ranks[owner],'worldObject':world_owner})
  if 'instance' in node:
   walk(instances[node['instance']],m,ancestry,altitude,intersect,depth+1,owner,identity,box_owner,world_owner,1)
  count=len(query_children(node))
  for ch in node['children']:walk(ch,m,ancestry,altitude,intersect,depth+1,owner,identity,box_owner,world_owner,count)
 walk(root,ID,[])
 result={'source':str(path.relative_to(ROOT)),'meshes':meshes,'worldObjects':world_objects,'worldGroups':world_groups,'collisionBoxes':collision_boxes,'markers':markers,'attachments':attachments,'textures':textures,'recordBytes':len(b),'instanceDefinitions':len(instances),'instanceReferences':instance_refs}
 if path.stem.lower() in ['redrunr','blurunr','ylwrunr','whtrunr','prprunr','grnrunr','pnkrunr','orgrunr']:result['queryBounds']=animated_bounds_tree(root)
 if source_tree:result.update(sourceTree=root,sourceInstances=instances)
 if progress:progress(.95)
 return result
def main():
 report=globals().get('_model_progress');total=sum(p.stat().st_size for p in files.values());completed=0
 if report:report(0,total)
 for name,p in files.items():
  if name.startswith('arena') and name[5:6].isdigit():td='arena/textures/ar'+name[5:6]
  elif 'runners' in str(p).lower():td='runners/textures'
  elif 'effects' in str(p).lower():td='effects/textures'
  else:td='arena/textures'
  size=p.stat().st_size
  notify=(lambda fraction:report(completed+size*fraction,total)) if report else None
  data=decode(p,td,progress=notify);(OUT/(p.stem.lower()+'.json')).write_text(json.dumps(data,separators=(',',':')))
  completed+=size
  if report:report(completed,total)
  print(p.name,len(data['meshes']),len(data['markers']))
if __name__=='__main__':main()
