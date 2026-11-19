import type { Applicability, Document } from '../../schemas/document';
import { createCmsisAdapter } from './cmsis';
import { createStAdapter } from './st';
import { stManufacturer, stScope } from '../scope';
import type { CmsisEvidence, EditorialEvidence, StEvidence } from '../snapshot';
import { compare } from '../normalize';
import type { Catalog } from '../normalize';

export type StInputs = { cmsis: CmsisEvidence; st: StEvidence; editorial: EditorialEvidence };



function remember<T>(map: Map<string, T>, key: string, value: T) {
  const current = map.get(key);
  if (current && JSON.stringify(current) !== JSON.stringify(value)) throw new Error(`Conflicting records for ${key}`);
  map.set(key, value);
}

export function normalizeSt({ cmsis, st, editorial }: StInputs): Catalog {
  const packs = createCmsisAdapter(cmsis);
  const manufacturerAdapter = createStAdapter(st, editorial);
  const families = new Map<string, Catalog['families'][number]>();
  const orders = new Map<string, Catalog['orders'][number]>();
  const documents = new Map<string, Document>();
  const relationships: Applicability[] = [];
  const devices: Catalog['devices'] = [];

  for (const input of stScope) {
    const manufacturerDevice = manufacturerAdapter.findDevice(input.model);
    const packDevice = packs.findDevice(input.model);
    const product = st.products.find(({ device }) => device === input.model);
    const rawPack = cmsis.packs.find((pack) => pack.name === input.pack)?.devices.find(({ model }) => model === input.model);
    if (!manufacturerDevice || product?.sourceUrl !== input.productUrl ||
        compare(product.models.join(','), input.orders.join(',')) !== 0) {
      throw new Error(`ST product evidence mismatch for ${input.model}`);
    }
    if (!packDevice || packDevice.family !== `${input.family} Series` ||
        rawPack?.vendor !== 'STMicroelectronics:13') {
      throw new Error(`CMSIS and ST disagree for ${input.model}`);
    }

    const familyId = `st-${input.family.toLowerCase()}`;
    const deviceId = `st:${input.model}`;
    remember(families, familyId, { id: familyId, manufacturerId: stManufacturer.id, name: input.family });
    devices.push({ id: deviceId, model: input.model, familyId, sources: [manufacturerDevice.source, packDevice.source] });

    for (const model of input.orders) {
      const part = manufacturerAdapter.findDevice(model);
      if (part?.kind !== 'orderable_part' || part.device !== input.model) throw new Error(`Unproven orderable part ${model}`);
      remember(orders, model, { model, deviceId, source: part.source });
    }

    const findings = manufacturerAdapter.getDocuments(manufacturerDevice);
    if (findings.length !== input.documents.length ||
        input.documents.some((id) => !findings.some((doc) => doc.id === id))) {
      throw new Error(`Document applicability mismatch for ${input.model}`);
    }
    for (const { id, title, type, source, scope, verified, url, revision, publishedAt, listedUpdatedAt } of findings) {
      if (!id || !type || !verified || source.url !== input.documentationUrl ||
          !url?.startsWith('https://www.st.com/resource/en/') ||
          (type === 'datasheet' && url !== product.datasheetUrl)) {
        throw new Error(`ST product and document evidence disagree for ${input.model} / ${id}`);
      }
      const conflictingBook = packs.getDocuments(packDevice)
        .find((book) => book.type === 'reference_manual' && book.id && type === 'reference_manual' && book.id !== id);
      if (conflictingBook) throw new Error(`CMSIS and ST reference manuals disagree for ${input.model}: ${conflictingBook.id} / ${id}`);
      const key = `${stManufacturer.id}:${id}`;
      remember(documents, key, { key, manufacturerId: stManufacturer.id, id, title, type,
        current: { revision, url, publishedAt, listedUpdatedAt } });
      relationships.push({ deviceId, documentKey: key, sourceScope: scope, verified, source });
    }
  }

  if (st.products.length !== devices.length || editorial.documents.some(
    (doc) => new Set(doc.appliesTo).size !== doc.appliesTo.length || doc.appliesTo.some(
      (name) => !devices.some((device) => device.model === name)),
  )) {
    throw new Error('ST evidence contains duplicate or unconfigured device associations');
  }
  return {
    manufacturers: [stManufacturer],
    families: [...families.values()],
    devices: devices,
    orders: [...orders.values()],
    documents: [...documents.values()],
    applicability: relationships,
  };
}
