const stages: Record<string, number> = {
  'Loading game image': 0,
  'Reading game image': 0,
  'Looking for the game image': 0,
  'Preparing the installer': 71,
  'Checking the game image': 72,
  'Extracting files': 73,
  'Preparing textures': 83,
  'Preparing fonts': 85,
  'Preparing models': 86,
  'Preparing menus': 92,
  'Preparing credits': 93,
  'Preparing paths': 94,
  'Preparing animations': 95,
  'Preparing sounds': 96,
  'Preparing resource files': 96,
  'Saving game resources': 97,
  'Loading saved game resources': 97,
  'Activating game resources': 98,
  'Starting DeathDrome': 99,
};
export class ResourceProgress {
  declare value: number;
  declare indeterminate: boolean;
  declare bytes: string;
  declare phase: string;
  declare phasePercent: number | null;

  constructor() {
    this.reset();
  }
  reset() {
    this.value = 0;
    this.indeterminate = false;
    this.bytes = '';
    this.phase = '';
    this.phasePercent = null;
    return this;
  }
  download({ loaded, total }: import('./resource-types.ts').ProgressBytes) {
    this.indeterminate = !total;
    this.bytes = total
      ? `${(loaded / 1_048_576).toFixed(1)} / ${(total / 1_048_576).toFixed(1)} MB`
      : `${(loaded / 1_048_576).toFixed(1)} MB received`;
    if (total) {
      this.value = Math.max(this.value, Math.min(70, (loaded / total) * 70));
    }
    return this;
  }
  stage(
    phase: string,
    {
      completed = 0,
      total = 0,
      value = null,
    }: import('./resource-types.ts').StageProgress = {},
  ) {
    const fraction = total ? Math.min(1, Math.max(0, completed / total)) : null;
    this.phase = phase;
    this.phasePercent = fraction === null ? null : Math.floor(fraction * 100);
    this.indeterminate = false;
    this.bytes = '';
    let next = value ?? stages[phase] ?? this.value;
    const music = /^Preparing CD music track (\d+)$/.exec(phase);
    if (music) {
      next = 79 + Math.min(12, Math.max(0, Number(music[1]) - 1)) / 4;
    }
    if (
      total &&
      ['Preparing resource files', 'Saving game resources'].includes(phase)
    ) {
      next += Math.min(1, Math.max(0, completed / total));
    }
    if (
      fraction !== null &&
      ['Extracting files', 'Preparing models'].includes(phase)
    ) {
      next += fraction * 6;
    }
    this.value = Math.max(this.value, Math.min(99, next));
    return this;
  }
  ready() {
    this.value = 100;
    this.indeterminate = false;
    this.bytes = '';
    this.phase = 'Ready';
    return this;
  }
  get label() {
    return `${this.indeterminate ? '' : Math.floor(this.value) + '%'}${this.bytes ? (this.indeterminate ? '' : ' · ') + this.bytes : ''}`;
  }
}
