// Original level geometry is supplied by the installed user image, never bundled.
export const REGION_DATA={};
export function configureRegionData(data){
 if(!data?.origin||!data?.extents||!data?.partition||!Array.isArray(data.arenas))throw Error('Invalid game region data');
 Object.assign(REGION_DATA,data);
}
