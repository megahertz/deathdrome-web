export interface AudioOptions {
  detail: number;
  brightness: number;
  musicVolume: number;
  sfxVolume: number;
  musicEnabled: boolean;
  enhancedGraphics: boolean;
}
export type NumericOption =
  | 'detail'
  | 'brightness'
  | 'musicVolume'
  | 'sfxVolume';
export interface AudioChange {
  sound?: string;
  options?: AudioOptions;
  muted?: boolean;
  suspended?: boolean;
  track?: number | null;
  music?: { source: string; track?: number; ready: boolean; duration?: number };
}
export interface AudioEffect extends HTMLAudioElement {
  baseVolume: number;
}
