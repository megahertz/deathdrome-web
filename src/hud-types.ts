export interface HudMessage {
  text: string;
  until: number;
  color?: string;
  tag?: string | null;
  y?: number;
}
export interface WarningState {
  active: boolean;
  timer: number;
  message?: string | null;
  shade?: string | null;
}
export interface HudOptions {
  picture: (path: string) => HTMLImageElement;
  messages?: HudMessage[];
  now?: number;
  warning?: Pick<WarningState, 'active' | 'shade'> | null;
  reticle?: { x: number; y: number; width: number; height: number } | null;
  frameOnly?: boolean;
  layer?: string;
}
export type HudCommand =
  | { kind: 'image'; value?: never; name: string; x: number; y: number }
  | {
      kind: 'text';
      name?: never;
      value: string;
      color: string;
      x: number;
      y: number;
    }
  | {
      kind: 'rect';
      name?: never;
      value?: never;
      color: string;
      x: number;
      y: number;
      width: number;
      height: number;
    };
export interface HudPanel {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}
export type HudLayout = ReturnType<
  typeof import('./responsive-layout.ts').responsiveHudLayout
>;
