import * as THREE from '#three';
const vertex =
  'varying vec2 screenUv;void main(){screenUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
const blur = `uniform sampler2D source;uniform vec2 direction;varying vec2 screenUv;
void main(){vec3 c=texture2D(source,screenUv).rgb*.227027;
c+=(texture2D(source,screenUv+direction*1.384615).rgb+texture2D(source,screenUv-direction*1.384615).rgb)*.316216;
c+=(texture2D(source,screenUv+direction*3.230769).rgb+texture2D(source,screenUv-direction*3.230769).rgb)*.070270;
gl_FragColor=vec4(c,1.0);}`;
const composite = `uniform sampler2D source;uniform sampler2D glow;uniform vec4 viewBounds;varying vec2 screenUv;
void main(){float inside=step(viewBounds.x,screenUv.x)*step(viewBounds.y,screenUv.y)*step(screenUv.x,viewBounds.z)*step(screenUv.y,viewBounds.w);gl_FragColor=vec4(texture2D(source,screenUv).rgb+texture2D(glow,screenUv).rgb*.32*inside,1.0);
#include <colorspace_fragment>
}`;
export class EnhancedPipeline {
  declare renderer: THREE.WebGLRenderer;
  declare width: number;
  declare height: number;
  declare blackMaterials: Map<THREE.Material, THREE.MeshBasicMaterial>;
  private materialDisposers = new Map<THREE.Material, () => void>();
  declare postScene: any;
  declare postCamera: any;
  declare blurMaterial: any;
  declare compositeMaterial: any;
  declare quad: any;
  declare sceneTarget: any;
  declare glowWidth: number;
  declare glowHeight: number;
  declare glowTarget: any;
  declare blurTarget: any;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.width = 0;
    this.height = 0;
    this.blackMaterials = new Map();
    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.Camera();
    this.blurMaterial = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: blur,
      uniforms: {
        source: { value: null },
        direction: { value: new THREE.Vector2() },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.compositeMaterial = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: composite,
      uniforms: {
        source: { value: null },
        glow: { value: null },
        viewBounds: { value: new THREE.Vector4(0, 0, 1, 1) },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.blurMaterial,
    );
    this.quad.frustumCulled = false;
    this.postScene.add(this.quad);
  }
  resize(width: number, height: number) {
    if (this.width === width && this.height === height) {
      return;
    }
    this.releaseTargets();
    this.width = width;
    this.height = height;
    const options = { depthBuffer: true, type: THREE.UnsignedByteType };
    this.sceneTarget = new THREE.WebGLRenderTarget(width, height, {
      ...options,
      samples: Math.min(4, this.renderer.capabilities.maxSamples || 0),
    });
    this.sceneTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.glowWidth = Math.max(1, Math.round(width / 4));
    this.glowHeight = Math.max(1, Math.round(height / 4));
    this.glowTarget = new THREE.WebGLRenderTarget(
      this.glowWidth,
      this.glowHeight,
      options,
    );
    this.blurTarget = new THREE.WebGLRenderTarget(
      this.glowWidth,
      this.glowHeight,
      { depthBuffer: false },
    );
  }
  blackMaterial(source: THREE.Material) {
    if (!this.blackMaterials.has(source)) {
      const black = new THREE.MeshBasicMaterial({ color: 0x00_00_00 });
      const dispose = () => {
        source.removeEventListener('dispose', dispose);
        this.blackMaterials.delete(source);
        this.materialDisposers.delete(source);
        black.dispose();
      };
      this.blackMaterials.set(source, black);
      this.materialDisposers.set(source, dispose);
      source.addEventListener('dispose', dispose);
    }
    const black = this.blackMaterials.get(source)!;
    const surface = source as Partial<THREE.MeshBasicMaterial>;
    Object.assign(black, {
      map: surface.map ?? null,
      alphaMap: surface.alphaMap ?? null,
      alphaTest: source.alphaTest,
      side: source.side,
      depthTest: source.depthTest,
      depthWrite: source.depthWrite,
      transparent: source.transparent,
      opacity: source.opacity,
      polygonOffset: source.polygonOffset,
      polygonOffsetFactor: source.polygonOffsetFactor,
      polygonOffsetUnits: source.polygonOffsetUnits,
    });
    black.fog = false;
    return black;
  }
  glowScene(scene: THREE.Scene, camera: THREE.Camera, viewport: THREE.Vector4) {
    const restore: (() => unknown)[] = [],
      { background } = scene,
      { fog } = scene;
    scene.background = new THREE.Color(0);
    scene.fog = null;
    scene.traverse(
      (
        node: THREE.Object3D & { material?: THREE.Material | THREE.Material[] },
      ) => {
        if (!node.material) {
          return;
        }
        if (node.userData.enhancedSkipGlow) {
          restore.push(() => {
            node.visible = true;
            return node.visible;
          });
          if (!node.visible) {
            restore.pop();
            return;
          }
          node.visible = false;
          return;
        }
        if ((node.material as THREE.ShaderMaterial).uniforms?.glowOnly) {
          const uniform = (node.material as THREE.ShaderMaterial).uniforms
              .glowOnly,
            old = uniform.value;
          uniform.value = true;
          restore.push(() => {
            uniform.value = old;
            return uniform.value;
          });
        }
        let glow = false;
        for (
          let parent: THREE.Object3D | null = node;
          parent;
          parent = parent.parent
        ) {
          if (parent.userData.enhancedGlow) {
            glow = true;
            break;
          }
        }
        if (!glow) {
          const original = node.material;
          node.material = Array.isArray(original)
            ? original.map((m) => this.blackMaterial(m))
            : this.blackMaterial(original);
          restore.push(() => {
            node.material = original;
            return node.material;
          });
        }
      },
    );
    this.glowTarget.viewport.set(
      (viewport.x * this.glowWidth) / this.width,
      (viewport.y * this.glowHeight) / this.height,
      (viewport.z * this.glowWidth) / this.width,
      (viewport.w * this.glowHeight) / this.height,
    );
    this.renderer.setRenderTarget(this.glowTarget);
    try {
      this.renderer.clear();
      this.renderer.render(scene, camera);
    } finally {
      for (const undo of restore) {
        undo();
      }
      scene.background = background;
      scene.fog = fog;
    }
  }
  post(target: null, material: any) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.postScene, this.postCamera);
  }
  render(scene: THREE.Scene, camera: THREE.Camera) {
    const { renderer } = this,
      size = renderer.getDrawingBufferSize(new THREE.Vector2()),
      viewport = renderer.getViewport(new THREE.Vector4());
    this.resize(size.x, size.y);
    this.sceneTarget.viewport.copy(viewport);
    renderer.setRenderTarget(this.sceneTarget);
    renderer.clear();
    renderer.render(scene, camera);
    this.glowScene(scene, camera, viewport);
    this.blurMaterial.uniforms.source.value = this.glowTarget.texture;
    this.blurMaterial.uniforms.direction.value.set(1.8 / this.glowWidth, 0);
    this.post(this.blurTarget, this.blurMaterial);
    this.glowTarget.viewport.set(0, 0, this.glowWidth, this.glowHeight);
    this.blurMaterial.uniforms.source.value = this.blurTarget.texture;
    this.blurMaterial.uniforms.direction.value.set(0, 1.8 / this.glowHeight);
    this.post(this.glowTarget, this.blurMaterial);
    this.compositeMaterial.uniforms.viewBounds.value.set(
      viewport.x / size.x,
      viewport.y / size.y,
      (viewport.x + viewport.z) / size.x,
      (viewport.y + viewport.w) / size.y,
    );
    this.compositeMaterial.uniforms.source.value = this.sceneTarget.texture;
    this.compositeMaterial.uniforms.glow.value = this.glowTarget.texture;
    renderer.setViewport(0, 0, size.x, size.y);
    this.post(null, this.compositeMaterial);
    renderer.setViewport(viewport);
    renderer.domElement.dataset.msaaSamples = String(this.sceneTarget.samples);
  }
  releaseTargets() {
    for (const name of ['sceneTarget', 'glowTarget', 'blurTarget'] as const) {
      this[name]?.dispose();
      this[name] = null;
    }
    this.height = 0;
    this.width = this.height;
  }
  clearMaterials() {
    for (const dispose of this.materialDisposers.values()) {
      dispose();
    }
  }
  dispose() {
    this.releaseTargets();
    this.clearMaterials();
    this.quad.geometry.dispose();
    this.blurMaterial.dispose();
    this.compositeMaterial.dispose();
  }
}
