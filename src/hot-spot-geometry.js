import {boxCorners,prepareBox} from './scene-boxes.js';
// Bounds of DORMT_HS/ACTIV_HS and HOTSPOT1/2.GAM. 43a524 replaces the
// shared marker child and enables the parent's BBOX while it is dormant/armed.
export const HOT_SPOT_BOUNDS={min:[-1.5,0,-1.5],max:[1.5,2.25,1.5]};
export function hotSpotMarkers(markers){
 return ['dormt_hs.gam','activ_hs.gam'].flatMap(name=>markers.filter(m=>m.name===name));
}
export function hotSpotBox(marker){
 const m=marker.matrix??[1,0,0,0,0,1,0,0,0,0,1,0,...marker.position,1],bounds=marker.bounds??HOT_SPOT_BOUNDS;
 return prepareBox(boxCorners(bounds.min,bounds.max).map(p=>[0,1,2].map(i=>Math.fround(m[i]*p[0]+m[i+4]*p[1]+m[i+8]*p[2]+m[i+12]))));
}
