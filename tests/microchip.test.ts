import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { createMicrochipAdapter, microchipCollector, normalizeMicrochip } from '../collector/adapters/microchip';

const observedAt = '2026-11-19T09:46:12Z';
const fixture = (url: string) => {
  const query = new URL(url).searchParams;
  return readFile(`data/fixtures/microchip/${query.get('part')}-${query.get('pagenumber')}.json`, 'utf8');
};

it('reads every page, verifies exact SKUs and deduplicates official sheets across models', async () => {
  const pages: string[] = [];
  const data = await microchipCollector.collect((url) => {
    pages.push(url);
    return fixture(url);
  }, observedAt);
  expect(pages).toHaveLength(5);
  expect(data.parts).toHaveLength(12);
  expect(new Set(data.parts.map(({ base }) => base)).size).toBe(3);
  expect(normalizeMicrochip(data).documents).toHaveLength(4);
  const adapter = createMicrochipAdapter(data);
  expect(adapter.findDevice('pic16f18313t-i/sn')?.device).toBe('PIC16F18313');
  expect(adapter.findDevice('ATMEGA328PB-AU')).toBeNull();
  expect(adapter.findDevice('ATMEGA328P-XMINI')).toBeNull();
  const sam = adapter.findDevice('ATSAMD21G18A-UUT')!;
  expect(sam.device).toBe('ATSAMD21G18');
  expect(adapter.getDocuments(sam)[0]).toMatchObject({ id: 'DS40001882', revision: undefined });
});

it('fails if a required page is truncated, repeated, unavailable, or reports bad metadata', async () => {
  const lastPage = (url: string) => url.includes('part=ATSAMD21G18A') && url.endsWith('pagenumber=2');
  for (const mutate of [
    (value: { data: { part_number: string }[]; pagenumber: number; totalRecords: number }) => { value.data = []; },
    (value: { data: { part_number: string }[]; pagenumber: number; totalRecords: number }) => { value.pagenumber = 1; },
    (value: { data: { part_number: string }[]; pagenumber: number; totalRecords: number }) => { value.totalRecords = 22; },
    (value: { data: { part_number: string }[]; pagenumber: number; totalRecords: number }) => { value.data[0].part_number = 'ATSAMD21G18A-AF'; },
  ]) {
    await expect(microchipCollector.collect(async (url) => {
      const body = await fixture(url);
      if (!lastPage(url)) return body;
      const value = JSON.parse(body);
      mutate(value);
      return JSON.stringify(value);
    }, observedAt)).rejects.toThrow(/pagination/i);
  }
  await expect(microchipCollector.collect(async () => { throw new Error('HTTP 503'); }, observedAt))
    .rejects.toThrow('HTTP 503');
  await expect(microchipCollector.collect(async () => JSON.stringify({ error: 'Unavailable' }), observedAt))
    .rejects.toThrow();
});

it('rejects external links, an official but unrelated sheet, and a missing exact model', async () => {
  const data = await microchipCollector.collect(fixture, observedAt);
  const part = data.parts.find(({ model }) => model === 'PIC16F18313-I/SN')!;
  const original = part.datasheetUrl;
  part.datasheetUrl = 'https://ww1.microchip.com.example.org/downloads/en/DeviceDoc/40001799F.pdf';
  expect(() => normalizeMicrochip(data)).toThrow('official Microchip datasheet');
  part.datasheetUrl = original.replace('40001799F', '40002061B');
  expect(() => normalizeMicrochip(data)).toThrow('primary datasheet identity');
  part.datasheetUrl = original;
  data.parts = data.parts.filter((item) => item !== part);
  expect(() => normalizeMicrochip(data)).toThrow('configured order codes');
});

it('deduplicates a secondary URL identical to the primary and rejects conflicting document revisions', async () => {
  const data = await microchipCollector.collect(fixture, observedAt);
  const conflicting = structuredClone(data);
  const auto = data.parts.find(({ model }) => model === 'ATMEGA328P-15AZ')!;
  auto.secondaryDatasheetUrl = auto.datasheetUrl;
  const adapter = createMicrochipAdapter(data);
  expect(adapter.getDocuments(adapter.findDevice(auto.model)!)).toHaveLength(1);
  const standard = conflicting.parts.find(({ model }) => model === 'ATMEGA328P-AU')!;
  standard.datasheetUrl = standard.datasheetUrl.replace('DS40002061B', 'DS40002061C');
  expect(() => normalizeMicrochip(conflicting)).toThrow('Conflicting Microchip document versions');
});
