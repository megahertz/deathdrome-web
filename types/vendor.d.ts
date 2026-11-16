declare module '#three' {
  export * from 'three';
}

declare module '*vendor/pyodide/pyodide.mjs' {
  export function loadPyodide(options: { indexURL: string }): Promise<{
    unpackArchive(
      bytes: Uint8Array,
      type: string,
      options: { extractDir: string },
    ): void;
    FS: {
      writeFile(path: string, data: Uint8Array): void;
      readFile(path: string): Uint8Array<ArrayBuffer>;
      unlink(path: string): void;
    };
    globals: {
      set(name: string, value: string): void;
      get(name: 'reuse'): boolean;
      get(name: 'files_json' | 'profile_json'): string;
    };
    runPythonAsync(code: string): Promise<unknown>;
  }>;
}
interface Window {
  deathdromeInstallation?: import('../src/resource-types.ts').Installation;
}
interface DedicatedWorkerGlobalScope {
  reportProgress: (phase: string, completed?: number, total?: number) => void;
}
