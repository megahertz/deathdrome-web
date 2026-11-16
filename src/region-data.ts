// Original level geometry is supplied by the installed user image, never bundled.
export interface RegionData {
  origin: number[];
  extents: number[];
  partition: number[];
  arenas: { color: number; vertices: number[][] }[][];
}
// Populated by the loader before creating a domain.
export const REGION_DATA = {} as RegionData;
export function configureRegionData(data: {
  origin: any;
  extents: any;
  partition: any;
  arenas: any;
}) {
  if (
    !data?.origin ||
    !data?.extents ||
    !data?.partition ||
    !Array.isArray(data.arenas)
  ) {
    throw Error('Invalid game region data');
  }
  Object.assign(REGION_DATA, data);
}
