import { z } from 'zod';
import { label, model, publicUrl } from '../schemas/device';
import { documentId, documentType, documentRevision } from '../schemas/document';

const orderEvidence = z.strictObject({
  device: model,
  sourceUrl: publicUrl,
  models: z.array(model).min(1),
  datasheetUrl: publicUrl,
});

const documentEvidence = z.array(documentRevision.extend({
  id: documentId,
  title: label,
  type: documentType,
  sourceUrl: publicUrl,
  scope: z.enum(['family', 'subFamily', 'device']),
  appliesTo: z.array(model).min(1),
})).min(1);

export const stEvidence = z.strictObject({
  observedAt: z.iso.datetime(),
  products: z.array(orderEvidence).min(1),
});

const book = z.strictObject({
  name: label,
  title: label,
  scope: z.enum(['family', 'subFamily', 'device', 'variant']),
});
export const packDevice = z.strictObject({
  model,
  family: label,
  vendor: label,
  books: z.array(book),
  variants: z.array(z.strictObject({ model: label, books: z.array(book) })),
});
export const cmsisEvidence = z.strictObject({
  observedAt: z.iso.datetime(),
  packs: z.array(z.strictObject({
    name: label,
    version: label,
    url: publicUrl,
    devices: z.array(packDevice).min(1),
  })).min(1),
});

export const editorialEvidence = z.strictObject({
  observedAt: z.iso.datetime(),
  documents: documentEvidence,
});
export const snapshotSchema = z.strictObject({ cmsis: cmsisEvidence });
export type PackDevice = z.infer<typeof packDevice>;
export type CmsisEvidence = z.infer<typeof cmsisEvidence>;
export type StEvidence = z.infer<typeof stEvidence>;
export type EditorialEvidence = z.infer<typeof editorialEvidence>;
export type Snapshot = z.infer<typeof snapshotSchema>;
