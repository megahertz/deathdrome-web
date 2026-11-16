export class AdaptiveResolution {
  declare factor: number;
  declare elapsed: number;
  declare slow: number;
  declare fast: number;
  declare cooldown: number;
  declare average: number;

  constructor() {
    this.reset();
  }
  reset() {
    this.factor = 1;
    this.elapsed = 0;
    this.slow = 0;
    this.fast = 0;
    this.cooldown = 0;
    this.average = 1 / 60;
  }
  sample(dt: number, active = true) {
    if (!active || !Number.isFinite(dt) || dt <= 0 || dt > 0.1) {
      return this.factor;
    }
    this.elapsed += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.average += (dt - this.average) * 0.08;
    if (this.elapsed < 2) {
      return this.factor;
    } // Ignore shader compilation and entry transitions.
    this.slow = this.average > 1 / 43 ? this.slow + dt : 0;
    this.fast = this.average < 1 / 57 ? this.fast + dt : 0;
    if (!this.cooldown && this.slow > 1) {
      this.factor = Math.max(0.4, this.factor - 0.15);
      this.cooldown = 2;
      this.fast = 0;
      this.slow = this.fast;
    } else if (!this.cooldown && this.fast > 6) {
      this.factor = Math.min(1, this.factor + 0.1);
      this.cooldown = 3;
      this.fast = 0;
      this.slow = this.fast;
    }
    return this.factor;
  }
}
