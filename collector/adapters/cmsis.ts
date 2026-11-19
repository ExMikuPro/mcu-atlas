import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { z } from 'zod';
import { label, modelQuery, publicUrl } from '../../schemas/device';
import { cmsisIndexUrl, stScope } from '../scope';
import { cmsisEvidence, packDevice } from '../snapshot';
import type { CmsisEvidence, PackDevice } from '../snapshot';
import type { Adapter, SourceCollector } from './types';

const xml = new XMLParser({ ignoreAttributes: false, parseTagValue: false, processEntities: false });
const record = z.record(z.string(), z.unknown());
const list = (value: unknown): unknown[] => value === undefined ? [] : Array.isArray(value) ? value : [value];

function parseXml(input: string, root: string) {
  if (/<!DOCTYPE/i.test(input) || XMLValidator.validate(input) !== true) {
    throw new Error(`Invalid CMSIS XML for <${root}>`);
  }
  return record.parse(record.parse(xml.parse(input))[root]);
}

export function packFromIndex(input: string, name: string) {
  const index = parseXml(input, 'index');
  const matches = list(record.parse(index.pindex).pdsc).map((item) => record.parse(item))
    .filter((entry) => entry['@_vendor'] === 'Keil' && entry['@_name'] === name);
  if (matches.length !== 1) throw new Error(`Expected one Keil::${name} in CMSIS index, got ${matches.length}`);
  const entry = matches[0];
  const base = publicUrl.parse(entry['@_url']);
  if (base !== 'https://www.keil.com/pack/') throw new Error(`Unexpected Keil pack base for ${name}`);
  return { name, version: label.parse(entry['@_version']), url: new URL(`Keil.${name}.pdsc`, base).href };
}

type Book = PackDevice['books'][number];
function books(node: Record<string, unknown>, scope: Book['scope'], inherited: Book[]): Book[] {
  const byName = new Map(inherited.map((book) => [book.name, book]));
  for (const entry of list(node.book)) {
    const value = record.parse(entry);
    const name = label.parse(value['@_name']);
    byName.set(name, { name, title: label.parse(value['@_title']), scope });
  }
  return [...byName.values()].sort((a, b) => a.name < b.name ? -1 : a.name === b.name ? 0 : 1);
}

export function parsePdsc(input: string, pack: {name: string; version: string}, models: readonly string[]): PackDevice[] {
  const data = parseXml(input, 'package');
  if (data.vendor !== 'Keil' || data.name !== pack.name ||
      record.parse(list(record.parse(data.releases).release)[0])['@_version'] !== pack.version) {
    throw new Error(`CMSIS index and PDSC disagree for Keil::${pack.name} ${pack.version}`);
  }

  const result = new Map<string, PackDevice>();
  for (const entry of list(record.parse(data.devices).family)) {
    const family = record.parse(entry);
    const vendor = label.parse(family['@_Dvendor']);
    const familyName = label.parse(family['@_Dfamily']);
    const familyBooks = books(family, 'family', []);
    const groups = [{ node: family, inherited: familyBooks }, ...list(family.subFamily).map((item) => {
      const node = record.parse(item);
      return { node, inherited: books(node, 'subFamily', familyBooks) };
    })];
    for (const { node, inherited } of groups) {
      for (const entry of list(node.device)) {
        const device = record.parse(entry);
        const name = label.parse(device['@_Dname']);
        if (!models.includes(name)) continue;
        if (result.has(name)) throw new Error(`Conflicting CMSIS device records for ${name}`);
        const deviceBooks = books(device, 'device', inherited);
        const variants = list(device.variant).map((entry) => {
          const variant = record.parse(entry);
          return { model: label.parse(variant['@_Dvariant']), books: books(variant, 'variant', deviceBooks) };
        });
        result.set(name, packDevice.parse({ model: name, family: familyName, vendor, books: deviceBooks, variants }));
      }
    }
  }
  return models.map((name) => {
    const device = result.get(name);
    if (!device) throw new Error(`Keil::${pack.name} has no ${name}`);
    return device;
  });
}

export const cmsisAdapter: SourceCollector<CmsisEvidence> = {
  async collect(read, observedAt) {
    const index = await read(cmsisIndexUrl);
    const packs = [];
    for (const name of new Set(stScope.map((entry) => entry.pack))) {
      const pack = packFromIndex(index, name);
      const devices = parsePdsc(await read(pack.url), pack, stScope.filter((entry) => entry.pack === name).map((entry) => entry.model));
      packs.push({ ...pack, devices });
    }
    return cmsisEvidence.parse({ observedAt, packs });
  },
};

export function createCmsisAdapter(evidence: CmsisEvidence): Adapter {
  const models = evidence.packs.flatMap((pack) => pack.devices.map((device) => ({ pack, device })));
  const matches = (value: string) => {
    const parsed = modelQuery.safeParse(value);
    if (!parsed.success) return [];
    return models.flatMap(({ pack, device }) => {
      const variant = device.variants.find((entry) => entry.model === parsed.data);
      return device.model === parsed.data || variant ? [{ pack, device, variant, model: parsed.data }] : [];
    });
  };

  return {
    findDevice(value) {
      const records = matches(value);
      if (records.length > 1) throw new Error(`Conflicting CMSIS model: ${value}`);
      const match = records[0];
      if (!match) return null;
      return {
        model: match.model,
        device: match.device.model,
        family: match.device.family,
        kind: match.variant ? 'pack_variant' : 'device',
        source: {
          kind: 'cmsis_pack',
          url: match.pack.url,
          observedAt: evidence.observedAt,
          locator: `Keil::${match.pack.name}@${match.pack.version} / ${match.model}`,
          method: 'automatic',
        },
      };
    },
    getDocuments(match) {
      const record = matches(match.model).find(({ device, pack }) => device.model === match.device && pack.url === match.source.url);
      if (!record) return [];
      return (record.variant?.books ?? record.device.books).map((book) => {
        const parsed = publicUrl.safeParse(book.name);
        const path = parsed.success ? new URL(parsed.data).pathname : book.name;
        const id = path.match(/\b(?:RM|DS|ES)\d+(?=[.\-])/i)?.[0].toUpperCase();
        const type = /\bdatasheet\b|\bdata sheet\b/i.test(book.title) ? 'datasheet' :
          /\breference manual\b/i.test(book.title) ? 'reference_manual' :
          /\berrata\b/i.test(book.title) ? 'errata' : undefined;
        return {
          id, type, title: book.title, scope: book.scope, verified: false,
          url: parsed.success ? parsed.data : undefined,
          reference: book.name,
          source: { ...match.source, locator: `${match.source.locator} / ${book.scope} book` },
        };
      });
    },
  };
}
