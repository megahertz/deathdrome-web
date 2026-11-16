#!/usr/bin/env python3
"""Compare native four-cell inventory writes, selection and retained values."""
import hashlib,json,random,struct,subprocess
from unicorn import __version__,UC_HOOK_CODE
from unicorn.x86_const import UC_X86_REG_EDX
from native_ai_audit import Native,ROOT,EXE,RUNNER
names=['Nitro Ram','Missile','ShockWave','Disruptor',None,'Ion Sword','NanoShield']
random.seed(1996)
states=[dict(cells=[4,0,0,0],count=1,selected=0,human=True),dict(cells=[4,1,5,6],count=2,selected=1,human=True),dict(cells=[4,1,1,1],count=3,selected=1,human=True),dict(cells=[4,1,1,1],count=3,selected=1,human=False)]
states += [dict(cells=[4]+[random.randrange(7) for _ in range(3)],count=count,selected=selected,human=bool(random.randrange(2))) for count in range(1,5) for selected in range(count)]
fixtures=[]
for state in states:
 for action in [dict(kind='append',weapon=i) for i in [0,1,2,3,5,6]]+[dict(kind='consume'),dict(kind='cycle'),dict(kind='reset')]:fixtures.append(dict(state=state,actions=[action]))
fixtures.append(dict(state=states[0],actions=[dict(kind='coldReset')]))
fixtures.append(dict(state=states[0],actions=[dict(kind='append',weapon=1),dict(kind='append',weapon=5),dict(kind='append',weapon=6),dict(kind='cycle'),dict(kind='consume'),dict(kind='append',weapon=6),dict(kind='cycle'),dict(kind='cycle'),dict(kind='consume'),dict(kind='reset'),dict(kind='append',weapon=3)]))
native=[]
for fixture in fixtures:
 n=Native();s=fixture['state'];n.write(RUNNER+0x498,'4I',*s['cells']);n.write(RUNNER+0x4a8,'II',s['selected'],s['count']);n.write(RUNNER+0x6f8,'I',RUNNER+0x4000);n.cpu.mem_write(0x434ad4,b'\xb8'+struct.pack('<I',RUNNER)+b'\xc3');n.cpu.mem_write(0x418f68,b'\xb8'+struct.pack('<I',0 if s['human'] else 1)+b'\xc3')
 for address in [0x4156d0,0x4182f4,0x418990,0x41598c]:n.cpu.mem_write(address,b'\xc3')
 for address in [0x418720,0x418728]:n.cpu.mem_write(address,b'\xd9\xee\xc3')
 points=[]
 def score(cpu,address,size,data):points.append(cpu.reg_read(UC_X86_REG_EDX))
 n.cpu.hook_add(UC_HOOK_CODE,score,begin=0x418990,end=0x418990);samples=[]
 for action in fixture['actions']:
  points.clear();kind=action['kind']
  if kind=='append':n.call(0x437284,eax=0,edx=action['weapon'])
  elif kind=='consume':n.call(0x43738c,eax=0)
  elif kind=='cycle':n.call(0x43733c,eax=RUNNER)
  else:
   if kind=='coldReset':n.cpu.mem_write(RUNNER,b'\xaa'*0x70c);n.call(0x443cb0,eax=RUNNER,edx=0,ebx=0x70c)
   n.call(0x437434,eax=RUNNER)
  cells=list(n.read(RUNNER+0x498,'4I'));selected,count=n.read(RUNNER+0x4a8,'II');samples.append(dict(cells=cells,count=count,selected=selected,weapon=cells[selected],target=1 if n.read(RUNNER+0x6f8,'I')[0] else None,score=sum(points)))
 native.append(samples)
js="""
import {inventoryCells,selectInventoryWeapon,appendWeapon,consumeWeapon,resetInventory,cycleInventory,WEAPON_NAMES,weaponCode} from './src/inventory.ts';let s='';for await(let x of process.stdin)s+=x;
console.log(JSON.stringify(JSON.parse(s).map(({state,actions})=>{let r={weaponCells:[...state.cells],weapons:state.cells.slice(0,state.count).map(i=>WEAPON_NAMES[i]),selectedWeapon:state.selected,missileLockTarget:1};selectInventoryWeapon(r);return actions.map(action=>{let score=0;if(action.kind==='append'){let result=appendWeapon(r,WEAPON_NAMES[action.weapon]);if(result.matching&&state.human)score=2000}else if(action.kind==='consume')consumeWeapon(r);else if(action.kind==='cycle')cycleInventory(r);else{if(action.kind==='coldReset')r={weapons:[null]};resetInventory(r)}return {cells:[...inventoryCells(r)],count:r.weapons.length,selected:r.selectedWeapon,weapon:weaponCode(r.weapon),target:r.missileLockTarget??null,score}})})));
"""
rebuilt=json.loads(subprocess.check_output(['node','--import','./utils/tests/setup.ts','--input-type=module','-e',js],input=json.dumps(fixtures).encode(),cwd=ROOT));mismatches=[dict(fixture=i,native=a,rebuild=b) for i,(a,b) in enumerate(zip(native,rebuilt)) if a!=b]
report=dict(scope='Actual original inventory append 437284, consumption 43738c, cycle 43733c, reset 437434 and cold-clear helper 443cb0. All four cells, active count/selection, shared pointer and matching-bonus score are compared.',sha256=hashlib.sha256(EXE.read_bytes()).hexdigest(),emulator='Unicorn '+__version__,fixtures=fixtures,native=native,rebuild=rebuilt,operations=sum(len(f['actions']) for f in fixtures),mismatches=mismatches,passed=not mismatches,limitations=['Model lookup and human/AI profile type are supplied; audio, HUD and score-delivery calls are stubbed. Score amounts are captured at the original call.','Reset factor getters return supplied zero values; only inventory/selection/shared-pointer state is compared.','Respawn/reset call chain is established separately from disassembly, not executed as a complete native scene here.','Does not compare deferred projectile consumption, full input scheduling or rendered frames.'])
(ROOT/'private/verification/inventory-native-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(fixtures=len(fixtures),operations=report['operations'],mismatches=mismatches,passed=not mismatches),indent=2))
if mismatches:raise SystemExit(1)
