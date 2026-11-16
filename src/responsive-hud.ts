import { drawBitmapText, bitmapWidth } from './bitmap-ui.ts';
import {
  HUD_STRETCH_BANDS,
  hudBandSlices,
  hudWidgetSlices,
  hudAnchorX,
} from './hud-stretch.ts';
import { drawHud, hudScreenCommands } from './hud.ts';
import { responsiveHudLayout } from './responsive-layout.ts';
import { type Simulation } from './simulation.ts';
export class ResponsiveHud {
  declare frame: HTMLCanvasElement;
  declare frameContext: CanvasRenderingContext2D;
  declare widgets: HTMLCanvasElement;
  declare widgetContext: CanvasRenderingContext2D;
  declare probe: HTMLDivElement;

  constructor() {
    this.frame = document.createElement('canvas');
    this.frame.width = 640;
    this.frame.height = 400;
    this.frameContext = this.frame.getContext('2d')!;
    this.frameContext.setTransform(2, 0, 0, 2, 0, 0);
    this.widgets = document.createElement('canvas');
    this.widgets.width = 640;
    this.widgets.height = 400;
    this.widgetContext = this.widgets.getContext('2d')!;
    this.widgetContext.setTransform(2, 0, 0, 2, 0, 0);
    this.probe = document.createElement('div');
    this.probe.className = 'responsive-hud-safe-area';
    this.probe.setAttribute('aria-hidden', 'true');
    document.body.append(this.probe);
  }
  layout(stage: HTMLElement, touch: boolean) {
    const rect = stage.getBoundingClientRect(),
      style = getComputedStyle(this.probe);
    return responsiveHudLayout(rect.width, rect.height, {
      touch,
      safe: {
        left: parseFloat(style.paddingLeft),
        right: parseFloat(style.paddingRight),
        top: parseFloat(style.paddingTop),
        bottom: parseFloat(style.paddingBottom),
      },
    });
  }
  draw(
    ctx: CanvasRenderingContext2D,
    sim: Simulation,
    player: number,
    options: import('./hud-types.ts').HudOptions,
    layout: import('./hud-types.ts').HudLayout,
  ) {
    drawHud(this.frameContext, sim, player, {
      ...options,
      reticle: null,
      frameOnly: true,
      layer: 'art',
    });
    drawHud(this.widgetContext, sim, player, {
      ...options,
      reticle: null,
      warning: null,
      frameOnly: true,
      layer: 'widgets',
    });
    const { width, height, pixelRatio } = layout,
      { canvas } = ctx,
      w = Math.round(width * pixelRatio),
      h = Math.round(height * pixelRatio);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(w / width, 0, 0, h / height, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;
    const { top } = layout,
      { bottom } = layout;
    const paint = (
      image: HTMLCanvasElement,
      p: {
        sx: any;
        sy: any;
        sw: any;
        sh: any;
        dx: any;
        dy: any;
        dw: any;
        dh: any;
      },
    ) => ctx.drawImage(image, p.sx, p.sy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh);
    for (const band of HUD_STRETCH_BANDS) {
      for (const part of hudBandSlices(
        layout[band.panel as 'top' | 'bottom'],
        band,
      )) {
        paint(this.frame, part);
      }
    }
    for (const part of hudWidgetSlices(top, { y: 0, height: 48, split: 224 })) {
      paint(this.widgets, part);
    }
    for (const part of hudWidgetSlices(bottom, {
      y: 137,
      height: 63,
      split: 185,
      origin: 137,
    })) {
      paint(this.widgets, part);
    }
    if (options.warning?.active) {
      const image = options.picture('hud/big/hudwrn_' + options.warning.shade);
      if (image.complete && image.naturalWidth) {
        ctx.drawImage(
          image,
          hudAnchorX(bottom, 144, 'center'),
          bottom.y + 45 * bottom.scale,
          33 * bottom.scale,
          7 * bottom.scale,
        );
      }
    }
    const { reticle } = options;
    if (reticle) {
      const image = options.picture('hud/big/reticle');
      if (image.complete && image.naturalWidth) {
        ctx.drawImage(
          image,
          reticle.x,
          reticle.y,
          reticle.width,
          reticle.height,
        );
      }
    }
    for (const c of hudScreenCommands(sim, player, options)) {
      const scale = Math.min(
        c.scale * top.scale,
        (width - layout.safe.left - layout.safe.right - 16) /
          Math.max(1, bitmapWidth(c.value, c.size)),
      );
      drawBitmapText(
        ctx,
        c.value,
        (width - bitmapWidth(c.value, c.size) * scale) / 2,
        layout.play.y + ((c.y - 17) / 138) * layout.play.height,
        { size: c.size, color: c.color, scale },
      );
    }
    canvas.dataset.hudLayout = 'responsive';
    canvas.dataset.hudStretch = 'segmented';
    canvas.dataset.topScale = String(top.scale);
    canvas.dataset.bottomScale = String(bottom.scale);
  }
}
export function restoreOriginalHud(ctx: CanvasRenderingContext2D) {
  if (ctx.canvas.width !== 640 || ctx.canvas.height !== 400) {
    ctx.canvas.width = 640;
    ctx.canvas.height = 400;
  }
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.canvas.dataset.hudLayout = 'original';
}
