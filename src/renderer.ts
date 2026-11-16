import * as THREE from '#three';
import { ChaseCamera } from './chase-camera.ts';
import { EnhancedEffects } from './enhanced-effects.ts';
import { GAME_TABLES } from './game-tables.ts';
import type { Runner, Vec3 } from './game-types.ts';
import {
  configureTextureQuality,
  graphicsRenderScale,
  enhancedTextureSampling,
} from './graphics-quality.ts';
import { hotSpotMarkers, hotSpotBox } from './hot-spot-geometry.ts';
import { projectReticle } from './hud-reticle.ts';
import { NATIVE_TEXTURE_GLSL } from './native-texture.ts';
import { portalLocked } from './portal-doors.ts';
import { renderPreviewFloor } from './preview-raster.ts';
import { resourceURL } from './resource-urls.ts';
import { runnerBodyVisible } from './respawn.ts';
import {
  responsiveRenderSize,
  applyResponsiveProjection,
  responsiveReticle,
} from './responsive-layout.ts';
import { runnerLightContour, LIGHT_MASK_GLSL } from './runner-light.ts';
import { runnerCockpitRoll, runnerExit } from './runner-pose.ts';
import { runnerQueryBounds } from './runner-query.ts';
import { boxCorners } from './scene-boxes.ts';
import { segmentFacetHits, altitudeFacetHits } from './scene-geometry.ts';
import { contactNodeFromPath } from './scene-nodes.ts';
import { type Scrub } from './scrub.ts';
import { type Simulation } from './simulation.ts';
const jsonCache = new Map<
    string,
    Promise<import('./model-types.ts').ModelData>
  >(),
  textureCache = new Map<string, THREE.Texture>(),
  pendingTextures = new Set<Promise<void>>();
let enhancedTextures = false,
  textureAnisotropy = 1;
