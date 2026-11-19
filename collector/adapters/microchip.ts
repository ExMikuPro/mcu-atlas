import { z } from 'zod';
import { model, modelQuery, publicUrl } from '../../schemas/device';
import type { Source } from '../../schemas/device';
import { compare } from '../normalize';
import type { Catalog } from '../normalize';
import type { Adapter, DocumentFinding, ReadSource, SourceCollector } from './types';

export const microchipProductApi = 'https://www.microchip.com/designresources/product-catalog/api/productInfo';
const pageSize = 20;
const maxPages = 10;
const publisher = 'Microchip Technology Inc.';
export const microchipManufacturer = { id: 'microchip', name: 'Microchip Technology' };

export const microchipScope = [
  {
    query: 'PIC16F18313', base: 'PIC16F18313', family: 'PIC', familyId: 'microchip-pic', primaryId: 'DS40001799',
    orders: ['PIC16F18313-E/P', 'PIC16F18313-I/P', 'PIC16F18313-I/SN', 'PIC16F18313T-I/SN'],
    secondaryModels: [],
  },
  {
    query: 'ATMEGA328P', base: 'ATMEGA328P', family: 'AVR', familyId: 'microchip-avr', primaryId: 'DS40002061',
    orders: ['ATMEGA328P-15AZ', 'ATMEGA328P-15MZ', 'ATMEGA328P-AU', 'ATMEGA328P-AUR'],
    secondaryModels: ['ATMEGA328P-15AZ', 'ATMEGA328P-15MZ'],
  },
  {
    query: 'ATSAMD21G18A', base: 'ATSAMD21G18', family: 'SAM', familyId: 'microchip-sam', primaryId: 'DS40001882',
    orders: ['ATSAMD21G18A-AF', 'ATSAMD21G18A-AU', 'ATSAMD21G18A-AUT', 'ATSAMD21G18A-UUT'],
    secondaryModels: [],
  },
] as const;

type Scope = (typeof microchipScope)[number];
const apiRow = z.object({
  manufacturer: z.string(),
  part_number: z.string().trim().min(1),
  base_part_number: z.string(),
  product_url: z.string(),
  datasheet_url: z.string(),
  secondary_datasheet_url: z.string(),
  component_type: z.string(),
});
const page = z.object({
  totalRecords: z.int().nonnegative(),
  pagenumber: z.int().positive(),
  pagesize: z.int().positive(),
  totalPages: z.int().nonnegative(),
  data: z.array(apiRow),
});
function documentUrl(value: string) {
  const url = new URL(value);
  return url.origin === 'https://ww1.microchip.com' &&
    /^\/downloads\/(?:aemDocuments\/documents\/(?:[A-Za-z0-9-]+\/)+DataSheets\/|en\/DeviceDoc\/)[A-Za-z0-9._-]+\.pdf$/i.test(url.pathname);
}
const datasheetUrl = publicUrl.refine((value) => URL.canParse(value) && documentUrl(value), 'Expected an official Microchip datasheet PDF URL');
const partEvidence = z.strictObject({
  model,
  base: model,
  productUrl: publicUrl,
  datasheetUrl,
  secondaryDatasheetUrl: datasheetUrl.optional(),
}).refine(({ model, productUrl }) => {
  if (!URL.canParse(productUrl)) return false;
  const url = new URL(productUrl);
  if (url.origin !== 'https://www.microchipdirect.com' || !url.pathname.startsWith('/product/')) return false;
  try {
    return decodeURIComponent(url.pathname.slice('/product/'.length)).toUpperCase() === model;
  } catch {
    return false;
  }
}, 'Expected an official product URL for the exact ordering code');
export const microchipEvidence = z.strictObject({
  observedAt: z.iso.datetime(),
  parts: z.array(partEvidence).min(1),
});
export type MicrochipEvidence = z.infer<typeof microchipEvidence>;
type Part = MicrochipEvidence['parts'][number];

export function microchipPageUrl(query: string, pageNumber: number): string {
  const url = new URL(microchipProductApi);
  url.search = new URLSearchParams({ part: query, pagesize: String(pageSize), pagenumber: String(pageNumber) }).toString();
  return url.href;
}

async function collectScope(read: ReadSource, scope: Scope): Promise<Part[]> {
  const parts = new Map<string, z.infer<typeof apiRow>>();
  let total = 0;
  let pages = 1;
  for (let number = 1; number <= pages; number++) {
    const result = page.parse(JSON.parse(await read(microchipPageUrl(scope.query, number))));
    if (number === 1) {
      total = result.totalRecords;
      pages = result.totalPages;
    }
    if (pages < 1 || pages > maxPages || result.totalRecords !== total ||
        result.totalPages !== pages || pages !== Math.ceil(total / pageSize) ||
        result.pagenumber !== number || result.pagesize !== pageSize ||
        result.data.length !== Math.min(pageSize, total - (number - 1) * pageSize)) {
      throw new Error(`Incomplete or inconsistent Microchip pagination for ${scope.query}, page ${number}`);
    }
    for (const row of result.data) {
      const id = row.part_number.toUpperCase();
      if (parts.has(id)) throw new Error(`Repeated Microchip part in pagination for ${scope.query}: ${id}`);
      parts.set(id, row);
    }
  }

  return scope.orders.map((model) => {
    const row = parts.get(model);
    if (!row || row.manufacturer !== publisher || row.component_type !== 'SILICON' ||
        modelQuery.parse(row.base_part_number) !== scope.base) {
      throw new Error(`Microchip exact ordering code or base device could not be verified: ${model}`);
    }
    // Validate an advertised secondary URL even when its coverage differs from this SKU.
    const secondary = row.secondary_datasheet_url.trim();
    const secondaryDatasheetUrl = secondary === '' || secondary === 'Not Available' ? undefined : datasheetUrl.parse(secondary);
    return partEvidence.parse({ model, base: scope.base, productUrl: row.product_url,
      datasheetUrl: row.datasheet_url, secondaryDatasheetUrl });
  });
}

