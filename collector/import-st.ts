import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { parseStStore } from './adapters/st';
import { normalizeCatalog } from './normalize';
import { stScope } from './scope';
import { snapshotSchema, editorialEvidence, stEvidence } from './snapshot';
import { snapshotPath, stDocumentsPath, stProductsPath } from '../scripts/inputs';
import { json, readJson, writeAtomic } from '../scripts/io';

const [directory, timestamp, ...extra] = process.argv.slice(2);
if (!directory || !timestamp || extra.length) {
  throw new Error('Usage: pnpm import:st <directory-of-reviewed-captures> <UTC ISO timestamp>');
}
const observedAt = z.iso.datetime().parse(timestamp);
if (Date.parse(observedAt) > Date.now()) throw new Error('Evidence time cannot be in the future');

const [snapshot, input, products] = await Promise.all([
  readJson(snapshotPath).then((value) => snapshotSchema.parse(value)),
  readJson(stDocumentsPath).then((value) => editorialEvidence.parse(value)),
  Promise.all(stScope.map(async (entry) => parseStStore(
    await readFile(join(directory, `st-store-${entry.model.toLowerCase()}.html`), 'utf8'), entry,
  ))),
]);
const st = stEvidence.parse({ observedAt, products });
normalizeCatalog({ ...snapshot, st, editorial: input });
await writeAtomic(stProductsPath, json(st));
console.log(`Imported ${st.products.length} reviewed ST product listings.`);
