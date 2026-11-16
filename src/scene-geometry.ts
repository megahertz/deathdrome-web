import { type Group, type Object3DEventMap } from '#three';
import type { Vec3 } from './game-types.ts';
import { prepareBox, intersectBox } from './scene-boxes.ts';
import { prepareFacet, intersectFacet, altitudeFacet } from './scene-facets.ts';
import {
  sceneQueryOrder,
  compareSceneQueryOrder,
  sceneInstanceOrder,
} from './scene-order.ts';
import type {
  GeometryCache,
  SourceFacet,
  BoxBounds,
  WorldFacet,
} from './scene-types.ts';
import {
  groundInWorldPartition,
  segmentInWorldPartition,
} from './world-partition.ts';
const caches = new WeakMap<
    import('./model-types.ts').RenderNode,
    GeometryCache
  >(),
  procedural = new WeakMap(),
  CELL = 64;
const boxCache = new WeakMap();
function collisionBox(node: import('./model-types.ts').RenderNode) {
  const source = node.userData.collisionBox as number[][],
    matrix = node.matrixWorld.elements,
    old = boxCache.get(node);
  if (
    old &&
    old.source === source &&
    old.matrix.every((v: number, i: number) => v === matrix[i])
  ) {
    return old.box;
  }
  const box = prepareBox(
    source.map((p) =>
      [0, 1, 2].map((i) =>
        Math.fround(
          matrix[i] * p[0] +
            matrix[i + 4] * p[1] +
            matrix[i + 8] * p[2] +
            matrix[i + 12],
        ),
      ),
    ),
  );
  boxCache.set(node, { source, matrix: [...matrix], box });
  return box;
}
function sourceFacets(
  mesh: import('./model-types.ts').RenderNode,
): SourceFacet[] | null {
  if (mesh.userData.facets) {
    return mesh.userData.facets;
  }
  const { geometry } = mesh,
    positions = geometry?.attributes.position as
      | import('#three').BufferAttribute
      | undefined;
  if (!geometry || !positions) {
    return null;
  }
  const side = mesh.material?.side,
    old = procedural.get(mesh);
  if (
    old &&
    old.positions === positions &&
    old.version === positions.version &&
    old.index === geometry.index &&
    old.side === side
  ) {
    return old.facets;
  }
  const { index } = geometry,
    facets = [];
  for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
    const vertices = [];
    for (let j = 0; j < 3; j++) {
      const k = index ? index.getX(i + j) : i + j;
      vertices.push([positions.getX(k), positions.getY(k), positions.getZ(k)]);
    }
    facets.push({ vertices, twoSided: side === 2, name: mesh.name || 'wall' });
  }
  procedural.set(mesh, {
    positions,
    version: positions.version,
    index,
    side,
    facets,
  });
  return facets;
}
function cache(mesh: import('./model-types.ts').RenderNode) {
  const source = sourceFacets(mesh);
  if (!source) {
    return null;
  }
  const matrix = mesh.matrixWorld.elements,
    old = caches.get(mesh);
  if (
    old &&
    old.source === source &&
    old.matrix.every((v: number, i: number) => v === matrix[i])
  ) {
    return old;
  }
  const transform = (p: any[]) =>
    [0, 1, 2].map((i) =>
      Math.fround(
        matrix[i] * p[0] +
          matrix[i + 4] * p[1] +
          matrix[i + 8] * p[2] +
          matrix[i + 12],
      ),
    );
  const worldBounds = new Map<BoxBounds, BoxBounds>();
  for (const facet of source) {
    if (facet.worldObject && !worldBounds.has(facet.worldObject)) {
      const b = facet.worldObject,
        corners = Array.from({ length: 8 }, (_, bits) =>
          transform(
            [0, 1, 2].map((i) => ((bits >> i) & 1 ? b.max[i] : b.min[i])),
          ),
        );
      worldBounds.set(b, {
        min: [0, 1, 2].map((i) => Math.min(...corners.map((p) => p[i]))),
        max: [0, 1, 2].map((i) => Math.max(...corners.map((p) => p[i]))),
        order: b.order,
      });
    }
  }
  const facets: WorldFacet[] = source.map((s) => ({
      ...prepareFacet(s.vertices.map(transform), s.twoSided),
      name: s.name,
      contactObject: s.contactObject,
      contactOrder: s.contactOrder,
      contactRank: s.contactRank,
      shapeBroadPhase: s.shapeBroadPhase,
      worldBounds: s.worldObject ? worldBounds.get(s.worldObject) : undefined,
    })),
    grid = new Map<string, WorldFacet[]>(),
    altitudeGrid = new Map<string, WorldFacet[]>(),
    bounds = new Map<BoxBounds, BoxBounds>();
  for (const facet of facets) {
    for (
      let x = Math.floor(facet.min[0] / CELL);
      x <= Math.floor(facet.max[0] / CELL);
      x++
    ) {
      for (
        let z = Math.floor(facet.min[2] / CELL);
        z <= Math.floor(facet.max[2] / CELL);
        z++
      ) {
        const key = x + ',' + z;
        if (!grid.has(key)) {
          grid.set(key, []);
        }
        grid.get(key)!.push(facet);
      }
    }
    let box: BoxBounds = facet;
    if (facet.contactObject) {
      const existingBox = bounds.get(facet.contactObject);
      box = existingBox!;
      if (!box) {
        const sourceFacet = facet.contactObject,
          corners = Array.from({ length: 8 }, (_, bits) =>
            transform(
              [0, 1, 2].map((i) =>
                (bits >> i) & 1 ? sourceFacet.max[i] : sourceFacet.min[i],
              ),
            ),
          );
        box = {
          min: [0, 1, 2].map((i) => Math.min(...corners.map((p) => p[i]))),
          max: [0, 1, 2].map((i) => Math.max(...corners.map((p) => p[i]))),
        };
        bounds.set(facet.contactObject, box);
      }
    }
    facet.altitudeBounds = box;
    for (
      let x = Math.floor(box.min[0] / CELL);
      x <= Math.floor(box.max[0] / CELL);
      x++
    ) {
      for (
        let z = Math.floor(box.min[2] / CELL);
        z <= Math.floor(box.max[2] / CELL);
        z++
      ) {
        const key = x + ',' + z;
        if (!altitudeGrid.has(key)) {
          altitudeGrid.set(key, []);
        }
        altitudeGrid.get(key)!.push(facet);
      }
    }
  }
  const result = { source, matrix: [...matrix], grid, altitudeGrid };
  caches.set(mesh, result);
  return result;
}
function candidates(
  mesh: import('./model-types.ts').RenderNode,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  altitude = false,
) {
  const data = cache(mesh);
  if (!data) {
    return [];
  }
  const result = new Set<WorldFacet>();
  const grid = altitude ? data.altitudeGrid : data.grid;
  for (let x = Math.floor(minX / CELL); x <= Math.floor(maxX / CELL); x++) {
    for (let z = Math.floor(minZ / CELL); z <= Math.floor(maxZ / CELL); z++) {
      for (const f of grid.get(x + ',' + z) ?? []) {
        result.add(f);
      }
    }
  }
  return result;
}
export function segmentFacetHits(
  root: Group<Object3DEventMap>,
  from: Vec3,
  to: Vec3,
) {
  const result: any[] = [],
    objects = new Map(),
    ordering = new WeakMap(),
    instances = new Map(),
    lo = (['x', 'y', 'z'] as const).map((k) => Math.min(from[k], to[k]) - 1),
    hi = (['x', 'y', 'z'] as const).map((k) => Math.max(from[k], to[k]) + 1);
  let ordinal = 0;
  root?.traverseVisible((mesh: import('./model-types.ts').RenderNode) => {
    if (mesh.userData.intersect === false) {
      return;
    }
    const fallback = ordinal++,
      instance = sceneInstanceOrder(mesh, root, instances);
    if (mesh.userData.collisionBox) {
      const box = collisionBox(mesh),
        worldBounds =
          mesh.userData.worldBounds ??
          (mesh.userData.worldPartitioned ? box : null);
      if (worldBounds && !segmentInWorldPartition(worldBounds, from, to)) {
        return;
      }
      const hit = intersectBox(box, from, to);
      if (hit) {
        const record = {
          ...hit,
          object: mesh,
          name: mesh.name,
          distance: Math.hypot(
            hit.point.x - from.x,
            hit.point.y - from.y,
            hit.point.z - from.z,
          ),
        };
        ordering.set(
          record,
          sceneQueryOrder(
            worldBounds,
            mesh.userData.worldOrder,
            mesh.userData.contactRank,
            fallback,
            instance,
          ),
        );
        result.push(record);
      }
      return;
    }
    for (const facet of candidates(mesh, lo[0], hi[0], lo[2], hi[2])) {
      if (
        facet.worldBounds &&
        !segmentInWorldPartition(facet.worldBounds, from, to)
      ) {
        continue;
      }
      if (
        facet.shapeBroadPhase &&
        (['x', 'y', 'z'] as const).some(
          (k, i) =>
            Math.max(Math.fround(from[k]), Math.fround(to[k])) <=
              facet.altitudeBounds!.min[i] ||
            Math.min(Math.fround(from[k]), Math.fround(to[k])) >=
              facet.altitudeBounds!.max[i],
        )
      ) {
        continue;
      }
      if (
        facet.min.some((v, i) => v > hi[i]) ||
        facet.max.some((v, i) => v < lo[i])
      ) {
        continue;
      }
      const hit = intersectFacet(facet, from, to);
      if (hit) {
        const record = {
          ...hit,
          object: mesh,
          name: facet.name,
          distance: Math.hypot(
            hit.point.x - from.x,
            hit.point.y - from.y,
            hit.point.z - from.z,
          ),
        };
        ordering.set(
          record,
          sceneQueryOrder(
            facet.worldBounds,
            facet.worldBounds?.order,
            facet.contactRank,
            fallback,
            instance,
          ),
        );
        firstObjectHit(result, objects, facet, record);
      }
    }
  });
  return result.sort((a, b) =>
    compareSceneQueryOrder(ordering.get(a), ordering.get(b)),
  );
}
export function altitudeFacetHits(
  root: Group<Object3DEventMap>,
  x: number,
  z: number,
) {
  x = Math.fround(x);
  z = Math.fround(z);
  const result: any[] = [],
    objects = new Map(),
    ordering = new WeakMap(),
    instances = new Map();
  let ordinal = 0;
  root?.traverseVisible((mesh: import('./model-types.ts').RenderNode) => {
    if (!mesh.userData.altitude) {
      return;
    }
    const fallback = ordinal++,
      instance = sceneInstanceOrder(mesh, root, instances);
    for (const facet of candidates(mesh, x - 1, x + 1, z - 1, z + 1, true)) {
      if (
        facet.worldBounds &&
        !groundInWorldPartition(facet.worldBounds, x, z)
      ) {
        continue;
      }
      const box = facet.altitudeBounds!,
        margin = facet.shapeBroadPhase ? 0 : 1;
      if (
        x < box.min[0] - margin ||
        x > box.max[0] + margin ||
        z < box.min[2] - margin ||
        z > box.max[2] + margin
      ) {
        continue;
      }
      const hit = altitudeFacet(facet, x, z);
      if (hit) {
        const record = { ...hit, object: mesh, name: facet.name };
        ordering.set(
          record,
          sceneQueryOrder(
            facet.worldBounds,
            facet.worldBounds?.order,
            facet.contactRank,
            fallback,
            instance,
          ),
        );
        firstObjectHit(result, objects, facet, record);
      }
    }
  });
  return result.sort((a, b) =>
    compareSceneQueryOrder(ordering.get(a), ordering.get(b)),
  );
}
// 46baa0 / 46b5a0 return the first accepted polygon in a shape's source order.
// Display-material batches may split that shape, so resolve across batches.
function firstObjectHit(
  result: any[],
  objects: Map<any, any>,
  facet: import('./scene-types.ts').WorldFacet,
  record: import('./scene-types.ts').SceneHit,
) {
  if (!facet.contactObject) {
    result.push(record);
    return;
  }
  const previous = objects.get(facet.contactObject);
  if (!previous) {
    objects.set(facet.contactObject, {
      index: result.length,
      order: facet.contactOrder,
    });
    result.push(record);
  } else if (facet.contactOrder! < previous.order) {
    result[previous.index] = record;
    previous.order = facet.contactOrder;
  }
}
