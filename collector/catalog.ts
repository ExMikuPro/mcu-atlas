import { normalizeMicrochip } from './adapters/microchip';
import type { MicrochipEvidence } from './adapters/microchip';
import { normalizeSt } from './adapters/st-catalog';
import type { StInputs } from './adapters/st-catalog';
import { normalizeCatalog } from './normalize';
import type { Catalog } from './normalize';

export type Inputs = StInputs & { microchip: MicrochipEvidence };

type RegisteredVendor = {
  id: string;
  catalog: (inputs: Inputs) => Catalog;
};

const vendors: readonly RegisteredVendor[] = [
  { id: 'st', catalog: normalizeSt },
  { id: 'microchip', catalog: ({ microchip }) => normalizeMicrochip(microchip) },
];

export function buildCatalog(inputs: Inputs): Catalog {
  return normalizeCatalog(vendors.map(({ id, catalog }) => {
    const result = catalog(inputs);
    if (result.manufacturers.length !== 1 || result.manufacturers[0].id !== id) {
      throw new Error(`Invalid manufacturer registration for ${id}`);
    }
    return result;
  }));
}
