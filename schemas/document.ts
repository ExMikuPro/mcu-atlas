import { z } from 'zod';
import { label, publicUrl, slug, source } from './device';

export const documentId = z.string().regex(/^[A-Z0-9][A-Z0-9._-]{0,63}$/);
export const documentType = z.enum(['datasheet', 'reference_manual', 'errata']);
export const documentScope = z.enum(['family', 'subFamily', 'device', 'variant']);
export const documentRevision = z.strictObject({
  revision: label.optional(),
  url: publicUrl.optional(),
  publishedAt: z.iso.date().optional(),
  listedUpdatedAt: z.iso.date().optional(),
});

export const document = z.strictObject({
  key: label,
  manufacturerId: slug,
  id: documentId,
  title: label,
  type: documentType,
  current: documentRevision,
});
export const applicability = z.strictObject({
  deviceId: label,
  documentKey: label,
  sourceScope: documentScope,
  verified: z.boolean(),
  source,
}).refine((value) => !value.verified || value.source.kind === 'manufacturer_document',
  'Verified applicability requires manufacturer document evidence');

export const mcuDocument = documentRevision.extend({
  id: documentId,
  type: documentType,
  title: label,
  sourceUrl: publicUrl,
  sourceScope: documentScope,
  verifiedAt: z.iso.datetime().optional(),
  verified: z.boolean(),
}).refine((value) => value.verified === Boolean(value.verifiedAt),
  'Verification status and time must agree');

export type Document = z.infer<typeof document>;
export type DocumentRevision = z.infer<typeof documentRevision>;
export type Applicability = z.infer<typeof applicability>;
export type MCUDocument = z.infer<typeof mcuDocument>;
