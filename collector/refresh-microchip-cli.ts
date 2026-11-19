import { sourceReader } from './fetch';
import { refreshMicrochip } from './refresh-microchip';
import { microchipPath, readInputs } from '../scripts/inputs';
import { json } from '../scripts/io';

const result = await refreshMicrochip(await readInputs(), sourceReader(fetch, 'microchip'), microchipPath, new Date().toISOString());
console.log(json(result).trimEnd());
