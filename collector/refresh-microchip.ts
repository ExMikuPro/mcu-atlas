import { microchipCollector, normalizeMicrochip } from './adapters/microchip';
import type { ReadSource } from './adapters/types';
import type { Inputs } from './catalog';
import type { Catalog } from './normalize';
import { renderAssets } from '../scripts/assets';
import { json, writeAtomic } from '../scripts/io';

export async function refreshMicrochip(inputs: Inputs, read: ReadSource, snapshot: string, observedAt: string) {
  const collected = await microchipCollector.collect(read, observedAt);
  const previous = new Map(inputs.microchip.parts.map((part) => [part.model, part]));
  const changedModels = collected.parts.filter((part) => json(previous.get(part.model)) !== json(part))
    .map(({ model }) => model);
  const changed = changedModels.length > 0 || previous.size !== collected.parts.length;
  const accepted = changed ? collected : inputs.microchip;
  const assets = renderAssets({ ...inputs, microchip: accepted });

  const previousDocuments = normalizeMicrochip(inputs.microchip).documents;
  const before = new Map(previousDocuments.map((doc) => [doc.key, doc.current]));
  const documents = normalizeMicrochip(accepted).documents;
  const documentChanges: { id: string; before?: Catalog['documents'][number]['current']; after?: Catalog['documents'][number]['current'] }[] = documents.flatMap(({ key, id, current }) => {
    const prior = before.get(key);
    return prior?.revision === current.revision && prior?.url === current.url
      ? [] : [{ id, before: prior, after: current }];
  });
  for (const { key, id, current } of previousDocuments) {
    if (!documents.some((doc) => doc.key === key)) documentChanges.push({ id, before: current, after: undefined });
  }
  if (changed) await writeAtomic(snapshot, json(accepted));

  return { changed, changedModels, documentChanges, orderableParts: accepted.parts.length, assets: assets.size };
}
