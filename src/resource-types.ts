export interface SavedSource {
  id: string;
  converterVersion: number;
  source: string;
}
export interface ResourceProfile {
  version: number;
  kind: 'demo' | 'cd';
  arenas: number[];
  musicTracks: number[];
  musicExtension: string;
  sourceSha256: string;
  executableSha256: string;
  sourceFiles: number;
}
export interface Installation extends ResourceProfile, SavedSource {
  resourceCount?: number;
  installedAt: string;
}
export interface ResourceFile {
  path: string;
  data: ArrayBuffer;
}
export interface ProgressBytes {
  loaded: number;
  total: number;
}
export interface StageProgress {
  completed?: number;
  total?: number;
  value?: number | null;
}
export interface ImageRequest {
  image: string;
  noCache: boolean;
  defaultImage?: boolean;
}
export type WorkerResult =
  | { type: 'reuse' }
  | { type: 'complete'; files: ResourceFile[]; profile: ResourceProfile };
