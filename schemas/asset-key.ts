import { model } from './device';

// ASCII hex is reversible and collision-free for canonical models, with no URL metacharacters.
export function lookupAssetPath(value: string): string {
  const canonical = model.parse(value);
  const key = Array.from(canonical, (character) => character.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  return `lookup/${key}.json`;
}
