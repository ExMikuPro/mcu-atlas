import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lookupAssetPath } from '../schemas/asset-key';
import { modelQuery, publicUrl } from '../schemas/device';
import { cmsisAdapter, createCmsisAdapter, packFromIndex, parsePdsc } from '../collector/adapters/cmsis';
import { createStAdapter, parseStStore } from '../collector/adapters/st';
import { buildCatalog } from '../collector/catalog';
import { cmsisIndexUrl, stScope } from '../collector/scope';
import { renderAssets } from '../scripts/assets';
import { readInputs } from '../scripts/inputs';

const fixture = (name: string) => readFileSync(`data/fixtures/${name}`, 'utf8');
const packNames = ['STM32F1xx_DFP', 'STM32F4xx_DFP'];
const officialIndex = fixture('keil-index.pidx');

describe('Model and source validation', () => {
  it('preserves meaningful suffixes and rejects path separators, Unicode and credential-bearing URLs', () => {
    expect(modelQuery.parse(' stm32f407vet6tr ')).toBe('STM32F407VET6TR');
    expect(modelQuery.parse('abc-123.a')).toBe('ABC-123.A');
    for (const value of ['../thing', 'STM32 F407', 'ＳＴＭ３２', 'iı', '', '/']) {
      expect(modelQuery.safeParse(value).success).toBe(false);
    }
    for (const value of ['https://user:secret@st.com/path', 'https://st.com/?token=secret', 'pack/file.pdf']) {
      expect(publicUrl.safeParse(value).success).toBe(false);
    }
  });
});

describe('CMSIS Adapter', () => {
  async function fromFixtures() {
    const sources = new Map([[cmsisIndexUrl, officialIndex]]);
    for (const [index, name] of packNames.entries()) {
      sources.set(packFromIndex(officialIndex, name).url, fixture(index === 0 ? 'keil-f1.pdsc' : 'keil-f4.pdsc'));
    }
    return cmsisAdapter.collect(async (url) => {
      const fixture = sources.get(url);
      if (!fixture) throw new Error(`No fixture for ${url}`);
      return fixture;
    }, '2026-11-19T00:00:00Z');
  }

  it('discovers packs, carries parent book scopes and keeps relative references separate', async () => {
    const adapter = createCmsisAdapter(await fromFixtures());
    const f4 = adapter.findDevice('stm32f407ve')!;
    expect(f4.family).toBe('STM32F4 Series');
    expect(adapter.getDocuments(f4)).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'STM32F4xx HAL Drivers', scope: 'family', verified: false }),
      expect.objectContaining({ id: 'RM0090', scope: 'subFamily', verified: false, type: 'reference_manual' }),
    ]));
    const f1 = adapter.findDevice('STM32F103C8')!;
    expect(adapter.getDocuments(f1)).toEqual(expect.arrayContaining([
      expect.objectContaining({ reference: 'Documents/CD00161566.pdf', scope: 'device', url: undefined }),
    ]));
    expect(adapter.findDevice('STM32F407VET6TR')).toBeNull();
    expect(adapter.findDevice('STM32F407VETx')?.kind).toBeUndefined();
  });

  it('rejects malformed XML, a missing target and a release mismatch', () => {
    const pack = packFromIndex(officialIndex, packNames[1]);
    expect(() => packFromIndex('<html>blocked</html>', pack.name)).toThrow();
    expect(() => parsePdsc('<package><oops>', pack, [])).toThrow('Invalid CMSIS XML');
    expect(() => parsePdsc(fixture('keil-f4.pdsc'), pack, ['DOESNOTEXIST'])).toThrow('has no DOESNOTEXIST');
    expect(() => parsePdsc(fixture('keil-f4.pdsc'), { ...pack, version: '0.0.0' }, [])).toThrow('disagree');
  });
});

describe('ST Adapter', () => {
  it('reads all scoped exact parts and datasheet links from captured markup', async () => {
    const { st, editorial } = await readInputs();
    for (const entry of stScope) {
      const parsed = parseStStore(fixture(`st-store-${entry.model.toLowerCase()}.html`), entry);
      expect(st.products).toContainEqual(parsed);
    }
    const adapter = createStAdapter(st, editorial);
    const reel = adapter.findDevice('stm32f407vet6tr')!;
    expect(reel).toMatchObject({ kind: 'orderable_part', device: 'STM32F407VE' });
    expect(adapter.findDevice('STM32F407VET6XYZ')).toBeNull();
    expect(adapter.getDocuments(reel).map(({ id }) => id)).toEqual(['DS8626', 'ES0182', 'RM0090']);
  });

  it('rejects blocked pages, missing parts, ambiguous rows and stale product/document links', async () => {
    const target = stScope[1];
    const html = fixture('st-store-stm32f407ve.html');
    expect(() => parseStStore('<html>Access restricted</html>', target)).toThrow('got 0');
    expect(() => parseStStore(html.replaceAll('STM32F407VET6TR', 'STM32F407VET7TR'), target)).toThrow('got 0');
    expect(() => parseStStore(html + html, target)).toThrow('got 2');
    const data = await readInputs();
    data.st.products[1].datasheetUrl = 'https://www.st.com/resource/en/datasheet/unreviewed.pdf';
    expect(() => buildCatalog(data)).toThrow('product and document evidence disagree');
  });
});

describe('Normalized catalog and static rendering', () => {
  it('deduplicates documents across base devices without dropping scoped applicability', async () => {
    const input = await readInputs();
    const catalog = buildCatalog(input);
    expect(catalog.devices).toHaveLength(3);
    expect(catalog.orders).toHaveLength(4);
    expect(catalog.documents).toHaveLength(6);
    const rm = catalog.documents.filter(({ id }) => id === 'RM0090');
    expect(rm).toHaveLength(1);
    expect(catalog.applicability.filter((link) => link.documentKey === rm[0].key).map((link) => link.deviceId))
      .toEqual(['st:STM32F407VE', 'st:STM32F407VG']);
    expect(renderAssets(input)).toEqual(renderAssets(structuredClone(input)));
    expect(renderAssets(input).get(`v1/${lookupAssetPath('STM32F407VET6TR')}`)).toContain('STM32F407VET6TR');
  });

  it('fails closed for applicability errors, conflicting part mappings and non-HTTPS URLs', async () => {
    const data = await readInputs();
    const wrongScope = structuredClone(data);
    wrongScope.editorial.documents.find(({ id }) => id === 'RM0090')!.appliesTo.push('STM32F103C8');
    expect(() => renderAssets(wrongScope)).toThrow('applicability mismatch');
    const conflict = structuredClone(data);
    conflict.st.products[2].models.push('STM32F407VET6');
    expect(() => renderAssets(conflict)).toThrow('Conflicting ST orderable model');
    const schema = structuredClone(data);
    schema.editorial.documents[0].url = 'http://www.st.com/resource/en/datasheet/stm32f103c8.pdf';
    expect(() => renderAssets(schema)).toThrow();
  });
});
