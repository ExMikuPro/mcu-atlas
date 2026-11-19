import { z } from 'zod';
import { label, model, source } from './device';
import { mcuDocument } from './document';

export const summary = z.strictObject({ model, manufacturer: label, family: label, device: model });
export const lookupResponse = summary.extend({
  success: z.literal(true),
  documents: z.array(mcuDocument).min(1),
  orderableSource: source,
});
export const counts = z.strictObject({
  models: z.int().positive(),
  devices: z.int().positive(),
  manufacturers: z.int().positive(),
  documents: z.int().positive(),
  verifiedDocuments: z.int().nonnegative(),
});
export const metadata = z.strictObject({
  schemaVersion: z.literal(1),
  dataVersion: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  generatedAt: z.iso.datetime(),
  counts,
});
export const lookupAsset = z.strictObject({ dataVersion: metadata.shape.dataVersion, response: lookupResponse });
export const manifest = metadata.extend({ models: z.array(model).min(1) }).refine(
  ({ models, counts }) => models.length === counts.models &&
    models.every((value, i) => i === 0 || models[i - 1] < value) &&
    counts.verifiedDocuments <= counts.documents && counts.devices <= counts.models,
  'Invalid manifest counts or model list',
);
export const searchIndex = z.strictObject({ dataVersion: metadata.shape.dataVersion, entries: z.array(summary).min(1) });
export const searchResponse = z.strictObject({
  success: z.literal(true),
  query: model,
  total: z.int().nonnegative(),
  results: z.array(summary),
});
export const statusResponse = metadata.extend({ success: z.literal(true) });
export const errorResponse = z.strictObject({
  success: z.literal(false),
  error: z.strictObject({
    code: z.enum(['INVALID_QUERY', 'MODEL_NOT_FOUND', 'NOT_FOUND', 'DATA_UNAVAILABLE']),
    message: label,
  }),
});

export type LookupResponse = z.infer<typeof lookupResponse>;
export type Manifest = z.infer<typeof manifest>;
export type SearchResponse = z.infer<typeof searchResponse>;
export type StatusResponse = z.infer<typeof statusResponse>;
export type ErrorResponse = z.infer<typeof errorResponse>;