export const microchipCollector: SourceCollector<MicrochipEvidence> = {
  async collect(read, observedAt) {
    const parts = [];
    for (const scope of microchipScope) parts.push(...await collectScope(read, scope));
    return microchipEvidence.parse({ observedAt, parts: parts.sort((a, b) => compare(a.model, b.model)) });
  },
};

const automotivePdf = 'https://ww1.microchip.com/downloads/aemDocuments/documents/MCU08/ProductDocuments/DataSheets/Atmel-7810-Automotive-Microcontrollers-ATmega328P_Datasheet.pdf';

function publication(url: string, base: string) {
  if (url === automotivePdf) return { id: '7810', revision: 'D', title: 'ATmega328P Automotive Datasheet' };
  const filename = new URL(url).pathname.split('/').at(-1)!;
  // Publisher filenames carry the DS number and, on versioned URLs, the revision letter.
  const match = filename.match(/(?:^|DS)(\d{8})([A-Z])?\.pdf$/i);
  if (!match) throw new Error(`Unrecognized Microchip document identifier for ${base}: ${url}`);
  return { id: `DS${match[1]}`, revision: match[2]?.toUpperCase(), title: `${base} Datasheet` };
}

function evidenceSource(part: Part, observedAt: string): Source {
  return {
    kind: 'manufacturer_product', url: part.productUrl,
    observedAt, locator: `Microchip Product Data API / part_number=${part.model}; base_part_number=${part.base}`,
    method: 'automatic',
  };
}

export function createMicrochipAdapter(input: MicrochipEvidence): Adapter {
  const evidence = microchipEvidence.parse(input);
  const parts = new Map(evidence.parts.map((item) => [item.model, item]));
  if (parts.size !== evidence.parts.length) throw new Error('Conflicting Microchip orderable models');
  return {
    findDevice(value) {
      const parsed = modelQuery.safeParse(value);
      if (!parsed.success) return null;
      const part = parts.get(parsed.data);
      const scope = microchipScope.find(({ base }) => base === part?.base);
      if (!part || !scope) return null;
      return { model: part.model, device: part.base, family: scope.family, kind: 'orderable_part',
        source: evidenceSource(part, evidence.observedAt) };
    },
    getDocuments(device) {
      const part = parts.get(device.model);
      if (!part || part.base !== device.device || part.productUrl !== device.source.url) return [];
      const scope = microchipScope.find(({ base }) => base === part.base);
      if (publication(part.datasheetUrl, part.base).id !== scope?.primaryId) {
        throw new Error(`Review changed Microchip primary datasheet identity for ${part.model}`);
      }
      const urls = new Map([[part.datasheetUrl, 'datasheet_url']]);
      if (part.secondaryDatasheetUrl && !urls.has(part.secondaryDatasheetUrl) &&
          scope?.secondaryModels.some((code) => code === part.model)) {
        if (part.secondaryDatasheetUrl !== automotivePdf) {
          throw new Error(`Review changed Microchip secondary datasheet coverage for ${part.model}`);
        }
        urls.set(part.secondaryDatasheetUrl, 'secondary_datasheet_url');
      }
      return Array.from(urls, ([url, field]): DocumentFinding => ({
        ...publication(url, part.base), url, type: 'datasheet', scope: 'orderablePart', verified: true,
        source: {
          kind: 'manufacturer_document', url: microchipProductApi, observedAt: evidence.observedAt,
          locator: `part_number=${part.model} / ${field}`, method: 'automatic',
        },
      }));
    },
  };
}

export function normalizeMicrochip(evidence: MicrochipEvidence): Catalog {
  const adapter = createMicrochipAdapter(evidence);
  const documents = new Map<string, Catalog['documents'][number]>();
  const catalog: Catalog = {
    manufacturers: [microchipManufacturer], families: [], devices: [], orders: [], documents: [], applicability: [],
  };
  if (evidence.parts.length !== microchipScope.reduce((total, scope) => total + scope.orders.length, 0)) {
    throw new Error('Microchip evidence does not match the configured order codes');
  }
  for (const scope of microchipScope) {
    const manufacturerId = microchipManufacturer.id;
    const deviceId = `${manufacturerId}:${scope.base}`;
    const sources: Source[] = [];
    catalog.families.push({ id: scope.familyId, manufacturerId, name: scope.family });
    for (const model of scope.orders) {
      const part = adapter.findDevice(model);
      if (!part || part.device !== scope.base) throw new Error(`Missing Microchip orderable evidence for ${model}`);
      sources.push(part.source);
      catalog.orders.push({ model, deviceId, source: part.source });
      for (const { id, type, title, revision, url, source, scope, verified } of adapter.getDocuments(part)) {
        if (!id || type !== 'datasheet' || !url) throw new Error(`Invalid Microchip document for ${model}`);
        const key = `${manufacturerId}:${id}`;
        const existing = documents.get(key);
        if (existing && (existing.current.revision !== revision || existing.current.url !== url)) {
          throw new Error(`Conflicting Microchip document versions or URLs: ${id}`);
        }
        if (!existing) documents.set(key, { key, manufacturerId, id, title, type, current: { revision, url } });
        catalog.applicability.push({ deviceId, documentKey: key, orderableModel: model, sourceScope: scope, verified, source });
      }
    }
    catalog.devices.push({ id: deviceId, model: scope.base, familyId: scope.familyId, sources });
  }
  catalog.documents = [...documents.values()];
  return catalog;
}
