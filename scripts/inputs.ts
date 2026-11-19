import { microchipEvidence } from '../collector/adapters/microchip';
import { readJson } from './io';
import { editorialEvidence, snapshotSchema, stEvidence } from '../collector/snapshot';

export const microchipPath = 'data/seeds/microchip-snapshot.json';
export const readMicrochipInput = async () => microchipEvidence.parse(await readJson(microchipPath));
export const snapshotPath = 'data/seeds/cmsis-snapshot.json';
export const stProductsPath = 'data/seeds/st-products.json';
export const stDocumentsPath = 'data/seeds/st-documents.json';

export async function readStInputs() {
  const [st, editorial] = await Promise.all([
    readJson(stProductsPath),
    readJson(stDocumentsPath),
  ]);
  return { st: stEvidence.parse(st), editorial: editorialEvidence.parse(editorial) };
}

export async function readInputs() {
  const [snapshot, st, microchip] = await Promise.all([readJson(snapshotPath), readStInputs(), readMicrochipInput()]);
  return { ...snapshotSchema.parse(snapshot), ...st, microchip };
}
