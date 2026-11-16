"""Compare JS drawing with native projected draws of all menu runner models.

Native model import, scene transforms, LOD selection, backface eligibility,
clipping and material selection generate the draw inputs. JavaScript currently
replays those inputs; this does not prove its own scene setup or selection.
Original texture bytes are read locally and not saved into the report.
"""
import json,subprocess,hashlib,base64
from native_menu_renderer import MenuRenderer
from native_ai_audit import ROOT,EXE
NAMES=['redrunr','blurunr','ylwrunr','whtrunr','prprunr','grnrunr','pnkrunr','orgrunr']

def main():
    fixtures=[];texture_sets={};unsupported=[]
    for name in NAMES:
        n=MenuRenderer(name)
        textures={};keyed=set()
        for key,desc in n.textures.items():
            size,width,height,flags,extra,lw,lh,pointer=n.read(desc,'IHHBBBBI')
            textures[str(key)]={'width':width,'height':height,'pixels':base64.b64encode(bytes(n.cpu.mem_read(pointer,size))).decode()}
            if extra&1:keyed.add(key)
        texture_sets[name]=textures
        for angle in [0,30,60,90,180,270]:
            n.call(0x45a54c,[0,angle,0],eax=n.root);pixels=n.render()
            for draw in n.draws:
                if draw.get('shaded'):unsupported.append({'name':name,'angle':angle,'kind':'shaded draw'})
                if draw.get('textureID') in keyed:unsupported.append({'name':name,'angle':angle,'textureID':draw['textureID'],'kind':'keyed draw'})
            fixtures.append({'name':name,'angle':angle,'draws':n.draws,'nativeHash':hashlib.sha256(pixels).hexdigest()})
        print(name,'complete',flush=True)
    js="""import {SpanBuffer} from './src/span-buffer.ts';import {drawIndexedTexturePolygon} from './src/texture-spans.ts';import {drawOpaqueSolidPolygon} from './src/solid-spans.ts';import {createHash} from 'node:crypto';let input='';for await(const c of process.stdin)input+=c;const q=JSON.parse(input);for(const textures of Object.values(q.textures))for(const t of Object.values(textures))t.pixels=Buffer.from(t.pixels,'base64');console.log(JSON.stringify(q.fixtures.map(f=>{const target=new Uint8Array(64000),spans=new SpanBuffer(200);for(const p of f.draws){const options={spanBuffer:spans,weightedUV:true,delta:16,far:64,priorityBias:p.priorityBias};if(p.kind==='solid')drawOpaqueSolidPolygon(target,320,p.vertices,p.color,options);else drawIndexedTexturePolygon(target,320,p.vertices,q.textures[f.name][p.textureID],options)}return createHash('sha256').update(target).digest('hex')})));"""
    result=json.loads(subprocess.run(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],cwd=ROOT,input=json.dumps({'fixtures':fixtures,'textures':texture_sets}),text=True,capture_output=True,check=True).stdout)
    rows=[{'runner':f['name'],'heading':f['angle'],'draws':len(f['draws']),'solidDraws':sum(d['kind']=='solid' for d in f['draws']),'nativeHash':f['nativeHash'],'javascriptHash':actual,'matches':actual==f['nativeHash']} for f,actual in zip(fixtures,result)]
    report={'scope':__doc__,'executableSha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'sceneCases':len(rows),'nativeDraws':sum(r['draws'] for r in rows),'comparedIndexBytes':len(rows)*64000,'mismatchCount':sum(not r['matches'] for r in rows),'unsupported':unsupported,'passed':not unsupported and all(r['matches'] for r in rows),'cases':rows,'limits':['Draw vertices, material values, priority bias and order are supplied by original scene code. JavaScript camera/model transforms, visibility, LOD eligibility and whole production-menu equivalence remain unverified.','Native texture-bank lookup and framebuffer allocation use host storage; no native host graphics presentation or gameplay loop runs.']}
    (ROOT/'private/verification/menu-scene-draws-native.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ['sceneCases','nativeDraws','comparedIndexBytes','mismatchCount','unsupported','passed']},indent=2))
    if not report['passed']:raise SystemExit(1)
if __name__=='__main__':main()
