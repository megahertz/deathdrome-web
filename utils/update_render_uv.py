"""Add native render UV metadata while preserving existing geometry and queries."""
import hashlib,json
from export_models import decode,files,OUT,ROOT

def unchanged_fields(data):
    return {**data,'meshes':[{k:v for k,v in face.items() if k!='renderPolygons'} for face in data['meshes']]}

def main():
    changes=[]
    for path in sorted(OUT.glob('*.json')):
        source=files[path.stem+'.gam'];data=json.loads(path.read_text())
        before=json.dumps(unchanged_fields(data),separators=(',',':'))
        fresh=decode(source,'arena/textures');faces={f['name']:f for f in fresh['meshes']}
        remapped=0
        for face in data['meshes']:
            new=faces[face['name']]
            if face['texture']:
                mapping=[]
                for point in new['v']:
                    candidates=[i for i,p in enumerate(face['v']) if sum((p[k]-point[k])**2 for k in range(3))<1e-8]
                    assert candidates,(path,face['name'],point)
                    index=min(candidates,key=lambda i:sum((face['v'][i][k]-point[k])**2 for k in [3,4]))
                    assert sum((face['v'][index][k]-point[k])**2 for k in [3,4])<1e-8,(path,face['name'])
                    mapping.append(index)
                if mapping!=list(range(len(face['v']))):remapped+=1
                face['renderPolygons']=[{**p,'indices':[mapping[i] for i in p['indices']]} for p in new['renderPolygons']]
        assert before==json.dumps(unchanged_fields(data),separators=(',',':')),path
        path.write_text(json.dumps(data,separators=(',',':')))
        changes.append({'model':path.stem,'unchangedFieldsSha256':hashlib.sha256(before.encode()).hexdigest(),
            'texturedFaces':sum(bool(f['texture']) for f in data['meshes']),'facesWithCleanedVertexRemapping':remapped})
    (ROOT/'private/verification/render-uv-metadata-update.json').write_text(json.dumps({'scope':__doc__,'models':changes,'passed':True},indent=2)+'\n')
    print(json.dumps({'models':len(changes),'geometryAndQueryFieldsUnchanged':True}))

if __name__=='__main__':main()
