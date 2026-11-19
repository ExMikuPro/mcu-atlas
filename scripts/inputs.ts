import { readJson } from './io';
import { editorialEvidence, snapshotSchema, stEvidence } from '../collector/snapshot';

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
  const [snapshot, st] = await Promise.all([readJson(snapshotPath), readStInputs()]);
  return { ...snapshotSchema.parse(snapshot), ...st };
}
