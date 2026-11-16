// Native action tests intentionally supply partial memory/state records. Keep
// missing fields absent: adding defaults would change the reference scenario.
type PartialFixture<T> = T extends (...args: any[]) => any
  ? T
  : T extends readonly (infer V)[]
    ? PartialFixture<V>[]
    : T extends object
      ? { [K in keyof T]?: PartialFixture<T[K]> }
      : T;
export function fixture<T>(value: PartialFixture<T>): T {
  return value as T;
}
