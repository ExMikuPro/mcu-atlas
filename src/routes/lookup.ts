import type { Handler } from 'hono';
import type { ApiEnv } from '../middleware/errors';
import { dataCache, failure, modelParameter } from '../middleware/errors';
import { lookup } from '../services/catalog';

export const lookupRoute: Handler<ApiEnv> = async (c) => {
  const model = modelParameter(c, 'model');
  if (!model.success) return failure(c, 400, 'INVALID_QUERY', 'Provide one valid model parameter.');
  const result = await lookup(c.env.ASSETS, model.data);
  if (!result) return failure(c, 404, 'MODEL_NOT_FOUND', 'Model not found.');
  c.header('Cache-Control', dataCache);
  return c.json(result);
};
