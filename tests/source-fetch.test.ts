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
