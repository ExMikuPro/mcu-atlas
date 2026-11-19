import { expect, it } from 'vitest';
import { buildCatalog } from '../collector/catalog';
import { normalizeCatalog } from '../collector/normalize';
import { lookupAssetPath } from '../schemas/asset-key';
import { modelQuery } from '../schemas/device';
import { readInputs } from '../scripts/inputs';

it('encodes punctuation in distinct, reversible one-segment asset keys', () => {
  const parts = ['PIC16F18313-I/SN', 'PIC16F18313-I_SN', 'PIC16F18313-I.SN', 'PIC16F18313-I-SN'];
  expect(modelQuery.parse(' pic16f18313-i/sn ')).toBe(parts[0]);
  const paths = parts.map(lookupAssetPath);
  expect(new Set(paths).size).toBe(parts.length);
  for (const [index, path] of paths.entries()) {
    expect(path).toMatch(/^lookup\/[0-9a-f]+\.json$/);
    expect(Buffer.from(path.slice(7, -5), 'hex').toString('ascii')).toBe(parts[index]);
  }
  for (const invalid of ['../A', 'A/../B', 'A/./B', 'A//B', 'A/', 'A%2FB', 'A\\B']) {
    expect(modelQuery.safeParse(invalid).success).toBe(false);
    expect(() => lookupAssetPath(invalid)).toThrow();
  }
});

it('preserves vendor namespacing and rejects ambiguous order codes and cross-vendor document links', async () => {
  const st = buildCatalog(await readInputs());
  const alternate = {
    manufacturers: [{ id: 'fixture', name: 'Fixture manufacturer' }],
    families: [{ ...st.families[0], id: 'fixture-family', manufacturerId: 'fixture' }],
    devices: [{ ...st.devices[0], id: `fixture:${st.devices[0].model}`, familyId: 'fixture-family' }],
    orders: [{ ...st.orders[0], model: 'FIXTURE-I/SN', deviceId: `fixture:${st.devices[0].model}` }],
    documents: [{ ...st.documents[0], key: `fixture:${st.documents[0].id}`, manufacturerId: 'fixture' }],
    applicability: [{
      ...st.applicability[0],
      deviceId: `fixture:${st.devices[0].model}`,
      documentKey: `fixture:${st.documents[0].id}`,
      orderableModel: 'FIXTURE-I/SN',
    }],
  };
  expect(normalizeCatalog([st, alternate])).toEqual(normalizeCatalog([alternate, st]));
  const collision = structuredClone(alternate);
  collision.orders[0].model = st.orders[0].model;
  expect(() => normalizeCatalog([st, collision])).toThrow('Conflicting orderable model');
  const inconsistent = structuredClone(alternate);
  inconsistent.applicability[0].documentKey = st.documents[0].key;
  expect(() => normalizeCatalog([st, inconsistent])).toThrow('Invalid document applicability');
});
