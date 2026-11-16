"""Compare the complete original attack action's firing and weapon-cycle gates.

Synthetic clear forward probes, target pose and inventory are supplied. Weapon
launch effects are counted at the real dispatch entry; actual projectile motion
and scene visibility have separate audits. No original difficulty is increased.
"""
import json,struct,math,hashlib,subprocess
from unicorn import UC_HOOK_CODE
from native_ai_audit import Native,ROOT,EXE,RUNNER,f32
TARGET=RUNNER+0x6000

def main():
    fixtures=[];native=[]
    rows=[]
    for line in (ROOT/'private/original/game/RUN/ag_lev.txt').read_text().splitlines():
        text=line.split('#',1)[0].strip()
        if text and not text.startswith('\x1a'):rows.append([f32(float(x)) for x in text.split()])
    assert len(rows)==5 and all(len(row)==8 for row in rows)
    for level in range(8):
      for weapon in range(7):
       for variant in ['clear','disabled','near','far','side','remote-wall']:
        n=Native();calls=[]
        for i,row in enumerate(rows):n.write(0x48f020+i*32,'8f',*row)
        n.cpu.mem_write(0x431d88,b'\xc3');n.cpu.mem_write(0x4156d0,b'\xc3')
        n.cpu.mem_write(0x434ad4,b'\xb8'+struct.pack('<I',RUNNER)+b'\xc3');n.cpu.mem_write(0x43753c,b'\xc3')
        def fire(cpu,address,size,data):
            selected=n.read(RUNNER+0x4a8,'I')[0];calls.append(n.read(RUNNER+0x498+selected*4,'I')[0])
        n.cpu.hook_add(UC_HOOK_CODE,fire,begin=0x43753c,end=0x43753c)
        tx,tz=(100,50)
        if variant=='near':tz=90
        if variant=='far':tz=0
        if variant=='side':tx,tz=150,100
        selected=int(weapon!=4);cells=[4,weapon,0,0];count=2 if selected else 1
        n.write(RUNNER,'I',1);n.write(RUNNER+0x2c,'3f',100,0,100);n.write(RUNNER+0x80,'6f',0,0,-1,0,0,-1);n.write(RUNNER+0xfc,'2f',185,80)
        n.write(RUNNER+0x180,'f',-100);n.write(RUNNER+0x1ea,'B',1);n.write(RUNNER+0x1f4,'f',100);n.write(RUNNER+0x1f8,'3f',0,0,-1);n.write(RUNNER+0x224,'f',0);n.write(RUNNER+0x234,'I',TARGET);n.write(RUNNER+0x244,'B',1)
        n.write(RUNNER+0x498,'4I',*cells);n.write(RUNNER+0x4a8,'2I',selected,count)
        n.write(TARGET+0x15e,'B',1);n.write(TARGET+0x2c,'3f',tx,0,tz);n.write(TARGET+0x198,'f',-30)
        n.write(0x48f018,'I',level);n.write(0x48f00c,'I',int(variant!='disabled'));n.write(0x518aa4,'2f',7,f32(1/60))
        n.call(0x42befc,eax=RUNNER)
        fixtures.append({'level':level,'weapon':weapon,'variant':variant,'target':[tx,tz],'selected':selected,'count':count,'cells':cells})
        native.append({'shots':calls,'selected':n.read(RUNNER+0x4a8,'I')[0],'shotAt':n.read(RUNNER+0x224,'f')[0]})
    js="""import {Simulation} from './src/simulation.ts';import {stepAIAttack} from './src/ai-actions.ts';import {GAME_TABLES} from './src/game-tables.ts';import {WEAPON_NAMES,weaponCode} from './src/inventory.ts';let input='';for await(const c of process.stdin)input+=c;const fixtures=JSON.parse(input);console.log(JSON.stringify(fixtures.map(f=>{const s=new Simulation(),r=s.runners[1],q=s.runners[0],shots=[];s.countdown=0;s.elapsed=0;Object.assign(r,{x:100,y:0,z:100,yaw:0,speed:30,acceleration:100,aiContact:{clear:true},weaponCells:[...f.cells],weapons:f.cells.slice(0,f.count).map(id=>WEAPON_NAMES[id]),selectedWeapon:f.selected});s.selectWeapon(r);Object.assign(q,{x:f.target[0],y:0,z:f.target[1],speed:30});Object.assign(r.aiState,{shotAt:0,previousDirection:{x:0,z:-1}});s.sceneContacts=()=>[];s.lineBlocked=()=>f.variant==='remote-wall';s.fire=()=>shots.push(4);s.secondary=()=>shots.push(weaponCode(r.weapon));stepAIAttack(s,r,q,{...GAME_TABLES.ai.levels[f.level],shootEnabled:f.variant!=='disabled'});return {shots,selected:r.selectedWeapon,shotAt:Math.fround(r.aiState.shotAt)}})));"""
    actual=json.loads(subprocess.run(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],cwd=ROOT,input=json.dumps(fixtures),capture_output=True,text=True,check=True).stdout)
    mismatches=[{'fixture':i,'input':f,'native':expected,'javascript':got} for i,(f,expected,got) in enumerate(zip(fixtures,native,actual)) if expected!=got]
    report={'scope':__doc__,'executableSha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),'runtimeTables':'Five aggression rows from original ag_lev.txt are installed before calling the original controller, as at game startup.','cases':len(fixtures),'fixtures':fixtures,'native':native,'mismatchCount':len(mismatches),'mismatches':mismatches[:12],'passed':not mismatches,'limits':['Original attack action and inventory cycling run; native weapon dispatch is observed but its launch effects are stubbed.','Synthetic scene probe is clear. A remote-wall fixture checks that no extra target-length ray blocks a shot after the native 20-unit probe. Full scene movement and rates need gameplay checks.']}
    (ROOT/'private/verification/ai-firing-native.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['cases','mismatchCount','mismatches','passed']},indent=2))
    if mismatches:raise SystemExit(1)
if __name__=='__main__':main()
