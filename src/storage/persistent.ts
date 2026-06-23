import { createRequire } from "node:module";

export interface DomainRedis {
  set(key: string, value: string, expiryMode?: string, seconds?: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  scard(key: string): Promise<number>;
  lpush(key: string, ...values: string[]): Promise<number>;
  rpop(key: string): Promise<string | null>;
  zadd(key: string, score: number, member: string): Promise<number>;
  zrem(key: string, ...members: string[]): Promise<number>;
  zrangebyscore(key: string, min: number, max: number): Promise<string[]>;
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