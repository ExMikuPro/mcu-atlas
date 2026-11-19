import { env, exports } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import app from '../src/index';
import { errorResponse, lookupResponse, searchResponse, statusResponse } from '../schemas/response';
import type { Bindings } from '../src/services/catalog';

const base = 'https://mcu-atlas.test';
const request = (path: string) => exports.default.fetch(new Request(base + path));

describe('Worker with real generated static assets', () => {
  it('matches both orderable suffixes and returns official evidence and JSON cache headers', async () => {
    const response = await request('/v1/lookup?model=%20stm32f407vet6%20');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(response.headers.get('Cache-Control')).toContain('public');
    const body = lookupResponse.parse(await response.json());
    expect(body).toMatchObject({ model: 'STM32F407VET6', manufacturer: 'STMicroelectronics', family: 'STM32F4', device: 'STM32F407VE' });
    expect(body.documents.map(({ id, revision }) => [id, revision])).toEqual([['DS8626', '12'], ['ES0182', '19'], ['RM0090', '22']]);
    const reel = lookupResponse.parse(await (await request('/v1/lookup?model=STM32F407VET6TR')).json());
    expect(reel.model).toBe('STM32F407VET6TR');
    expect(reel.device).toBe(body.device);
  });

  it('matches encoded slash, case and complete Microchip ordering codes through the same API', async () => {
    const response = await request('/v1/lookup?model=pic16f18313-i%2Fsn');
    expect(response.status).toBe(200);
    const pic = lookupResponse.parse(await response.json());
    expect(pic).toMatchObject({ model: 'PIC16F18313-I/SN', device: 'PIC16F18313', family: 'PIC', manufacturer: 'Microchip Technology' });
    expect(pic.documents[0]).toMatchObject({ id: 'DS40001799', revision: 'F', sourceScope: 'orderablePart' });
    const sam = lookupResponse.parse(await (await request('/v1/lookup?model=ATSAMD21G18A-UUT')).json());
    expect(sam).toMatchObject({ device: 'ATSAMD21G18', family: 'SAM' });
    expect(sam.documents[0]).not.toHaveProperty('revision');
    const automotive = lookupResponse.parse(await (await request('/v1/lookup?model=ATMEGA328P-15AZ')).json());
    const standard = lookupResponse.parse(await (await request('/v1/lookup?model=ATMEGA328P-AU')).json());
    expect(automotive.documents.map(({ id }) => id)).toEqual(['7810', 'DS40002061']);
    expect(standard.documents.map(({ id }) => id)).toEqual(['DS40002061']);
    expect((await request('/v1/lookup?model=PIC16F18313-I%2FXX')).status).toBe(404);
    expect((await request('/v1/lookup?model=PIC%2F..%2FNAME')).status).toBe(400);
  });

  it('distinguishes a missing query, an invalid query and an unknown model', async () => {
    for (const path of ['/v1/lookup', '/v1/lookup?model=a&model=b', '/v1/lookup?model=%2F', '/v1/search']) {
      const response = await request(path);
      expect(response.status).toBe(400);
      expect(errorResponse.parse(await response.json()).error.code).toBe('INVALID_QUERY');
    }
    const response = await request('/v1/lookup?model=NOTREAL123');
    expect(response.status).toBe(404);
    expect(errorResponse.parse(await response.json())).toEqual({
      success: false, error: { code: 'MODEL_NOT_FOUND', message: 'Model not found.' },
    });
  });

  it('uses the prebuilt index and manifest, and keeps internal asset routes out of the API', async () => {
    const query = searchResponse.parse(await (await request('/v1/search?q=f407')).json());
    expect(query.results.map(({ model }) => model)).toEqual(['STM32F407VET6', 'STM32F407VET6TR', 'STM32F407VGT6']);
    const status = statusResponse.parse(await (await request('/v1/status')).json());
    expect(status.counts).toEqual({ models: 16, devices: 6, manufacturers: 2, documents: 10, verifiedDocuments: 10 });
    expect((await request('/v1/manifest.json')).status).toBe(404);
  });
});

describe('Worker with corrupt or missing data', () => {
  it('reports 500 for a known model with a missing lookup asset and for malformed JSON', async () => {
    const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const actual = (env as unknown as Bindings).ASSETS;
      for (const bad of [() => new Response(null, { status: 404 }), () => new Response('invalid JSON')]) {
        const ASSETS = { fetch: async (request: Request) => request.url.includes('/lookup/') ? bad() : actual.fetch(request) };
        const answer = await app.fetch(new Request(base + '/v1/lookup?model=STM32F407VET6'), { ASSETS });
        expect(answer.status).toBe(500);
        expect(answer.headers.get('Cache-Control')).toBe('no-store');
        expect(errorResponse.parse(await answer.json()).error.code).toBe('DATA_UNAVAILABLE');
      }
      const ASSETS = { fetch: async () => { throw new Error('simulated binding outage'); } };
      const missingManifest = await app.fetch(new Request(base + '/v1/lookup?model=NOTREAL123'), { ASSETS });
      expect(missingManifest.status).toBe(500);
    } finally {
      logger.mockRestore();
    }
  });
});
