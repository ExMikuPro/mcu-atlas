import type { Handler } from 'hono';
import { statusResponse } from '../../schemas/response';
import type { ApiEnv } from '../middleware/errors';
import { readManifest } from '../services/catalog';

export const statusRoute: Handler<ApiEnv> = async (c) => {
  const { models, ...status } = await readManifest(c.env.ASSETS);
  c.header('Cache-Control', 'public, max-age=60');
  return c.json(statusResponse.parse({ success: true, ...status }));
};
