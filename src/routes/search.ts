import type { Handler } from 'hono';
import type { ApiEnv } from '../middleware/errors';
import { dataCache, failure, modelParameter } from '../middleware/errors';
import { search } from '../services/catalog';

export const searchRoute: Handler<ApiEnv> = async (c) => {
  const query = modelParameter(c, 'q');
  if (!query.success) return failure(c, 400, 'INVALID_QUERY', 'Provide one valid q parameter.');
  const result = await search(c.env.ASSETS, query.data);
  c.header('Cache-Control', dataCache);
  return c.json(result);
};
