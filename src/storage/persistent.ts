import { createRequire } from "node:module";

export interface DomainRedis {
  set(key: string, value: string, expiryMode?: string, seconds?: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
  incr(key: string): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<number>;
  lpush(key: string, ...values: string[]): Promise<number>;
  rpush(key: string, ...values: string[]): Promise<number>;
  lpop(key: string): Promise<string | null>;
  rpop(key: string): Promise<string | null>;
  llen(key: string): Promise<number>;
  lpos(key: string, value: string): Promise<number | null>;
  lrem(key: string, count: number, value: string): Promise<number>;
  eval(...args: unknown[]): Promise<unknown>;
}

let _client: DomainRedis | null | undefined = undefined;

export function getRedisClient(): DomainRedis | null {
  if (_client !== undefined) return _client;

  const url = process.env.REDIS_URL;
  if (!url) {
    _client = null;
    return null;
  }

  try {
    const require = createRequire(import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ioredis: any = require("ioredis");
    const Redis = ioredis.default ?? ioredis.Redis ?? ioredis;
    _client = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false }) as DomainRedis;
  } catch {
    _client = null;
  }

return _client!;
}