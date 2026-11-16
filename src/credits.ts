export class CreditsSequence {
  declare data: any;
  declare frames: number;
  declare pixels: number;
  declare finished: boolean;

  constructor(data: any) {
    this.data = data;
    this.frames = 0;
    this.pixels = 0;
    this.finished = false;
  }
  step(dt: number) {
    this.frames += dt * this.data.referenceHz;
    const pixels =
        Math.floor((this.frames + 1e-9) / this.data.framesPerScroll) *
        this.data.scrollPixels,
      changed = pixels !== this.pixels;
    this.pixels = pixels;
    this.finished = this.data.rows.at(-1).y - pixels <= this.data.finishY;
    return changed;
  }
}
