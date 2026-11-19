import { setTimeout as delay } from 'node:timers/promises';
import robotsParser from 'robots-parser';
import type { ReadSource } from './adapters/types';

const userAgent = 'MCU-Atlas/0.1 (+https://github.com/ExMikuPro/mcu-atlas)';
const allowedHosts = new Set([
  'www.keil.com',
  'sadevicepacksdqaus.blob.core.windows.net',
  'sadevicepacksprodus.blob.core.windows.net',
]);
const maxBytes = 4 * 1024 * 1024;

class SourceHttpError extends Error {
  constructor(url: URL, readonly status: number) {
    super(`${url.origin}${url.pathname}: HTTP ${status}`);
  }
}

function assertAllowedUrl(url: URL) {
  if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname) ||
      url.username || url.password || url.port || url.search || url.hash) {
    throw new Error(`Unexpected upstream URL host or credentials: ${url.hostname}`);
  }
}

async function bodyText(response: Response, url: URL) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`${url.href}: empty response body`);
  const decoder = new TextDecoder();
  let body = '';
  let bytes = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return body + decoder.decode();
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new Error(`${url.href}: source exceeds ${maxBytes} bytes`);
    }
    body += decoder.decode(value, { stream: true });
  }
}

export function sourceReader(request: typeof fetch = fetch): ReadSource {
  const requests = new Map<string, Promise<string>>();
  const robots = new Map<string, ReturnType<typeof robotsParser>>();
  let queue: Promise<unknown> = Promise.resolve();
  let nextRequestAt = 0;

  async function send(url: URL, crawlDelay = 1) {
    await delay(Math.max(0, nextRequestAt - Date.now()));
    nextRequestAt = Date.now() + Math.max(1, crawlDelay) * 1000;
    return request(url, {
      signal: AbortSignal.timeout(20_000),
      redirect: 'manual',
      headers: { 'User-Agent': userAgent },
    });
  }

  async function policy(url: URL) {
    const cached = robots.get(url.origin);
    if (cached) return cached;
    const location = new URL('/robots.txt', url);
    const response = await send(location);
    let rules = '';
    if (response.ok) rules = await bodyText(response, location);
    else {
      await response.body?.cancel();
      // Azure Blob rejects a root-level path with 400 because it expects a container.
      const azureMissing = response.status === 400 && location.hostname.endsWith('.blob.core.windows.net');
      if (![404, 410].includes(response.status) && !azureMissing) throw new SourceHttpError(location, response.status);
    }
    const parsed = robotsParser(location.href, rules);
    robots.set(url.origin, parsed);
    return parsed;
  }

  async function fetchText(start: string) {
    let url = new URL(start);
    for (let redirects = 0; redirects <= 3; redirects++) {
      assertAllowedUrl(url);
      const rules = await policy(url);
      if (rules.isAllowed(url.href, 'MCU-Atlas') === false) throw new Error(`${url.href}: disallowed by robots.txt`);
      const crawlDelay = rules.getCrawlDelay('MCU-Atlas') ?? 1;
      await delay(Math.max(0, (crawlDelay - 1) * 1000));
      const response = await send(url, crawlDelay);
      if (response.ok) return bodyText(response, url);
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (location && [301, 302, 303, 307, 308].includes(response.status)) {
        url = new URL(location, url);
        continue;
      }
      throw new SourceHttpError(url, response.status);
    }
    throw new Error(`${start}: too many redirects`);
  }

  return (url) => {
    const existing = requests.get(url);
    if (existing) return existing;
    const task = queue.then(async () => {
      for (let attempt = 1; ; attempt++) {
        try {
          return await fetchText(url);
        } catch (error) {
          const retryable = error instanceof SourceHttpError
            ? [500, 502, 503, 504].includes(error.status)
            : error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError');
          if (attempt === 2 || !retryable) throw new Error(`Collection failed for ${url}: ${String(error)}`, { cause: error });
          console.warn(`Retrying ${url}: ${String(error)}`);
          await delay(3000);
        }
      }
    });
    requests.set(url, task);
    queue = task.catch(() => undefined);
    return task;
  };
}
