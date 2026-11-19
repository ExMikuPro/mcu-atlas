import type { z } from 'zod';
import { lookupAsset, manifest, searchIndex } from '../../schemas/response';

export type Bindings = { ASSETS: { fetch(request: Request): Promise<Response> } };

async function read<T>(assets: Bindings['ASSETS'], path: string, schema: z.ZodType<T>): Promise<T> {
  const response = await assets.fetch(new Request(`https://assets.invalid/v1/${path}`));
  if (!response.ok) throw new Error(`Static asset ${path} returned HTTP ${response.status}`);
  return schema.parse(await response.json());
}

export const readManifest = (assets: Bindings['ASSETS']) => read(assets, 'manifest.json', manifest);

export async function lookup(assets: Bindings['ASSETS'], model: string) {
  const index = await readManifest(assets);
  if (!index.models.includes(model)) return null;
  const record = await read(assets, `lookup/${model.toLowerCase()}.json`, lookupAsset);
  if (record.dataVersion !== index.dataVersion || record.response.model !== model) {
    throw new Error(`Lookup data disagrees with manifest for ${model}`);
  }
  return record.response;
}

export async function search(assets: Bindings['ASSETS'], query: string) {
  const [index, { entries, dataVersion }] = await Promise.all([
    readManifest(assets), read(assets, 'search/index.json', searchIndex),
  ]);
  if (dataVersion !== index.dataVersion || entries.length !== index.models.length ||
      entries.some((entry, i) => entry.model !== index.models[i])) {
    throw new Error('Search index disagrees with manifest');
  }
  const results = entries.filter((entry) => entry.model.includes(query)).sort((a, b) => {
    const rank = (model: string) => model === query ? 0 : model.startsWith(query) ? 1 : 2;
    return rank(a.model) - rank(b.model);
  });
  return { success: true as const, query, total: results.length, results: results.slice(0, 25) };
}
