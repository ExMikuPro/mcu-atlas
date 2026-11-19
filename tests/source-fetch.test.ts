import { expect, it, vi } from 'vitest';
import { sourceReader } from '../collector/fetch';

const base = 'https://www.keil.com';

it('checks robots before sources and deduplicates requests within the batch', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (url) => {
    if (String(url) === base + '/robots.txt') return new Response('User-agent: *\nDisallow: /pack/');
    throw new Error('Unexpected source request');
  });
  const read = sourceReader(fetch);
  const first = read(base + '/pack/index.pidx');
  expect(read(base + '/pack/index.pidx')).toBe(first);
  await expect(first).rejects.toThrow('disallowed by robots.txt');
  expect(fetch).toHaveBeenCalledOnce();
});

it('treats source access outside the approved list as an error before initiating network traffic', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  await expect(sourceReader(fetch)('https://estore.st.com/product')).rejects.toThrow('Unexpected upstream URL');
  expect(fetch).not.toHaveBeenCalled();
});

it('respects Microchip robots rules and only allows the documented API profile', async () => {
  const mock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('User-agent: *\nDisallow: /designresources/'));
  const reader = sourceReader(mock, 'microchip');
  const api = 'https://www.microchip.com/designresources/product-catalog/api/productInfo?part=PIC16F18313&pagesize=20&pagenumber=1';
  await expect(reader(api)).rejects.toThrow('disallowed by robots.txt');
  await expect(reader('https://www.microchip.com/en-us/product/PIC16F18313')).rejects.toThrow('Unexpected upstream URL');
  await expect(reader(api + '&token=secret')).rejects.toThrow('Unexpected upstream URL');
  expect(mock).toHaveBeenCalledOnce();
});

it('stops immediately on an API denial even when only robots.txt is unavailable', async () => {
  const logger = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const mock = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response(null, { status: 403 }));
    const reader = sourceReader(mock, 'microchip');
    await expect(reader('https://www.microchip.com/designresources/product-catalog/api/productInfo?part=PIC16F18313&pagesize=20&pagenumber=1'))
      .rejects.toThrow(/productInfo: HTTP 403/);
    expect(mock).toHaveBeenCalledTimes(2);
  } finally {
    logger.mockRestore();
  }
});
