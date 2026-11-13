import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ResultSequence} from '../../src/presentation-sequences.js';
import {visibleResultLabels,resultAdvance} from '../../src/round-results.js';
import {Simulation} from '../../src/simulation.js';
const audit=JSON.parse(readFileSync(new URL('../../private/verification/results-sequence-native.json',import.meta.url)));
const sim={arena:1,round:1,score:8630,roundBonus:{kills:2000,time:1330,credits:0}};
test('extra-life credits and score agree with the real native presenter/profile actions for zero, one, two and capped awards',()=>{
 const report=JSON.parse(readFileSync(new URL('../../private/verification/result-credits-native.json',import.meta.url)));
 assert.equal(report.passed,true);assert.equal(report.fixtures.length,9);assert.deepEqual(new Set(report.native.map(n=>n.credits)),new Set([0,1,2]));
 for(const [i,f]of report.fixtures.entries()){
  const s=new Simulation();s.score=f.score;s.lives=f.lives;const initialLives=s.lives;
  s.addScore(f.kills*1000);s.addScore(Math.max(0,Math.trunc(f.time))*10);
  s.roundBonus={credits:Math.max(0,s.lives-initialLives)};
  assert.deepEqual({score:s.score,lives:s.lives,credits:s.roundBonus.credits},report.native[i]);
  const labels=visibleResultLabels(s,{rows:3}),credit=labels.find(l=>l.x===225&&l.y===125);
  assert.equal(credit.value,String(report.native[i].credits));
 }
});
test('every visible result label and blinking value matches 599 original presenter iterations',()=>{
 const native=audit.runs.find(r=>!r.network&&!r.keyFrame),sounds=[],sequence=new ResultSequence({onRow:()=>sounds.push({frame:Math.round(sequence.seconds*60),id:11})});
 for(const frame of native.frames){
  sequence.step(1/60);
  if(frame.frame===native.endFrame){assert.equal(sequence.finished,true);break}
  assert.equal(sequence.finished,false);
  const labels=visibleResultLabels(sim,{rows:sequence.rows,flashingRow:sequence.flashingRow,numberVisible:sequence.numberVisible}).map(l=>({text:l.value,x:l.x,y:l.y}));
  assert.deepEqual(labels,frame.labels,'frame '+frame.frame);
 }
 assert.deepEqual(sounds,native.sounds);assert.equal(native.endFrame,600);
});
test('original fresh-key exit and automatic deadline each consume continuation once',()=>{
 for(const keyFrame of [null,200]){
  const native=audit.runs.find(r=>!r.network&&r.keyFrame===keyFrame),sequence=new ResultSequence();let ended=0,at=null;
  const advance=resultAdvance(()=>{ended++;at=frame});let frame=0;
  while(!ended&&frame<700){frame++;sequence.step(1/60);if(frame===keyFrame)advance({repeat:false});if(sequence.finished)advance()}
  assert.equal(at,native.endFrame);advance({repeat:false});assert.equal(ended,1);
 }
});
