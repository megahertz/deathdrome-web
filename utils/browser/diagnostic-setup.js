// Local diagnostic pages require separately extracted original region data.
import {configureRegionData} from './region-data.js';
const response=await fetch('assets/region-data.json');
if(!response.ok)throw Error('Local diagnostics require private assets; run npm run start:reference after extracting the game.');
configureRegionData(await response.json());
