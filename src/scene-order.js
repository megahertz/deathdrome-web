import {worldPartition} from './world-partition.js';
// 4459a4 / 446764 append contacts in traversal order: partition Z, then X,
// cell insertion order, then each node's own shape before its children.
// Unpartitioned World children follow the cell lists. Distance and height
// are properties of contacts, not sorting keys used by the collectors.
export function sceneQueryOrder(bounds,worldOrder,contactRank,fallback=0,instanceOrder=0){
 const cell=bounds?worldPartition(bounds.min,bounds.max):null;
 return [cell?0:1,cell?.[1]??0,cell?.[0]??0,worldOrder??Number.MAX_SAFE_INTEGER,worldOrder==null?instanceOrder:0,contactRank??fallback,fallback];
}
export function compareSceneQueryOrder(a,b){
 for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]-b[i];return 0;
}
// A bare model has one native subtree. Keep repeated placements together
// before comparing the per-source node ranks inside each placement.
export function sceneInstanceOrder(mesh,root,instances){
 let instance=root;for(let node=mesh;node;node=node.parent){if(node.userData.queryModel)instance=node;if(node===root)break}
 if(!instances.has(instance))instances.set(instance,instances.size);
 return instances.get(instance);
}
