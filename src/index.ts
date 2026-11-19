import { Hono } from 'hono';
import { failure } from './middleware/errors';
import type { ApiEnv } from './middleware/errors';
import { lookupRoute } from './routes/lookup';
import { searchRoute } from './routes/search';
import { statusRoute } from './routes/status';

const app = new Hono<ApiEnv>();
app.get('/v1/lookup', lookupRoute);
app.get('/v1/search', searchRoute);
app.get('/v1/status', statusRoute);
app.notFound((c) => failure(c, 404, 'NOT_FOUND', 'Endpoint not found.'));
app.onError((error, c) => {
  console.error('Catalog asset read failed', error);
  return failure(c, 500, 'DATA_UNAVAILABLE', 'Catalog data is unavailable.');
});

export default app;
