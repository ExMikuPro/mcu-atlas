import { z } from 'zod';
import { device, family, manufacturer, orderablePart } from '../schemas/device';
import { applicability, document } from '../schemas/document';
const catalogSchema = z.strictObject({
  manufacturers: z.array(manufacturer).min(1),
  families: z.array(family).min(1),
  devices: z.array(device).min(1),
  orders: z.array(orderablePart).min(1),
  documents: z.array(document).min(1),
  applicability: z.array(applicability).min(1),
});
export type Catalog = z.infer<typeof catalogSchema>;

export const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const sorted = <T>(items: T[], key: (item: T) => string) =>
  items.sort((a, b) => compare(key(a), key(b)));

function indexBy<T>(items: T[], key: (item: T) => string, kind: string) {
  const index = new Map<string, T>();
  for (const item of items) {
    const id = key(item);
    if (index.has(id)) throw new Error(`Conflicting ${kind}: ${id}`);
    index.set(id, item);
  }
  return index;
}

export function normalizeCatalog(catalogs: readonly Catalog[]): Catalog {
  const catalog = catalogSchema.parse({
    manufacturers: catalogs.flatMap((vendor) => vendor.manufacturers),
    families: catalogs.flatMap((vendor) => vendor.families),
    devices: catalogs.flatMap((vendor) => vendor.devices),
    orders: catalogs.flatMap((vendor) => vendor.orders),
    documents: catalogs.flatMap((vendor) => vendor.documents),
    applicability: catalogs.flatMap((vendor) => vendor.applicability),
  });

  const manufacturers = indexBy(catalog.manufacturers, ({ id }) => id, 'manufacturer');
  const families = indexBy(catalog.families, ({ id }) => id, 'family');
  const devices = indexBy(catalog.devices, ({ id }) => id, 'device');
  const documents = indexBy(catalog.documents, ({ key }) => key, 'document');
  const orders = indexBy(catalog.orders, ({ model }) => model, 'orderable model');
  const linkKey = (link: Catalog['applicability'][number]) =>
    JSON.stringify([link.deviceId, link.documentKey, link.orderableModel ?? '']);
  indexBy(catalog.applicability, linkKey, 'applicability link');

  for (const family of catalog.families) {
    if (!manufacturers.has(family.manufacturerId)) throw new Error(`Unknown manufacturer for ${family.id}`);
  }
  for (const item of catalog.devices) {
    const family = families.get(item.familyId);
    if (!family || item.id !== `${family.manufacturerId}:${item.model}`) {
      throw new Error(`Invalid family or device identity for ${item.id}`);
    }
  }
  for (const item of catalog.documents) {
    if (!manufacturers.has(item.manufacturerId) || item.key !== `${item.manufacturerId}:${item.id}`) {
      throw new Error(`Invalid manufacturer or document identity for ${item.key}`);
    }
  }
  for (const link of catalog.applicability) {
    const item = devices.get(link.deviceId);
    const doc = documents.get(link.documentKey);
    if (!item || !doc || families.get(item.familyId)?.manufacturerId !== doc.manufacturerId ||
        (link.orderableModel !== undefined && orders.get(link.orderableModel)?.deviceId !== item.id)) {
      throw new Error(`Invalid document applicability for ${link.deviceId} / ${link.documentKey}`);
    }
  }
  const byDevice = Map.groupBy(catalog.applicability, ({ deviceId }) => deviceId);
  for (const order of catalog.orders) {
    const links = byDevice.get(order.deviceId)?.filter((link) => !link.orderableModel || link.orderableModel === order.model);
    if (!devices.has(order.deviceId) || !links?.length) throw new Error(`Missing device or documents for ${order.model}`);
    indexBy(links, ({ documentKey }) => documentKey, `document association for ${order.model}`);
  }

  return {
    manufacturers: sorted(catalog.manufacturers, ({ id }) => id),
    families: sorted(catalog.families, ({ id }) => id),
    devices: sorted(catalog.devices, ({ id }) => id),
    orders: sorted(catalog.orders, ({ model }) => model),
    documents: sorted(catalog.documents, ({ key }) => key),
    applicability: sorted(catalog.applicability, linkKey),
  };
}
