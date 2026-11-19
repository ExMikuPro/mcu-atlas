import { z } from 'zod';

export const model = z.string().regex(/^[A-Z0-9][A-Z0-9._-]{0,63}$/);
export const modelQuery = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/)
  .transform((value) => value.toUpperCase());
export const label = z.string().trim().min(1).max(300);
export const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);

export const publicUrl = z.url({ protocol: /^https$/ }).refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return !url.username && !url.password && !url.search && !url.hash;
}, 'Expected a public HTTPS URL without credentials, query, or fragment');

export const source = z.strictObject({
  kind: z.enum(['manufacturer_product', 'manufacturer_document', 'cmsis_pack']),
  url: publicUrl,
  observedAt: z.iso.datetime(),
  locator: label,
  method: z.enum(['automatic', 'manual_review']),
});

export const manufacturer = z.strictObject({ id: slug, name: label });
export const family = z.strictObject({ id: slug, manufacturerId: slug, name: label });
export const device = z.strictObject({
  id: label,
  model,
  familyId: slug,
  sources: z.array(source).min(1),
});
export const orderablePart = z.strictObject({
  model,
  deviceId: label,
  source,
});

export type Manufacturer = z.infer<typeof manufacturer>;
export type Family = z.infer<typeof family>;
export type Device = z.infer<typeof device>;
export type OrderablePart = z.infer<typeof orderablePart>;
export type Source = z.infer<typeof source>;
