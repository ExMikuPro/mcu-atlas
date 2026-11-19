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
    expect(status.counts).toEqual({ models: 4, devices: 3, manufacturers: 1, documents: 6, verifiedDocuments: 6 });
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
