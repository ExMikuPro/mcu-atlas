import { readFile } from 'node:fs/promises';
import { cmsisAdapter } from './adapters/cmsis';
import { sourceReader } from './fetch';
import { normalizeCatalog } from './normalize';
import { snapshotSchema } from './snapshot';
import { readStInputs, snapshotPath } from '../scripts/inputs';
import { json, writeAtomic } from '../scripts/io';

const st = await readStInputs();
const previousText = await readFile(snapshotPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
  if (error.code !== 'ENOENT') throw error;
  return undefined;
});
const previous = previousText === undefined ? undefined : snapshotSchema.parse(JSON.parse(previousText));
const collected = await cmsisAdapter.collect(sourceReader(), new Date().toISOString());
const changed = json(collected.packs) !== json(previous?.cmsis.packs);
const cmsis = changed || !previous ? collected : previous.cmsis;
const snapshot = snapshotSchema.parse({ cmsis });
const catalog = normalizeCatalog({ ...snapshot, ...st });

// Only replace the known-good snapshot after every source, relationship and schema is checked.
if (changed || !previous) await writeAtomic(snapshotPath, json(snapshot));
console.log(json({
  changed,
  packs: cmsis.packs.map(({ name, version }) => ({ name, version })),
  devices: catalog.devices.length,
  orderableParts: catalog.orders.length,
  documents: catalog.documents.length,
  verifiedLinks: catalog.applicability.filter(({ verified }) => verified).length,
  stEvidence: 'manual_review',
}).trimEnd());
