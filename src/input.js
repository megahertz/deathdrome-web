// Physical key codes also work while the user's keyboard layout is Cyrillic.
// WASD is an intentional addition; rear view moves from A to Q to avoid a turn.
export function readControls(keys){
 const has=(...codes)=>codes.some(code=>keys.has(code));
 return {throttle:Number(has('ArrowUp','KeyW'))-Number(has('ArrowDown','KeyS')),steer:Number(has('ArrowLeft','KeyA'))-Number(has('ArrowRight','KeyD')),fire:has('AltLeft','AltRight'),jump:has('Space'),barrier:has('ControlLeft','ControlRight'),lookLeft:has('KeyE'),lookRight:has('KeyR'),brake:has('KeyB'),rearView:has('KeyQ')};
}
export class KeyPressLatch{
 constructor(...codes){this.codes=codes;this.reset()}
 reset(){this.down=new Set();this.held=false}
 step(keys){const down=new Set(this.codes.filter(code=>keys.has(code))),pressed=[...down].some(code=>!this.down.has(code));this.down=down;this.held=down.size>0;return pressed}
}
