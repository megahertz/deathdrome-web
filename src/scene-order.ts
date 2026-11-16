import { worldPartition } from './world-partition.ts';
// 4459a4 / 446764 append contacts in traversal order: partition Z, then X,
// cell insertion order, then each node's own shape before its children.
// Unpartitioned World children follow the cell lists. Distance and height
// are properties of contacts, not sorting keys used by the collectors.
export function sceneQueryOrder(
  bounds: import('./scene-types.ts').BoxBounds | null | undefined,
  worldOrder: number | null | undefined,
  contactRank: number | null | undefined,
  fallback = 0,
  instanceOrder = 0,
) {
  const cell = bounds ? worldPartition(bounds.min, bounds.max) : null;
  return [
    cell ? 0 : 1,
    cell?.[1] ?? 0,
    cell?.[0] ?? 0,
    worldOrder ?? Number.MAX_SAFE_INTEGER,
    worldOrder === null || worldOrder === undefined ? instanceOrder : 0,
    contactRank ?? fallback,
    fallback,
  ];
}
export function compareSceneQueryOrder(a: number[], b: number[]) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return 0;
}
// A bare model has one native subtree. Keep repeated placements together
// before comparing the per-source node ranks inside each placement.
export function sceneInstanceOrder(
  mesh: import('#three').Object3D,
  root: import('#three').Object3D,
  instances: Map<import('#three').Object3D, number>,
) {
  let instance = root;
  for (
    let node: import('#three').Object3D | null = mesh;
    node;
    node = node.parent
  ) {
    if (node.userData.queryModel) {
      instance = node;
    }
    if (node === root) {
      break;
    }
  }
  if (!instances.has(instance)) {
    instances.set(instance, instances.size);
  }
  return instances.get(instance)!;
}
