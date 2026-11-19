import type { Context } from 'hono';
import type { ErrorResponse } from '../../schemas/response';
import { modelQuery } from '../../schemas/device';
import type { Bindings } from '../services/catalog';

export type ApiEnv = { Bindings: Bindings };

export function failure(
  c: Context<ApiEnv>,
  status: 400 | 404 | 500,
  code: ErrorResponse['error']['code'],
  message: string,
) {
  c.header('Cache-Control', 'no-store');
  return c.json({ success: false, error: { code, message } } satisfies ErrorResponse, status);
}

export function modelParameter(c: Context<ApiEnv>, name: string) {
  const values = new URL(c.req.url).searchParams.getAll(name);
  return modelQuery.safeParse(values.length === 1 ? values[0] : undefined);
}

export const dataCache = 'public, max-age=300, s-maxage=900';
