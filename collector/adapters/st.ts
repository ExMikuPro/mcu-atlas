import { load } from 'cheerio';
import { modelQuery, publicUrl } from '../../schemas/device';
import { stScope } from '../scope';
import type { EditorialEvidence, StEvidence } from '../snapshot';
import type { Adapter } from './types';

export function parseStStore(html: string, entry: (typeof stScope)[number]): StEvidence['products'][number] {
  const $ = load(html);
  const rows = $('ol.product-items > li.product-item').toArray();
  const datasheets = new Set<string>();
  for (const model of entry.orders) {
    const matches = rows.filter((row) => $(row).find('h2.product-item-name > a.product-item-link').text().trim() === model);
    if (matches.length !== 1) throw new Error(`ST eStore: expected one ${model} for ${entry.model}, got ${matches.length}`);
    const url = publicUrl.parse($(matches[0]).find(`a[title="${model} Datasheet (PDF)"]`).attr('href'));
    if (!/^https:\/\/www\.st\.com\/resource\/en\/datasheet\/[^/]+\.pdf$/.test(url)) {
      throw new Error(`ST eStore: unexpected datasheet URL for ${model}`);
    }
    datasheets.add(url);
  }
  const [datasheetUrl] = datasheets;
  if (datasheets.size !== 1) throw new Error(`ST eStore: inconsistent datasheet links for ${entry.model}`);
  return { device: entry.model, models: [...entry.orders], sourceUrl: entry.productUrl, datasheetUrl };
}

export function createStAdapter(evidence: StEvidence, editorial: EditorialEvidence): Adapter {
  return {
    findDevice(value) {
      const model = modelQuery.safeParse(value);
      if (!model.success) return null;
      const products = evidence.products.filter((product) => product.device === model.data || product.models.includes(model.data));
      if (products.length > 1) throw new Error(`Conflicting ST orderable model or device: ${model.data}`);
      const product = products[0];
      if (!product) return null;
      const family = stScope.find((entry) => entry.model === product.device)?.family;
      if (!family) throw new Error(`ST eStore: unconfigured device ${product.device}`);
      return {
        model: model.data, device: product.device, family,
        kind: product.device === model.data ? 'device' : 'orderable_part',
        source: {
          kind: 'manufacturer_product',
          url: product.sourceUrl,
          observedAt: evidence.observedAt,
          method: 'manual_review',
          locator: `ST eStore product listing / ${model.data}`,
        },
      };
    },
    getDocuments(match) {
      if (!evidence.products.some((product) => product.device === match.device &&
          product.sourceUrl === match.source.url && (match.model === product.device || product.models.includes(match.model)))) return [];
      return editorial.documents.filter((doc) => doc.appliesTo.includes(match.device)).map(({ sourceUrl, appliesTo, ...doc }) => ({
        ...doc,
        verified: true,
        source: {
          kind: 'manufacturer_document',
          url: sourceUrl,
          observedAt: editorial.observedAt,
          method: 'manual_review',
          locator: `${doc.id} / PDF scope reviewed for ${match.device}`,
        },
      }));
    },
  };
}
