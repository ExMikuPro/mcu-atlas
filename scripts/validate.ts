import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { outputDir, renderAssets } from './assets';
import { readInputs } from './inputs';

const expected = renderAssets(await readInputs());
const paths = (await readdir(outputDir, { recursive: true, withFileTypes: true }))
  .filter((entry) => !entry.isDirectory())
  .map((entry) => join(entry.parentPath, entry.name));
if (paths.length !== expected.size) throw new Error('Unexpected number of static assets. Run pnpm build:data.');
for (const [name, content] of expected) {
  if (await readFile(join(outputDir, name), 'utf8') !== content) throw new Error(`Unexpected asset contents: ${name}`);
}
console.log(`Validated ${expected.size} generated assets against all source schemas and relationships.`);
