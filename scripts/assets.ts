import { createHash } from 'node:crypto';
import { lookupAsset, manifest, searchIndex } from '../schemas/response';
import { buildCatalog } from '../collector/catalog';
import type { Inputs } from '../collector/catalog';
import { lookupAssetPath } from '../schemas/asset-key';
import { json } from './io';

export const outputDir = 'generated-assets';

export function renderAssets(inputs: Inputs): Map<string, string> {
  const catalog = buildCatalog(inputs);
  const families = new Map(catalog.families.map((entry) => [entry.id, entry]));
  const manufacturers = new Map(catalog.manufacturers.map((entry) => [entry.id, entry]));
  const devices = new Map(catalog.devices.map((entry) => [entry.id, entry]));
  const docs = new Map(catalog.documents.map((entry) => [entry.key, entry]));
  const links = Map.groupBy(catalog.applicability, (entry) => entry.deviceId);
  const entries = catalog.orders.map((order) => {
    const device = devices.get(order.deviceId)!;
    const family = families.get(device.familyId)!;
    const manufacturer = manufacturers.get(family.manufacturerId)!;
    return { model: order.model, manufacturer: manufacturer.name, family: family.name, device: device.model };
  });
  const schemaVersion = 1;
  const dataVersion = `sha256:${createHash('sha256').update(json({ schemaVersion, assetFormat: 2, catalog })).digest('hex')}`;
  const files = new Map<string, string>();
  for (const [index, entry] of entries.entries()) {
    const order = catalog.orders[index];
    const documents = links.get(order.deviceId)!.filter((link) => !link.orderableModel || link.orderableModel === order.model).map((link) => {
      const document = docs.get(link.documentKey)!;
      return {
        id: document.id,
        type: document.type,
        title: document.title,
        ...document.current,
        sourceUrl: link.source.url,
        sourceScope: link.sourceScope,
        verified: link.verified,
        verifiedAt: link.verified ? link.source.observedAt : undefined,
      };
    });
    const asset = lookupAsset.parse({
      dataVersion,
      response: { success: true, ...entry, documents, orderableSource: order.source },
    });
    files.set(`v1/${lookupAssetPath(entry.model)}`, json(asset));
  }
  const info = manifest.parse({
    schemaVersion,
    dataVersion,
    // This is the time of the latest evidence that contributed to this reproducible snapshot.
    generatedAt: new Date([
      ...catalog.devices.flatMap(({ sources }) => sources),
      ...catalog.orders.map(({ source }) => source),
      ...catalog.applicability.map(({ source }) => source),
    ].reduce((latest, { observedAt }) => Math.max(latest, Date.parse(observedAt)), 0)).toISOString(),
    models: entries.map((entry) => entry.model),
    counts: {
      models: catalog.orders.length,
      devices: catalog.devices.length,
      manufacturers: catalog.manufacturers.length,
      documents: catalog.documents.length,
      verifiedDocuments: new Set(catalog.applicability.filter((link) => link.verified).map((link) => link.documentKey)).size,
    },
  });
  files.set('v1/catalog.json', json(catalog));
  files.set('v1/search/index.json', json(searchIndex.parse({ dataVersion, entries })));
  files.set('v1/manifest.json', json(info));
  if (files.size > 20_000) throw new Error('Static asset count exceeds the Workers Free limit');
  for (const [name, bytes] of files) {
    if (Buffer.byteLength(bytes) > 25 * 1024 * 1024) throw new Error(`Static asset exceeds 25 MiB: ${name}`);
  }
  return files;
}
