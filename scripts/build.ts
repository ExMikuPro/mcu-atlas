import { mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { outputDir, renderAssets } from './assets';
import { readInputs } from './inputs';
import { writeAtomic } from './io';

const files = renderAssets(await readInputs());
for (const [name, content] of files) {
  const path = join(outputDir, name);
  await mkdir(dirname(path), { recursive: true });
  await writeAtomic(path, content);
}
const lookups = 'v1/lookup';
for (const name of await readdir(join(outputDir, lookups))) {
  const path = `${lookups}/${name}`;
  if (name.endsWith('.json') && !files.has(path)) await rm(join(outputDir, path), { force: true });
}
console.log(`Generated ${files.size} validated static assets.`);
