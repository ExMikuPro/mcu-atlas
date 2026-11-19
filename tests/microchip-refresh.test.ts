import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { refreshMicrochip } from '../collector/refresh-microchip';
import { renderAssets } from '../scripts/assets';
import { readInputs } from '../scripts/inputs';
import { json } from '../scripts/io';

const observedAt = '2026-11-19T10:15:00Z';
const fixture = (url: string) => {
  const query = new URL(url).searchParams;
  return readFile(`data/fixtures/microchip/${query.get('part')}-${query.get('pagenumber')}.json`, 'utf8');
};

it('keeps the accepted snapshot on unchanged, failed, and invalid refreshes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mcu-atlas-refresh-'));
  const path = join(directory, 'microchip.json');
  try {
    const inputs = await readInputs();
    const original = json(inputs.microchip);
    await writeFile(path, original);
    expect(await refreshMicrochip(inputs, fixture, path, observedAt)).toMatchObject({ changed: false, documentChanges: [] });
    for (const invalid of [
      async (url: string) => {
        if (url.includes('part=ATSAMD21G18A') && url.endsWith('pagenumber=2')) throw new Error('HTTP 429');
        return fixture(url);
      },
      async (url: string) => (await fixture(url)).replaceAll('40001799F.pdf', '40002061B.pdf'),
    ]) {
      await expect(refreshMicrochip(inputs, invalid, path, observedAt)).rejects.toThrow();
      expect(await readFile(path, 'utf8')).toBe(original);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('stages document edition changes and produces a consistent new asset version', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mcu-atlas-refresh-'));
  const path = join(directory, 'microchip.json');
  try {
    const inputs = await readInputs();
    const original = renderAssets(inputs);
    await writeFile(path, json(inputs.microchip));
    const result = await refreshMicrochip(inputs,
      async (url) => (await fixture(url)).replaceAll('40001799F.pdf', '40001799G.pdf'), path, observedAt);
    expect(result).toMatchObject({
      changed: true,
      changedModels: expect.arrayContaining(['PIC16F18313-I/SN']),
      documentChanges: [{ id: 'DS40001799', before: { revision: 'F' }, after: { revision: 'G' } }],
    });
    const assets = renderAssets({ ...inputs, microchip: JSON.parse(await readFile(path, 'utf8')) });
    const version = JSON.parse(assets.get('v1/manifest.json')!).dataVersion;
    expect(version).not.toBe(JSON.parse(original.get('v1/manifest.json')!).dataVersion);
    for (const [name, content] of assets) {
      if (name.includes('/lookup/') || name.includes('/search/')) expect(JSON.parse(content).dataVersion).toBe(version);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
