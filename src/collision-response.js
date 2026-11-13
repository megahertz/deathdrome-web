// Native 432bb8 with a supplied collision record. Query selection and the
// candidate-position rejection test are separate scene-engine operations.
const f=Math.fround,PI=3.141592654;
const vec=v=>({x:f(v.x),y:f(v.y??0),z:f(v.z)});
const add=(a,b)=>({x:f(a.x+b.x),y:f(a.y+b.y),z:f(a.z+b.z)});
const sub=(a,b)=>({x:f(a.x-b.x),y:f(a.y-b.y),z:f(a.z-b.z)});
const scale=(a,k)=>({x:f(a.x*k),y:f(a.y*k),z:f(a.z*k)});
function normalizePlanar(v){let length=f(Math.sqrt(v.x*v.x+v.z*v.z)),inverse=length?f(1/length):0;return {x:f(v.x*inverse),y:v.y,z:f(v.z*inverse)}}
function reflect(normal,v){let dot=f(normal.y*v.y+normal.x*v.x+normal.z*v.z);if(!dot)return scale(v,-1);let projection=scale(normal,-dot);return add(projection,add(v,projection))}
export function collisionResponse(r,contact,{dt=1/60,rejected=false,rejectCandidate=null,special=false,human=false}={}){
 const effects={applied:false,damage:0,landingCalls:0};
 if(r.movementEnabled===false&&f(-r.speed)<=0)return effects;
 let normal=vec(contact.normal),point=vec(contact.point),endpoint=vec(contact.endpoint),world=vec(r.worldVelocity),previous=vec(r.previousPosition),position=vec(r),forward=vec(r.forwardVector);
 if(!special&&normal.y<f(-.15)&&world.y>0){world.y=f(-world.y);r.frontVelocity=world.y;r.sideVelocity=world.y;endpoint.y=Math.min(endpoint.y,f(point.y-2));r.worldVelocity=world;r.vy=world.y}
 if(r.actionMode===2){r.actionMode=r.previousActionMode;if(human)effects.landingCalls++}
 if(!normal.x&&!normal.z)return effects;
 effects.applied=true;
 let length=f(Math.sqrt(f(r.localVerticalSpeed??0)**2+f(r.lateralSpeed??0)**2+f(-r.speed)**2)),height=position.y;
 endpoint.y=0;point.y=0;normal.y=0;
 let incoming=sub(endpoint,point),incomingUnit=normalizePlanar(incoming),reflected=reflect(normal,incoming),candidate=add(position,sub(add(point,reflected),endpoint));
 if(rejectCandidate?rejectCandidate(r,candidate):rejected){position=previous;forward=vec(r.previousForwardVector);r.forwardVector=forward;r.planarForwardVector={...r.previousPlanarForwardVector};r.collisionMinimumSpeed=f(f(r.collisionMinimumSpeed??0)+50)}
 else{position=candidate;position.y=height;r.collisionMinimumSpeed=10}
 r.x=position.x;r.y=position.y;r.z=position.z;r.deltaX=f((position.x-previous.x)*1.5);r.deltaZ=f((position.z-previous.z)*1.5);
 const yStep=f(f(dt)*f(r.frontVelocity??0)),forwardY=f(forward.y*8);
 r.collisionProbe={x:f(position.x+forward.x*8),y:Math.max(0,f(f(position.y+yStep)+forwardY)),z:f(position.z+forward.z*8)};
 const direction=normalizePlanar(reflected),speed=Math.max(length,r.collisionMinimumSpeed),velocity=scale(direction,f(speed*.5));velocity.y=world.y;r.worldVelocity=velocity;r.vy=velocity.y;
 const yaw=f(r.yaw*180/Math.PI),angle=-yaw*PI/180,c=f(Math.cos(angle)),s=f(Math.sin(angle));
 r.lateralSpeed=f(velocity.z*s+velocity.x*c);r.localVerticalSpeed=velocity.y;r.speed=-f(-velocity.x*s+velocity.z*c);
 const cross=f(f(direction.x*incomingUnit.z)-f(incomingUnit.x*direction.z));r.turn=f(f(r.turn*180/Math.PI)+Math.sign(cross)*speed*9)*Math.PI/180;
 if(speed>50)effects.damage=4;
 effects.speed=speed;effects.normal=normal;return effects;
}
