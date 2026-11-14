import { Color, Vector2 } from '../vendor/three.module.js';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';

/** HDR scene -> soft bloom -> one tone-map/sRGB conversion.
 *
 * The caller owns the renderer's toneMapping, toneMappingExposure, outputColorSpace,
 * canvas size and DPR. OutputPass reads those settings without changing them.
 * Keep WebGLRenderer's default outputBufferType when using this external composer;
 * its optional internal HalfFloat output pipeline would add a second output pass.
 */
export class ShaderPipeline {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.disposed = false;
    this._clearColor = new Color();
    const size = renderer.getSize(new Vector2());
    this.width = Math.max(1, Math.round(size.x));
    this.height = Math.max(1, Math.round(size.y));
    this.pixelRatio = renderer.getPixelRatio();

    // EffectComposer uses HalfFloat render targets. Three renders intermediate
    // targets in linear space without applying the renderer's display tone map.
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.bloomPass = new UnrealBloomPass(new Vector2(this.width * this.pixelRatio, this.height * this.pixelRatio), .45, .45, 1.05);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.outputPass);
    this.composer.setSize(this.width, this.height);
  }

  /** Width/height are CSS pixels. DPR is applied once by EffectComposer. */
  resize(width, height, pixelRatio = 1) {
    if (this.disposed) return;
    const w = Number.isFinite(width) ? Math.max(1, Math.round(width)) : this.width;
    const h = Number.isFinite(height) ? Math.max(1, Math.round(height)) : this.height;
    const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
    if (w === this.width && h === this.height && ratio === this.pixelRatio) return;
    if (ratio !== this.pixelRatio) this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    this.width = w;
    this.height = h;
    this.pixelRatio = ratio;
  }

  /** A single chain serves both the arena and merchant scenes. */
  render(scene, camera, quality = 'high') {
    if (this.disposed) return;
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    if (quality === 'low') {
      this.renderer.render(scene, camera);
      return;
    }

    const renderer = this.renderer;
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousClearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this._clearColor);
    try {
      this.composer.render();
    } finally {
      // The stock passes restore these during normal rendering. Also restore
      // them if a render throws, so portrait/direct rendering remains usable.
      renderer.autoClear = previousAutoClear;
      renderer.setClearColor(this._clearColor, previousClearAlpha);
      renderer.setRenderTarget(previousTarget);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.renderPass.dispose();
    // Three r187 UnrealBloomPass.dispose omits its high-pass filter material.
    this.bloomPass.materialHighPassFilter.dispose();
    this.bloomPass.dispose();
    this.outputPass.dispose();
    this.composer.dispose();
    this.composer.timer?.dispose?.();
    this.composer.passes.length = 0;
    this.renderPass.scene = null;
    this.renderPass.camera = null;
  }
}
