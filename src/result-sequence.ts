export class ResultSequence {
  seconds: number = 0;
  declare win: boolean;
  declare onRow: (row: number) => void;
  declare rows: number;
  declare cuedRows: number;

  constructor({
    win = true,
    onRow = () => {},
  }: { win?: boolean; onRow?: (row: number) => void } = {}) {
    this.win = win;
    this.onRow = onRow;
    this.rows = 0;
    this.cuedRows = 0;
  }
  step(dt: number) {
    this.seconds += Math.max(0, dt);
    const frame = Math.floor(this.seconds * 60 + 1e-7),
      maximum = this.win ? 3 : 1;
    const cued = Math.min(
      maximum,
      Math.max(0, Math.floor((frame - 30) / 60) + 1),
    );
    while (this.cuedRows < cued) {
      this.onRow(++this.cuedRows);
    }
    // The native cue installs a new stage; its first labels are queued on the
    // following display iteration (frames 31, 91, 151).
    this.rows = Math.min(
      maximum,
      Math.max(0, Math.floor((frame - 31) / 60) + 1),
    );
    return this.rows;
  }
  get finished() {
    return this.win && this.seconds >= 10 - 1e-9;
  }
  get flashingRow() {
    return this.finished ? 0 : this.rows;
  }
  get numberVisible() {
    if (!this.flashingRow) {
      return true;
    }
    const frame = Math.floor(this.seconds * 60 + 1e-7),
      start = 31 + (this.rows - 1) * 60,
      remaining = (this.rows === 3 ? 1000 : 60) - (frame - start);
    return remaining % 10 > 5;
  }
}
