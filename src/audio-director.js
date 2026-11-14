import {resourceURL} from './resource-urls.js';
import {DEFAULT_BRIGHTNESS} from './palette-brightness.js';
// CD tracks and WAVs are the original disc recordings. Music has its own
// switch: M never disables speech, weapons, or menu feedback.
export const DEFAULT_OPTIONS={detail:9,brightness:DEFAULT_BRIGHTNESS,musicVolume:4,sfxVolume:7,musicEnabled:true,enhancedGraphics:false};
export function readOptions(value={}){
 value=value&&typeof value==='object'?value:{};
 const result={...DEFAULT_OPTIONS};
 for(const key of ['detail','brightness','musicVolume','sfxVolume']){
  if(Number.isFinite(value[key]))result[key]=Math.max(0,Math.min(9,Math.round(value[key])));
 }
 for(const key of ['musicEnabled','enhancedGraphics'])if(typeof value[key]==='boolean')result[key]=value[key];
 return result;
}
export class AudioDirector{
 constructor({options={},musicTracks=null,musicExtension='ogg',createAudio=src=>new Audio(src),onChange=()=>{}}={}){
  this.musicTracks=musicTracks;this.musicExtension=musicExtension;this.options=readOptions(options);this.createAudio=createAudio;this.onChange=onChange;
  this.cache=new Map();this.effects=new Set();this.doorSounds=new Map();this.muted=false;this.suspended=false;this.unlocked=false;this.track=null;this.music=null;this.pendingEntry=false;
 }
 unlock(){
  if(this.unlocked)return;
  this.unlocked=true;this.apply();
  if(this.pendingEntry){const name=this.pendingEntry;this.pendingEntry=false;this.sound(name)}
 }
 sound(name,volume=.6){
  if(!this.unlocked){if(name==='compopen')this.pendingEntry=name;return}
  if(this.muted||!this.options.sfxVolume)return;
  if(!this.cache.has(name))this.cache.set(name,this.createAudio(resourceURL(`assets/audio/${name}.wav`)));
  const effect=this.cache.get(name).cloneNode();effect.baseVolume=volume;
  effect.volume=volume*this.options.sfxVolume/9;this.effects.add(effect);
  effect.onended=()=>this.effects.delete(effect);
  effect.play().catch(()=>this.effects.delete(effect));
  this.onChange({sound:name});return effect;
 }
 playMusic(track){
  if(this.musicTracks&&!this.musicTracks.includes(track))return;
  if(this.track!==track){this.music?.pause();this.track=track;const source=resourceURL(`assets/audio/track${String(track).padStart(2,'0')}.${this.musicExtension}`);this.music=this.createAudio(source);this.music.loop=true;const music=this.music;music.onloadedmetadata=()=>this.onChange({music:{track,source,duration:music.duration,ready:true}});music.onerror=()=>this.onChange({music:{track,source,ready:false}})}
  this.apply();
 }
 setOption(key,value){this.options=readOptions({...this.options,[key]:value});this.apply()}
 toggleMusic(){this.setOption('musicEnabled',!this.options.musicEnabled)}
 setMuted(value){this.muted=!!value;this.apply()}
 setSuspended(value){this.suspended=!!value;this.apply()}
 door(id,old,height,seconds,volume=.5){
  const opening=old<=.01&&height>old,closing=old>0&&height===0;if(!opening&&!closing)return;
  const stamp=id+(opening?'-open':'-close'),last=this.doorSounds.get(stamp)??-Infinity;if(seconds-last<=.8)return;this.doorSounds.set(stamp,seconds);
  // 43564e and 4353f4 both play gameplay-bank 0x20, low_end.wav.
  if(volume>0)return this.sound('low_end',volume);
 }
 apply(){
  if(this.music){this.music.volume=this.muted?0:this.options.musicVolume/9*.8;
   if(this.unlocked&&!this.suspended&&!this.muted&&this.options.musicEnabled&&this.options.musicVolume>0)this.music.play().catch(()=>{});else this.music.pause();
  }
  for(const effect of this.effects)effect.volume=this.muted?0:effect.baseVolume*this.options.sfxVolume/9;
  this.onChange({options:{...this.options},muted:this.muted,suspended:this.suspended,track:this.track});
 }
}