// Half the 10.62852-unit lateral span of the original runner lcl_lt contour.
// This matches its width; the complete native lighting/raster path is separate.
export const PLAYER_SPOT_RADIUS = 5.31426;
export async function modelData(name: string) {
  if (!jsonCache.has(name)) {
    jsonCache.set(
      name,
      fetch(resourceURL(`assets/models/${name}.json?schema=8`)).then((r) => {
        if (!r.ok) {
          throw Error(`Model ${name}: ${r.status}`);
        }
        return r.json();
      }),
    );
  }
  return jsonCache.get(name)!;
}
export async function texturesReady() {
  while (pendingTextures.size) {
    // oxlint-disable-next-line no-await-in-loop -- Texture callbacks can queue more textures; drain each generation before rechecking.
    await Promise.all(pendingTextures);
  }
}
function texture(path: string, keyed = false) {
  const key = path + (keyed ? '?palette-zero=1' : '');
  if (!textureCache.has(key)) {
    let complete!: () => void;
    const ready = new Promise<void>((resolve) => (complete = resolve));
    pendingTextures.add(ready);
    const finish = () => {
      pendingTextures.delete(ready);
      complete();
    };
    const t = new THREE.TextureLoader().load(
      resourceURL('assets/' + key),
      finish,
      undefined,
      () => {
        console.error('Could not load texture: ' + path);
        finish();
      },
    );
    configureTextureQuality(t, enhancedTextures, textureAnisotropy);
    t.wrapT = THREE.RepeatWrapping;
    t.wrapS = t.wrapT;
    t.colorSpace = THREE.SRGBColorSpace;
    textureCache.set(key, t);
  }
  return textureCache.get(key)!;
}
function nativeTextureMaterial(
  mesh: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial,
    THREE.Object3DEventMap
  >,
) {
  const { material } = mesh,
    size = { value: new THREE.Vector2(1, 1) },
    previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, webglRenderer) => {
    previous.call(material, shader, webglRenderer);
    shader.uniforms.nativeTextureSize = size;
    shader.uniforms.enhancedGraphics = enhancedTextureSampling;
    shader.fragmentShader = NATIVE_TEXTURE_GLSL + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      THREE.ShaderChunk.map_fragment.replace(
        'texture2D( map, vMapUv )',
        'texture2D( map, nativeTextureUv(vMapUv) )',
      ),
    );
  };
  mesh.onBeforeRender = () => {
    const image = material.map?.image;
    size.value.set(image?.width || 1, image?.height || 1);
  };
  material.customProgramCacheKey = () => 'native-texture-address-v2';
  mesh.userData.nativeTextureUV = true;
}
export function makeModel(
  data: import('./model-types.ts').ModelGeometry,
  filter: (part: import('./model-types.ts').ModelPart) => boolean = () => true,
) {
  const group = new THREE.Group(),
    batches = new Map(),
    contactObjects = new Map();
  group.userData.queryModel = true;
  for (const face of data.meshes) {
    if (!filter(face)) {
      continue;
    }
    const key = JSON.stringify([
      face.texture,
      !!face.renderPolygons,
      face.texture ? null : face.color,
      face.drawType || 0,
      face.transparency || 0,
      face.altitude,
      face.intersect,
      !!face.intersectBox,
      face.cycle,
      /\/lcl_lt\//i.test(face.name),
      face.name.match(/\/door_([xyz])\//i)?.[1],
      face.name.match(/\/port(\d\d)\//i)?.[1],
      face.name.match(/\/port(\d\d)\/(open|lock)\d\d\//i)?.slice(1),
    ]);
    if (!batches.has(key)) {
      batches.set(key, { face, p: [], uv: [], contactNames: [], facets: [] });
    }
    const batch = batches.get(key);
    let contactObject;
    if (face.contactObject != null) {
      if (!contactObjects.has(face.contactObject)) {
        contactObjects.set(face.contactObject, {
          min: [Infinity, Infinity, Infinity],
          max: [-Infinity, -Infinity, -Infinity],
        });
      }
      contactObject = contactObjects.get(face.contactObject);
      for (const p of face.v) {
        for (let i = 0; i < 3; i++) {
          const v = Math.fround(p[i]);
          contactObject.min[i] = Math.min(contactObject.min[i], v);
          contactObject.max[i] = Math.max(contactObject.max[i], v);
        }
      }
    }
    batch.facets.push({
      name: face.name,
      vertices: face.v.map((v) => v.slice(0, 3).map(Math.fround)),
      twoSided: !!((face.drawType ?? 0) & 1),
      contactObject,
      contactOrder: face.contactOrder,
      contactRank: face.contactRank,
      shapeBroadPhase: face.shapeBroadPhase,
      worldObject: data.worldObjects?.[face.worldObject!],
    });
    const pieces = face.renderPolygons ?? [
      {
        indices: face.v.map((_, i) => i),
        uv: face.v.map((v) => v.slice(3, 5)),
      },
    ];
    for (const piece of pieces) {
      for (let i = 1; i < piece.indices.length - 1; i++) {
        batch.contactNames.push(face.name);
        for (const j of [0, i, i + 1]) {
          batch.p.push(...face.v[piece.indices[j]].slice(0, 3));
          batch.uv.push(...piece.uv[j]);
        }
      }
    }
  }
  for (const { face, p, uv, contactNames, facets } of batches.values()) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    const opacity = 1 - (face.transparency || 0) / 65535;
    const keyed = face.cycle?.source === 'enhcycle.gw';
    const material = new THREE.MeshBasicMaterial({
      map: face.texture ? texture(face.texture, keyed) : null,
      color: face.texture
        ? 0xffffff
        : new THREE.Color().setRGB(
            (face.color || [0.5, 0.5, 0.5])[0],
            (face.color || [0.5, 0.5, 0.5])[1],
            (face.color || [0.5, 0.5, 0.5])[2],
            THREE.SRGBColorSpace,
          ),
      side: (face.drawType ?? 0) & 1 ? THREE.DoubleSide : THREE.FrontSide,
      alphaTest: 0.4,
      opacity,
      transparent: opacity < 1,
    });
    if (/\/lcl_lt\//i.test(face.name)) {
      material.depthWrite = false;
      material.polygonOffset = true;
      material.polygonOffsetFactor = -1;
      material.polygonOffsetUnits = -1;
    }
    if (keyed) {
      material.userData.paletteZeroKey = true;
    }
    const mesh = new THREE.Mesh(geometry, material);
    if (face.renderPolygons && material.map) {
      nativeTextureMaterial(mesh);
    }
    mesh.userData.facets = facets;
    mesh.userData.contactNames = contactNames;
    mesh.userData.runnerLight = /\/lcl_lt\//i.test(face.name);
    if (face.cycle) {
      mesh.userData.cycle = {
        ...face.cycle,
        textures: face.cycle.frames.map((path: string) => texture(path, keyed)),
      };
    }
    mesh.userData.altitude = face.altitude !== false;
    mesh.userData.intersect = face.intersect !== false && !face.intersectBox;
    mesh.userData.secretDoor = face.name
      .match(/\/door_([xyz])\//i)?.[1]
      ?.toLowerCase();
    mesh.userData.portal = face.name.match(/\/port(\d\d)\//i)?.[1];
    group.add(mesh);
  }
  for (const box of data.collisionBoxes ?? []) {
    if (!filter(box)) {
      continue;
    }
    const node = new THREE.Object3D();
    node.name = box.name;
    node.userData.collisionBox = box.vertices;
    node.userData.worldBounds = data.worldObjects?.[box.worldObject!];
    node.userData.worldOrder = data.worldGroups?.[box.worldObject!]?.order;
    node.userData.contactRank = box.contactRank;
    node.userData.intersect = box.intersect !== false;
    node.userData.altitude = false;
    node.userData.secretDoor = box.name
      .match(/\/door_([xyz])\//i)?.[1]
      ?.toLowerCase();
    node.userData.portal = box.name.match(/\/port(\d\d)\//i)?.[1];
    group.add(node);
  }
  return group;
}
export function transformModelGeometry(
  root: THREE.Group<THREE.Object3DEventMap>,
  matrix: THREE.Matrix4,
) {
  const transform = (p: any) =>
    new THREE.Vector3(...p).applyMatrix4(matrix).toArray().map(Math.fround);
  root.traverse((node: import('./model-types.ts').RenderNode) => {
    node.geometry?.applyMatrix4(matrix);
    if (node.userData.facets) {
      node.userData.facets = node.userData.facets.map(
        (f: { vertices: number[][] }) => ({
          ...f,
          vertices: f.vertices.map(transform),
        }),
      );
    }
    if (node.userData.collisionBox) {
      node.userData.collisionBox = node.userData.collisionBox.map(transform);
    }
  });
  // Source object bounds also follow this local change, including parts split
  // between display materials. Rebuild them from the transformed facets.
  const objects = new Map();
  root.traverse((node: import('./model-types.ts').RenderNode) => {
    for (const f of node.userData.facets ?? []) {
      if (!f.contactObject) {
        continue;
      }
      if (!objects.has(f.contactObject)) {
        objects.set(f.contactObject, {
          min: [Infinity, Infinity, Infinity],
          max: [-Infinity, -Infinity, -Infinity],
        });
      }
      const b = objects.get(f.contactObject);
      for (const p of f.vertices) {
        for (let i = 0; i < 3; i++) {
          b.min[i] = Math.min(b.min[i], p[i]);
          b.max[i] = Math.max(b.max[i], p[i]);
        }
      }
    }
  });
  for (const [object, bounds] of objects) {
    Object.assign(object, bounds);
  }
}
export function makeRunnerModel(
  data: import('./model-types.ts').ModelGeometry,
  filter: (part: import('./model-types.ts').ModelPart) => boolean = (f: {
    name: string;
  }) => !f.name.includes('/lt/'),
) {
  const root = new THREE.Group(),
    rig: Record<string, THREE.Group> = {},
    world: Record<string, THREE.Matrix4> = {};
  let parent = root,
    parentWorld = new THREE.Matrix4();
  for (const name of ['yaw', 'chassis', 'cockpit']) {
    const attachment = data.attachments?.[name];
    if (!attachment) {
      throw Error('Missing runner attachment: ' + name);
    }
    world[name] = new THREE.Matrix4().fromArray(attachment.matrix);
    const node = new THREE.Group(),
      local = parentWorld.clone().invert().multiply(world[name]);
    local.decompose(node.position, node.quaternion, node.scale);
    parent.add(node);
    rig[name] = node;
    parent = node;
    parentWorld = world[name];
  }
  const part = (face: { name: string }) => {
    if (/\/cockpit\//i.test(face.name)) {
      return 'cockpit';
    } else if (/\/chassis\//i.test(face.name)) {
      return 'chassis';
    } else if (/\/yaw\//i.test(face.name)) {
      return 'yaw';
    } else {
      return null;
    }
  };
  for (const name of ['yaw', 'chassis', 'cockpit', null]) {
    const inverse = name ? world[name].clone().invert() : new THREE.Matrix4(),
      faces = data.meshes
        .filter((f) => filter(f) && part(f) === name)
        .map((f) => ({
          ...f,
          v: f.v.map((v) => {
            const p = new THREE.Vector3(...v.slice(0, 3)).applyMatrix4(inverse);
            return [p.x, p.y, p.z, ...v.slice(3)];
          }),
        }));
    const collisionBoxes = (data.collisionBoxes ?? [])
      .filter((b) => part(b) === name)
      .map((b) => ({
        ...b,
        vertices: b.vertices.map((p) =>
          new THREE.Vector3(...p).applyMatrix4(inverse).toArray(),
        ),
      }));
    (name ? rig[name] : root).add(
      makeModel({ ...data, meshes: faces, collisionBoxes }),
    );
  }
  root.userData.runnerRig = rig;
  const tree = data.attachments!.chassis.collisionBounds;
  if (tree) {
    // RUNNER_X.GW uses the complete chassis BBOX, including all stored LODs.
    // Its children no longer report separate triangle hits beneath this proxy.
    root.userData.runnerQueryBounds = tree;
    rig.chassis.traverse((node: import('./model-types.ts').RenderNode) => {
      if (node !== rig.chassis) {
        node.userData.intersect = false;
      }
    });
    rig.chassis.userData.intersect = true;
    updateRunnerQueryBounds(root);
  }
  return root;
}
function updateRunnerQueryBounds(model: THREE.Group<THREE.Object3DEventMap>) {
  const tree = model.userData.runnerQueryBounds;
  if (!tree) {
    return;
  }
  const { cockpit, chassis } = model.userData.runnerRig,
    old = model.userData.runnerQueryPose;
  const pitch = cockpit.rotation.x,
    roll = cockpit.rotation.z;
  if (old && old.pitch === pitch && old.roll === roll) {
    return;
  }
  chassis.userData.collisionBox = boxCorners(
    ...runnerQueryBounds(tree, { pitch, roll }),
  );
  model.userData.runnerQueryPose = { pitch, roll };
}
export function runnerAttachmentMatrix(
  data: import('./model-types.ts').ModelGeometry,
  r: import('./game-types.ts').RunnerPose,
  name = 'cockpit',
  escape: import('./game-types.ts').ExitVisualState | null = null,
) {
  const exit = runnerExit(r, escape),
    matrix = new THREE.Matrix4()
      .makeTranslation(r.x, r.y, r.z)
      .multiply(new THREE.Matrix4().makeRotationY(r.yaw))
      .multiply(
        new THREE.Matrix4().makeRotationX(
          ((exit?.foldDegrees || 0) * Math.PI) / 180,
        ),
      );
  if (name === 'yaw') {
    return matrix.multiply(
      new THREE.Matrix4().fromArray(data.attachments!.yaw.matrix),
    );
  }
  const chassis = new THREE.Matrix4().fromArray(
      data.attachments!.chassis.matrix,
    ),
    pitch = runnerChassisPitch(r);
  matrix
    .multiply(chassis)
    .multiply(new THREE.Matrix4().makeRotationX((pitch * Math.PI) / 180))
    .multiply(
      new THREE.Matrix4().makeRotationZ(
        ((r.chassisRollDegrees ?? 0) * Math.PI) / 180,
      ),
    );
  if (name === 'cockpit') {
    matrix
      .multiply(
        chassis
          .clone()
          .invert()
          .multiply(
            new THREE.Matrix4().fromArray(data.attachments!.cockpit.matrix),
          ),
      )
      .multiply(
        new THREE.Matrix4().makeRotationX(
          r.actionMode === 2
            ? (-Math.fround(
                pitch * GAME_TABLES.combat.emitters.jumpCounterPitchFactor,
              ) *
                Math.PI) /
                180
            : 0,
        ),
      )
      .multiply(
        new THREE.Matrix4().makeRotationZ(
          (runnerCockpitRoll(r, escape) * Math.PI) / 180,
        ),
      );
  }
  return matrix;
}
function runnerChassisPitch(r: import('./game-types.ts').RunnerPose) {
  return Math.fround(
    (r.chassisPitchDegrees ?? 0) +
      (r.actionMode === 2
        ? Math.fround(r.y - (r.baseHeight ?? 0)) *
          GAME_TABLES.combat.emitters.jumpPitchFactor
        : 0),
  );
}
export function poseRunnerModel(
  model: THREE.Group<THREE.Object3DEventMap>,
  r: import('./game-types.ts').RunnerPose,
  escape: import('./game-types.ts').ExitVisualState | null = null,
) {
  const exit = runnerExit(r, escape),
    rig = model.userData.runnerRig;
  model.visible = runnerBodyVisible(r);
  model.position.set(r.x, r.y, r.z);
  model.rotation.set(
    rig ? 0 : ((exit?.foldDegrees || 0) * Math.PI) / 180,
    r.yaw,
    0,
    'YXZ',
  );
  if (rig) {
    const pitch = runnerChassisPitch(r);
    rig.yaw.rotation.x = ((exit?.foldDegrees || 0) * Math.PI) / 180;
    rig.chassis.rotation.set(
      (pitch * Math.PI) / 180,
      0,
      ((r.chassisRollDegrees ?? 0) * Math.PI) / 180,
      'XYZ',
    );
    rig.cockpit.rotation.set(
      r.actionMode === 2
        ? (-Math.fround(
            pitch * GAME_TABLES.combat.emitters.jumpCounterPitchFactor,
          ) *
            Math.PI) /
            180
        : 0,
      0,
      (runnerCockpitRoll(r, escape) * Math.PI) / 180,
      'XYZ',
    );
  }
  updateRunnerQueryBounds(model);
  model.traverse((node: import('./model-types.ts').RenderNode) => {
    if (node.userData.runnerLight) {
      node.visible = !exit || exit.phase === 'delay' || exit.phase === 'center';
    }
  });
  model.updateMatrixWorld(true);
}
export function runnerRigState(model: THREE.Group<THREE.Object3DEventMap>) {
  const rig = model.userData.runnerRig;
  if (!rig) {
    return null;
  }
  const meshes: Record<string, number> = { chassis: 0, cockpit: 0 };
  for (const name of ['chassis', 'cockpit']) {
    rig[name].traverse((o: import('./model-types.ts').RenderNode) => {
      if (o.geometry) {
        meshes[name]++;
      }
    });
  }
  return {
    cockpitRollDegrees: (rig.cockpit.rotation.z * 180) / Math.PI,
    yawPitchDegrees: (rig.yaw.rotation.x * 180) / Math.PI,
    chassisPitchDegrees: (rig.chassis.rotation.x * 180) / Math.PI,
    chassisRollDegrees: (rig.chassis.rotation.z * 180) / Math.PI,
    cockpitPitchDegrees: (rig.cockpit.rotation.x * 180) / Math.PI,
    meshes,
    finite: [rig.yaw, rig.chassis, rig.cockpit].every((n) =>
      n.matrixWorld.elements.every(Number.isFinite),
    ),
  };
}
export function makeArenaGeometry(data: import('./model-types.ts').ModelData) {
  const arenaGroup = new THREE.Group(),
    doors: Record<string, THREE.Group> = {},
    portals: Record<string, { open?: THREE.Group; lock?: THREE.Group }> = {},
    movingPrefixes: any[] = [];
  for (const key of ['x', 'y', 'z']) {
    const token = '/door_' + key + '/',
      face = data.meshes.find((f) => f.name.toLowerCase().includes(token));
    if (!face) {
      continue;
    }
    const end = face.name.toLowerCase().indexOf(token) + token.length;
    let prefix = face.name.slice(0, end);
    const lift = prefix + 'lift_' + key + '/';
    if (data.meshes.some((f) => f.name.startsWith(lift))) {
      prefix = lift;
    }
    movingPrefixes.push(prefix);
    const group = makeModel(data, (f: { name: string }) =>
      f.name.startsWith(prefix),
    );
    group.userData.secretDoor = key;
    doors[key] = group;
    arenaGroup.add(group);
  }
  for (const face of data.meshes) {
    const match = face.name.match(/\/port(\d\d)\/(open|lock)\d\d\//i);
    if (!match) {
      continue;
    }
    const [token, id] = match,
      kind = match[2] as 'open' | 'lock',
      prefix = face.name.slice(0, face.name.indexOf(token) + token.length);
    if (portals[id]?.[kind]) {
      continue;
    }
    const group = makeModel(data, (f: { name: string }) =>
      f.name.startsWith(prefix),
    );
    group.userData.portal = id;
    group.traverse((o: import('./model-types.ts').RenderNode) => {
      if (o.material) {
        o.userData.altitude = false;
      }
    });
    portals[id] ??= {};
    portals[id][kind] = group;
    movingPrefixes.push(prefix);
    arenaGroup.add(group);
  }
  arenaGroup.add(
    makeModel(
      data,
      (f: { name: string }) =>
        !movingPrefixes.some((p) => f.name.startsWith(p)),
    ),
  );
  return { arenaGroup, doors, portals };
}
export class View {
  declare detail: number;

  declare arenaGroup: THREE.Group;
  declare doors: Record<string, THREE.Group>;
  declare portals: Record<string, { open?: THREE.Group; lock?: THREE.Group }>;
  declare enhancements: EnhancedEffects | undefined;
  declare hud: boolean | undefined;
  declare preview: boolean | undefined;
  declare responsiveViewport: boolean | undefined;
  declare hudLayout: ReturnType<
    typeof import('./responsive-layout.ts').responsiveHudLayout
  > | null;
  declare onDoorTouch: ((key: string, r: Partial<Runner>) => void) | undefined;
  declare onPortalTouch:
    | ((id: string, r: Vec3 & Partial<Runner>) => void)
    | undefined;

  declare renderer: THREE.WebGLRenderer;
  declare scene: THREE.Scene;
  declare camera: THREE.PerspectiveCamera;
  declare ray: THREE.Raycaster;
  declare stage: THREE.Group;
  declare objects: THREE.Group;
  declare enhancedGraphics: boolean | undefined;
  declare renderWidth: number;
  declare renderHeight: number;
  declare renderScale: number;
  declare enhancedArena: number | undefined;
  declare data: import('./model-types.ts').ModelData;
  declare exitGroup: THREE.Group | null;
  declare hangarParts: Record<string, THREE.Group>;
  declare hangarGroup: THREE.Group | null;
  declare hotSpotColliders: THREE.Object3D[];
  declare scrubGroup: THREE.Group | null;
  declare collisionMaterials: Map<THREE.Material, THREE.Side>;
  declare contactNodes: Map<string, ReturnType<typeof contactNodeFromPath>>;
  declare chaseCamera: ChaseCamera;
  declare playerSpot: THREE.Vector3 | undefined;
  declare playerSpotDirection: { value: THREE.Vector2 };
  declare playerSpotRadius: { value: number };
  declare playerSpotGain: { value: number };
  declare finishedEntrance:
    | import('./game-types.ts').EntranceState
    | null
    | undefined;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(320, 200, false);
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.camera = new THREE.PerspectiveCamera(35, 1.6, 0.75, 1200);
    this.ray = new THREE.Raycaster();
    this.stage = new THREE.Group();
    this.scene.add(this.stage);
    this.objects = new THREE.Group();
    this.scene.add(this.objects);
  }
  setEnhancedGraphics(enabled: boolean) {
    enabled = !!enabled;
    if (this.enhancedGraphics === enabled) {
      return;
    }
    this.enhancedGraphics = enabled;
    if (enabled) {
      this.enhancements ??= new EnhancedEffects(this);
    }
    this.enhancements?.setEnabled(enabled);
    enhancedTextures = enabled;
    enhancedTextureSampling.value = enabled;
    textureAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    for (const floorTexture of textureCache.values()) {
      configureTextureQuality(floorTexture, enabled, textureAnisotropy);
    }
    this.renderer.domElement.classList.toggle('enhanced-graphics', enabled);
    this.renderer.domElement.dataset.enhancedGraphics = String(enabled);
    this.updateResolution();
  }
  updateResolution() {
    const canvas = this.renderer.domElement,
      rect = canvas.getBoundingClientRect(),
      quality = this.enhancements?.adaptive.factor ?? 1;
    const base = graphicsRenderScale(
      !!this.enhancedGraphics,
      rect.width,
      rect.height,
      globalThis.devicePixelRatio,
    );
    const scale = this.enhancedGraphics
      ? Math.min(base, Math.max(1.5, Math.round(base * quality * 4) / 4))
      : 1;
    const size = this.responsiveViewport
      ? responsiveRenderSize(
          rect.width,
          rect.height,
          globalThis.devicePixelRatio,
          quality,
        )
      : { width: 320 * scale, height: 200 * scale };
    if (this.renderWidth !== size.width || this.renderHeight !== size.height) {
      this.renderWidth = size.width;
      this.renderHeight = size.height;
      this.renderScale = size.height / 200;
      if (this.enhancements) {
        this.enhancements.frameScale = null;
      }
      this.renderer.setSize(size.width, size.height, false);
    }
  }
  async arena(n: number) {
    this.clear();
    this.enhancedArena = n;
    this.data = await modelData('arena' + n);
    Object.assign(this, makeArenaGeometry(this.data));
    this.stage.add(this.arenaGroup);
    this.exitGroup = null;
    this.hangarParts = {};
    this.hangarGroup = null;
    const addReferences = async (
      data: import('./model-types.ts').ModelGeometry,
      parent: THREE.Group<THREE.Object3DEventMap>,
      depth = 0,
    ) => {
      if (depth > 4) {
        return;
      }
      for (const marker of data.markers ?? []) {
        if (
          marker.name.startsWith('enh') ||
          marker.name === 'activ_hs.gam' ||
          marker.name === 'dormt_hs.gam'
        ) {
          continue;
        }
        // oxlint-disable-next-line no-await-in-loop -- Preserve native scene insertion and contact traversal order while resolving subtrees.
        const sub = await modelData(marker.name.replace('.gam', ''));
        const mapped = {
          ...sub,
          meshes: sub.meshes.map((m) => ({
            ...m,
            texture: m.texture?.replace(
              'arena/textures/ar1/',
              'arena/textures/ar' + n + '/',
            ),
          })),
        };
        let group;
        if (marker.name === 'platform.gam') {
          group = new THREE.Group();
          const movable = (f: { name: string }) =>
            /\/hanger\/(door\/|exsign\/.*\/sign\/)/i.test(f.name);
          group.add(makeModel(mapped, (f: { name: string }) => !movable(f)));
          for (const part of ['door', 'sign'] as const) {
            const node = makeModel(
              mapped,
              (f: { name: string }) =>
                movable(f) && f.name.includes('/' + part + '/'),
            );
            this.hangarParts[part] = node;
            group.add(node);
          }
        } else {
          group = makeModel(mapped);
        }
        group.matrix.fromArray(marker.matrix!);
        group.matrixAutoUpdate = false;
        parent.add(group);
        if (marker.name === 'platform.gam') {
          this.hangarGroup = group;
          group.userData.baseMatrix = [...marker.matrix!];
        }
        if (marker.name === 'exit.gam') {
          group.visible = false;
          this.exitGroup = group;
        }
        // oxlint-disable-next-line no-await-in-loop -- Preserve native scene insertion and contact traversal order while resolving subtrees.
        await addReferences(sub, group, depth + 1);
      }
    };
    await addReferences(this.data, this.arenaGroup);
    this.hotSpotColliders = hotSpotMarkers(this.data.markers).map(
      (marker, id) => {
        const node = new THREE.Object3D();
        node.name = 'HotSpot_parent_' + id;
        node.userData.collisionBox = hotSpotBox(marker).vertices;
        node.userData.worldPartitioned = true;
        node.userData.worldOrder =
          this.data.worldGroups?.[marker.worldObject]?.order;
        node.userData.contactRank = marker.contactRank;
        node.userData.intersect = true;
        node.userData.altitude = false;
        this.arenaGroup.add(node);
        return node;
      },
    );
    this.scrubGroup = makeModel(await modelData('scrub'));
    this.scrubGroup.visible = false;
    this.stage.add(this.scrubGroup);
    this.camera.far = 1200;
    this.stage.updateMatrixWorld(true);
    this.collisionMaterials = new Map();
    this.arenaGroup.traverse((o: import('./model-types.ts').RenderNode) => {
      if (o.material) {
        this.collisionMaterials.set(o.material, o.material.side);
      }
    });
    return this.data;
  }
  clear() {
    this.enhancements?.clear();
    if (this.scene.background instanceof THREE.Texture) {
      this.scene.background.dispose();
    }
    this.scene.background = new THREE.Color(0x000000);
    this.contactNodes = new Map();
    this.chaseCamera = new ChaseCamera();
    for (const root of [this.stage, this.objects]) {
      root.traverse((o: import('./model-types.ts').RenderNode) => {
        if (o.geometry) {
          o.geometry.dispose();
        }
        if (o.material) {
          o.material.dispose();
        }
      });
      root.clear();
    }
  }
  enablePlayerSpotlight(data: any, { gain = 1.65, legacyRadius = 0 } = {}) {
    const contour = runnerLightContour(data);
    this.playerSpot = new THREE.Vector3(0, -10000, 0);
    this.playerSpotDirection = { value: new THREE.Vector2(1, 0) };
    this.playerSpotRadius = { value: legacyRadius };
    this.playerSpotGain = { value: gain };
    const edges = {
      value: contour.edges.map((e: number[]) => new THREE.Vector3(...e)),
    };
    this.scene.traverse((node: import('./model-types.ts').RenderNode) => {
      const { material } = node;
      if (!material?.isMeshBasicMaterial) {
        return;
      }
      const originalCompile = material.onBeforeCompile;
      material.onBeforeCompile = (shader, webglRenderer) => {
        originalCompile.call(material, shader, webglRenderer);
        shader.uniforms.playerSpot = { value: this.playerSpot };
        shader.uniforms.playerSpotRadius = this.playerSpotRadius;
        shader.uniforms.playerSpotDirection = this.playerSpotDirection;
        shader.uniforms.playerSpotGain = this.playerSpotGain;
        shader.uniforms.runnerLightEdges = edges;
        shader.vertexShader = 'varying vec3 spotWorld;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nspotWorld=(modelMatrix*vec4(transformed,1.0)).xyz;',
        );
        shader.fragmentShader =
          'varying vec3 spotWorld;\nuniform vec3 playerSpot;\nuniform vec2 playerSpotDirection;\nuniform float playerSpotRadius;\nuniform float playerSpotGain;\n' +
          LIGHT_MASK_GLSL +
          shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
vec2 delta=spotWorld.xz-playerSpot.xz;
vec2 lightPoint=vec2(playerSpotDirection.x*delta.x-playerSpotDirection.y*delta.y,playerSpotDirection.y*delta.x+playerSpotDirection.x*delta.y);
float mask=playerSpotRadius>0.0?step(length(delta),playerSpotRadius):runnerLightMask(lightPoint);
float spotStrength=mask*step(abs(spotWorld.y-playerSpot.y),9.0);
diffuseColor.rgb*=mix(1.0,playerSpotGain,spotStrength);`,
        );
      };
      material.customProgramCacheKey = () => 'runner-source-contour-v1';
      material.needsUpdate = true;
    });
  }
  setPlayerSpotlight(
    r: import('./game-types.ts').RunnerPose,
    escape: import('./game-types.ts').ExitVisualState | null = null,
  ) {
    if (!this.playerSpot) {
      return;
    }
    this.playerSpot.set(r.x, r.y, r.z);
    this.playerSpotDirection.value.set(Math.cos(r.yaw), Math.sin(r.yaw));
    // The original hides lcl_lt during the fold/rise and when the body is absent.
    const exit = runnerExit(r, escape);
    if (
      r.inactive ||
      !runnerBodyVisible(r) ||
      (exit && exit.phase !== 'delay' && exit.phase !== 'center')
    ) {
      this.playerSpot.y = -10000;
    }
  }

  intersections(root = this.arenaGroup) {
    const materials =
      root === this.arenaGroup ? this.collisionMaterials : new Map();
    if (root !== this.arenaGroup) {
      root.traverse((o: import('./model-types.ts').RenderNode) => {
        if (o.material) {
          materials.set(o.material, o.material.side);
        }
      });
    }
    for (const [material] of materials) {
      material.side = THREE.DoubleSide;
    }
    let hits;
    try {
      hits = this.ray.intersectObject(root, true);
    } finally {
      for (const [material, side] of materials) {
        material.side = side;
      }
    }
    return hits.filter((hit) => {
      for (
        let node: THREE.Object3D | null = hit.object;
        node;
        node = node.parent
      ) {
        if (!node.visible) {
          return false;
        }
      }
      return true;
    });
  }

  setExitHangar(heights: { door: number; sign: number }) {
    for (const part of ['door', 'sign'] as const) {
      const node = this.hangarParts[part];
      if (node) {
        node.position.y = heights?.[part] || 0;
      }
    }
    this.arenaGroup?.updateMatrixWorld(true);
  }
  syncExit(sim: Simulation) {
    if (this.exitGroup) {
      this.exitGroup.visible = !!sim.escape && sim.escape.phase !== 'delay';
    }
    this.setExitHangar(sim.exitHangar);
  }
  setDoorHeight(key: string, height: number) {
    const door = this.doors[key];
    if (door) {
      door.position.y = height;
      door.updateMatrixWorld(true);
    }
  }
  setHotSpotState(spot: { id: number; phase: number }) {
    const node = this.hotSpotColliders?.[spot.id];
    if (node) {
      node.visible = spot.phase < 2;
    }
  }
  configurePortals(round: number) {
    for (const [id, parts] of Object.entries(this.portals)) {
      const locked = portalLocked(id, round);
      if (parts.open) {
        parts.open.visible = !locked;
      }
      if (parts.lock) {
        parts.lock.visible = locked;
      }
    }
    this.arenaGroup.updateMatrixWorld(true);
  }
  setPortalHeight(id: string, height: number) {
    const door = this.portals[id]?.open;
    if (door) {
      door.position.y = height;
      door.updateMatrixWorld(true);
    }
  }
  portalApproach(id: string) {
    const parts = this.portals[id];
    let group;
    if (parts?.open?.visible) {
      group = parts.open;
    } else if (parts?.lock?.visible) {
      group = parts.lock;
    } else {
      group = parts?.open || parts?.lock;
    }

    return this.panelApproach(group);
  }
  secretDoorApproach(key: string | number) {
    return this.panelApproach(this.doors[key], true);
  }
  panelApproach(group: THREE.Group | undefined, groundAtBase = false) {
    if (!group) {
      return null;
    }
    const box = new THREE.Box3().setFromObject(group),
      center = box.getCenter(new THREE.Vector3()),
      points: THREE.Vector3[] = [];
    // Some secret lifts are horizontal platforms. Place the diagnostic runner
    // on their top instead of treating the complete group as a vertical gate.
    const size = box.getSize(new THREE.Vector3());
    if (groundAtBase && size.y < Math.min(size.x, size.z) * 0.5) {
      return {
        x: center.x,
        y: this.ground(center.x, center.z, box.max.y + 1),
        z: center.z,
        yaw: 0,
      };
    }
    group.traverse((o: import('./model-types.ts').RenderNode) => {
      if (!o.geometry) {
        return;
      }
      const positions = o.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        points.push(
          new THREE.Vector3()
            .fromBufferAttribute(positions, i)
            .applyMatrix4(o.matrixWorld),
        );
      }
    });
    if (!points.length) {
      return null;
    }
    // Use the complete panel's horizontal principal axis. On barred gates the
    // largest individual face can be the end cap, parallel to the passage.
    const mean = points.reduce(
      (p, v) => ({
        x: p.x + v.x / points.length,
        z: p.z + v.z / points.length,
      }),
      { x: 0, z: 0 },
    );
    let xx = 0,
      xz = 0,
      zz = 0;
    for (const p of points) {
      const x = p.x - mean.x,
        z = p.z - mean.z;
      xx += x * x;
      xz += x * z;
      zz += z * z;
    }
    const angle = 0.5 * Math.atan2(2 * xz, xx - zz),
      normal = { x: -Math.sin(angle), z: Math.cos(angle) };
    const approaches = [1, -1].map((sign) => {
      const x = center.x + normal.x * 10 * sign,
        z = center.z + normal.z * 10 * sign;
      return {
        x,
        y: this.ground(x, z, groundAtBase ? box.min.y + 1 : center.y + 20),
        z,
        yaw: Math.atan2(normal.x * sign, normal.z * sign),
      };
    });
    return approaches.sort(
      (a, b) => Math.abs(a.y - box.min.y) - Math.abs(b.y - box.min.y),
    )[0];
  }
  setScrub(scrub: Scrub) {
    if (!this.scrubGroup) {
      return;
    }
    this.scrubGroup.visible = scrub.active;
    this.scrubGroup.scale.set(scrub.scale, scrub.height, scrub.scale);
    this.camera.far = scrub.active
      ? Math.max(1, 1200 * scrub.scale * 1.05)
      : 1200;
  }
  // 46b688 tests X/Z winding, including its native vertical/edge tolerance.
  // Ordinary ceilings are rejected; there is no arbitrary slope cutoff.
  ground(x: number, z: number, from = 200, support: boolean = false) {
    const hits = altitudeFacetHits(this.arenaGroup, x, z);
    if (!support) {
      let height = null;
      for (const hit of hits) {
        if (hit.height <= from && (height === null || hit.height > height)) {
          height = hit.height;
        }
      }
      return height ?? 0;
    }
    return hits.map(({ height, normal, object }) => ({
      height,
      normal,
      ...(object.userData.portal ? { portal: object.userData.portal } : {}),
      ...(object.userData.secretDoor
        ? { secretDoor: object.userData.secretDoor }
        : {}),
    }));
  }
  sweep(a: Vec3 & { id?: number }, b: Vec3) {
    const d = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z),
      len = d.length();
    if (len < 0.001) {
      return null;
    }
    this.ray.set(new THREE.Vector3(a.x, a.y + 1, a.z), d.normalize());
    this.ray.far = len + 1.7;
    const hits = this.intersections(),
      touched = new Set();
    for (const hit of hits) {
      for (let p: THREE.Object3D | null = hit.object; p; p = p.parent) {
        if (p.userData.secretDoor) {
          this.onDoorTouch?.(p.userData.secretDoor, a);
          break;
        }
        if (
          p.userData.portal &&
          a.id != null &&
          !touched.has(p.userData.portal)
        ) {
          touched.add(p.userData.portal);
          this.onPortalTouch?.(p.userData.portal, a);
          break;
        }
      }
    }
    const hit = hits.find(
      (i) =>
        i.object.userData.intersect &&
        Math.abs(
          i.face!.normal.clone().transformDirection(i.object.matrixWorld).y,
        ) < 0.65,
    );
    if (!hit) {
      return null;
    }
    const n = hit
      .face!.normal.clone()
      .transformDirection(hit.object.matrixWorld);
    n.y = 0;
    n.normalize();
    if (n.dot(d) > 0) {
      n.negate();
    }
    return {
      point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
      normal: { x: n.x, z: n.z },
    };
  }
  blocked(a: Vec3, b: Vec3) {
    return this.sweep(a, b) !== null;
  }
  // Original convex facet predicates feed the recovered physical sweep.
  // Source World-cell and own-shape/child order are retained across display
  // batches. Dynamic World insertion and full runtime hierarchy remain open.
  sweepContacts(a: Vec3, b: Vec3) {
    if (a.x === b.x && a.y === b.y && a.z === b.z) {
      return [];
    }
    this.contactNodes ??= new Map();
    const result = [];
    for (const hit of segmentFacetHits(this.arenaGroup, a, b)) {
      const { name, normal, point } = hit;
      let node = this.contactNodes.get(name);
      if (!node) {
        node = contactNodeFromPath(name);
        this.contactNodes.set(name, node);
      }
      let secretDoor = null,
        portal = null;
      for (let parent = hit.object; parent; parent = parent.parent) {
        secretDoor ??= parent.userData.secretDoor;
        portal ??= parent.userData.portal;
      }
      result.push({
        object: hit.object,
        name,
        node,
        normal: {
          x: Math.fround(normal.x),
          y: Math.fround(normal.y),
          z: Math.fround(normal.z),
        },
        point,
        secretDoor,
        portal,
      });
    }
    // Scene objects stay in the renderer; simulation contact records contain
    // stable source names and the decoded node path rather than renderer cycles.
    return result.map(({ object, ...contact }) => contact);
  }
  // Visibility queries use exact endpoints and do not activate doors or gates.
  lineBlocked(a: Vec3, b: Vec3) {
    return segmentFacetHits(this.arenaGroup, a, b).length > 0;
  }
  // AI look-ahead has exact endpoints and uses decoded runner triangles at the
  // current simulation poses. It never invokes physical door/portal callbacks.
  lineContacts(
    a: any,
    b: any,
    {
      runners = [],
      models = [],
      ignore = null,
    }: {
      runners?: Runner[];
      models?: THREE.Group[];
      ignore?: number | null;
    } = {},
  ) {
    const contacts: { kind: string; distance: number; runner?: number }[] =
      segmentFacetHits(this.arenaGroup, a, b).map((h) => ({
        kind: 'wall',
        distance: h.distance,
      }));
    for (const r of runners) {
      const model = models[r.id];
      if (r.dead || r.id === ignore || !model) {
        continue;
      }
      poseRunnerModel(model, r);
      const hit = segmentFacetHits(model, a, b)[0];
      if (hit) {
        contacts.push({ kind: 'runner', runner: r.id, distance: hit.distance });
      }
    }
    return contacts.sort((x, y) => x.distance - y.distance);
  }

  setEntrance(e: { yawDegrees: any; height: any } | null) {
    if (this.hangarGroup) {
      const m = new THREE.Matrix4().makeRotationY(
        ((e?.yawDegrees || 0) * Math.PI) / 180,
      );
      m.setPosition(0, e?.height || 0, 0);
      this.hangarGroup.matrix
        .copy(m)
        .multiply(
          new THREE.Matrix4().fromArray(this.hangarGroup.userData.baseMatrix),
        );
      this.arenaGroup.updateMatrixWorld(true);
    }
  }
  captureCamera() {
    return {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z,
      pitchDegrees: (this.camera.rotation.x * 180) / Math.PI,
      yawDegrees: (this.camera.rotation.y * 180) / Math.PI,
      rollDegrees: (this.camera.rotation.z * 180) / Math.PI,
    };
  }
  hudReticle(target: import('./game-types.ts').Vec3 | null) {
    if (!target) {
      return null;
    }
    this.camera.updateMatrixWorld(true);
    if (this.responsiveViewport && this.hudLayout) {
      applyResponsiveProjection(this.camera, this.hudLayout);
      return responsiveReticle(
        new THREE.Vector3(target.x, target.y, target.z).project(this.camera),
        this.hudLayout,
      );
    }
    const p = new THREE.Vector3(target.x, target.y, target.z).applyMatrix4(
      this.camera.matrixWorldInverse,
    );
    return projectReticle({
      x: Math.fround(p.x),
      y: Math.fround(-p.y),
      z: Math.fround(-p.z),
    });
  }
  follow(
    p: import('./game-types.ts').RunnerPose &
      Pick<Runner, 'id' | 'speed' | 'turn' | 'vy'>,
    dt: number,
    rear = false,
    barrier = false,
    escape: import('./game-types.ts').ExitVisualState | null = null,
    entrance: import('./game-types.ts').EntranceState | null = null,
  ) {
    if (entrance?.camera && !escape) {
      if (entrance.active) {
        const c = entrance.camera;
        this.camera.position.set(c.x, c.y, c.z);
        this.camera.rotation.set(
          (c.pitchDegrees * Math.PI) / 180,
          (c.yawDegrees * Math.PI) / 180,
          (c.rollDegrees * Math.PI) / 180,
          'YXZ',
        );
        return;
      }
      if (this.finishedEntrance !== entrance) {
        this.finishedEntrance = entrance;
        this.chaseCamera ??= new ChaseCamera();
        Object.assign(this.chaseCamera, {
          runner: p.id,
          distance: Math.hypot(entrance.target.x, entrance.target.z),
          height: entrance.camera.y,
          bank: 0,
          pitch: (entrance.camera.pitchDegrees * Math.PI) / 180,
        });
        const c = entrance.camera;
        this.camera.position.set(c.x, c.y, c.z);
        this.camera.rotation.set(
          (c.pitchDegrees * Math.PI) / 180,
          (c.yawDegrees * Math.PI) / 180,
          (c.rollDegrees * Math.PI) / 180,
          'YXZ',
        );
        return;
      }
    }
    if (escape?.camera) {
      const c = escape.camera;
      this.camera.position.set(c.x, c.y, c.z);
      this.camera.rotation.set(
        (c.pitchDegrees * Math.PI) / 180,
        (c.yawDegrees * Math.PI) / 180,
        (c.rollDegrees * Math.PI) / 180,
        'YXZ',
      );
      return;
    }
    this.chaseCamera ??= new ChaseCamera();
    const pose = this.chaseCamera.follow(p, dt, rear, barrier);
    this.camera.position.set(pose.x, pose.y, pose.z);
    this.camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ');
  }
  draw(seconds = 0, remaining = 300) {
    if (this.enhancedGraphics) {
      this.updateResolution();
    }
    const scale = this.enhancedGraphics ? this.renderScale : 1;
    if (
      this.enhancedGraphics &&
      this.hud &&
      this.enhancements?.paused &&
      this.enhancements.frameScale === scale
    ) {
      return;
    }
    this.scene.traverse((mesh: import('./model-types.ts').RenderNode) => {
      const { cycle } = mesh.userData;
      if (!cycle) {
        return;
      }
      let index = 0;
      if (cycle.clockDigit) {
        const t = Math.max(0, Math.ceil(remaining));
        if (cycle.clockDigit === 'minutes') {
          index = Math.floor(t / 60) % 10;
        } else if (cycle.clockDigit === 'tens') {
          index = Math.floor((t % 60) / 10);
        } else {
          index = t % 10;
        }
      } else if (cycle.enabled) {
        let born = 0;
        for (let p: THREE.Object3D | null = mesh; p; p = p.parent) {
          if (p.userData.born != null) {
            born = p.userData.born;
            break;
          }
        }
        index =
          Math.floor(Math.max(0, seconds - born) * cycle.rate) %
          cycle.textures.length;
      }
      mesh.material!.map = cycle.textures[index];
    });
    this.camera.fov = this.preview ? 18 : 35;
    this.camera.near = this.preview ? 1.5 : 0.75;
    this.camera.far = this.preview ? 1024 : 1200;
    this.renderer.setViewport(
      0,
      0,
      this.responsiveViewport ? this.renderWidth : 320 * scale,
      this.responsiveViewport ? this.renderHeight : 200 * scale,
    );
    if (this.preview) {
      this.renderer.setClearColor(0x000000, 1);
    }
    this.renderer.clear();
    if (this.camera.view?.enabled) {
      this.camera.clearViewOffset();
    }
    if (this.responsiveViewport && this.hud && this.hudLayout) {
      applyResponsiveProjection(this.camera, this.hudLayout);
    } else if (this.hud) {
      this.renderer.setViewport(0, 45 * scale, 320 * scale, 138 * scale);
      this.camera.aspect =
        Math.tan((31 * Math.PI) / 180) / Math.tan((17.5 * Math.PI) / 180);
    } else if (this.preview) {
      this.renderer.setViewport(
        66 * scale,
        87 * scale,
        187 * scale,
        58 * scale,
      );
      this.camera.aspect =
        Math.tan((31 * Math.PI) / 180) / Math.tan((9 * Math.PI) / 180);
    } else {
      this.camera.aspect = 1.6;
    }
    this.camera.updateProjectionMatrix();
    if (this.preview) {
      const preview = this.objects.children.find(
        (root) => root.userData.preview,
      );
      if (preview) {
        if (this.enhancedGraphics) {
          this.scene.background = null;
          preview.userData.preview.floor.visible = true;
        } else {
          this.scene.background = renderPreviewFloor(preview, this.camera);
        }
      }
    }
    if (this.enhancedGraphics && (this.hud || this.preview)) {
      this.enhancements!.render(this.scene, this.camera);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
export { THREE };
