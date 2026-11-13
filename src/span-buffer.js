// Native opaque scanline visibility (46ccf8 / 46c404), independent of texture.
const f=Math.fround,EPS=f(.0001);
export function compareSpanDepth(a,b){
 // This is an interval comparison. Crossings are not split into pixel Z tests.
 if(b.x0===b.x1){
  if(a.x0===a.x1)return a.q0+EPS>=b.q0;
  return (a.q0-a.q1)*(b.x0-a.x0)+(b.q0-a.q0)*(a.x1-a.x0)<=-EPS;
 }
 if(a.x0===a.x1)return (b.q0-b.q1)*(a.x0-b.x0)+(a.q0-b.q0)*(b.x1-b.x0)>-EPS;
 const ad=f(a.q0-a.q1),al=f(a.x1-a.x0);
 const bd0=(b.x0-a.x0)*ad+(b.q0-a.q0)*al,b0=f(bd0);
 const endB=()=> (b.x1-a.x0)*ad+(b.q1-a.q0)*al;
 if(bd0>=-EPS){const bd1=endB(),b1=f(bd1);if(bd1>=-EPS)return false;if(b0<=EPS&&b1<=EPS)return true}
 else if(b0<=EPS&&endB()<=EPS)return true;
 const bd=f(b.q0-b.q1),bl=f(b.x1-b.x0);
 const ad0=(a.x0-b.x0)*bd+(a.q0-b.q0)*bl,a0=f(ad0);
 const endA=()=> (a.x1-b.x0)*bd+(a.q1-b.q0)*bl;
 if(ad0>=-EPS){const ad1=endA(),a1=f(ad1);if(ad1>=-EPS)return true;if(a0<=EPS&&a1<=EPS)return false}
 else if(a0<=EPS&&endA()<=EPS)return false;
 let ae,be;
 if(b.x1>a.x1){ae=a.q1;be=f((a.x1-b.x0)*b.dq+b.q0)}else{be=b.q1;ae=f((b.x1-a.x0)*a.dq+a.q0)}
 let as,bs;
 if(a.x0<b.x0){as=f((b.x0-a.x0)*a.dq+a.q0+ae);bs=f(be+b.q0)}else{bs=f((a.x0-b.x0)*b.dq+b.q0+be);as=f(ae+a.q0)}
 return as>=bs;
}
export function spanInFront(a,b){
 if(Math.min(b.q0,b.q1)+EPS>=Math.max(a.q0,a.q1))return false;
 if(Math.min(a.q0,a.q1)+EPS>=Math.max(b.q0,b.q1))return true;
 return compareSpanDepth(a,b);
}
function trimEnd(span,end){span.x1=end;span.q1=f((end-span.x0)*span.dq+span.q0)}
function trimStart(span,start){span.x0=start;span.q0=f((start-span.x1)*span.dq+span.q1)}
function split(span,leftEnd,rightStart){
 const right={...span};trimEnd(span,leftEnd);right.x0=rightStart;right.q0=f((rightStart-span.x0)*span.dq+span.q0);return right;
}
export class SpanBuffer{
 constructor(height){this.rows=Array.from({length:height},()=>[])}
 clear(){for(const row of this.rows)row.length=0}
 insert(y,incoming){
  if(y<0||y>=this.rows.length)throw new RangeError('Span row is outside the display');
  if(incoming.x1<incoming.x0)return [];
  const row=this.rows[y],visible=[];let pending={...incoming,q0:f(incoming.q0),q1:f(incoming.q1),dq:f(incoming.dq)},i=0;
  const append=span=>{
   const previous=visible.at(-1);
   if(previous&&previous.x1+1===span.x0){previous.x1=span.x1;previous.q1=span.q1;row.splice(row.indexOf(span),1);return previous}
   visible.push(span);return span;
  };
  while(pending){
   while(i<row.length&&row[i].x1<pending.x0)i++;
   if(i===row.length||row[i].x0>pending.x1){row.splice(i,0,pending);append(pending);break}
   const old=row[i];
   if(spanInFront(pending,old)){
    if(pending.x0>old.x0){
     if(pending.x1>=old.x1){trimEnd(old,pending.x0-1);i++;continue}
     const right={...old};trimStart(right,pending.x1+1);trimEnd(old,pending.x0-1);row.splice(i+1,0,pending,right);append(pending);break;
    }
    if(old.x1<pending.x1){const left=pending;pending=split(left,old.x1,old.x1+1);row.splice(i,1,left);i=row.indexOf(append(left))+1;continue}
    if(old.x1===pending.x1)row.splice(i,1,pending);else{trimStart(old,pending.x1+1);row.splice(i,0,pending)}
    append(pending);break;
   }
   if(old.x0<=pending.x0){if(old.x1>=pending.x1)break;trimStart(pending,old.x1+1);i++;continue}
   if(old.x1<pending.x1){const left=pending;pending=split(left,old.x0-1,old.x1+1);row.splice(i,0,left);append(left);i=row.indexOf(old)+1;continue}
   trimEnd(pending,old.x0-1);row.splice(i,0,pending);append(pending);break;
  }
  return visible;
 }
}
