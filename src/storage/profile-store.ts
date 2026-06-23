import { createRequire } from "node:module";
import type { RedisLike } from "../toolkit/session/redis.js";

export interface UserProfile {
  rating: number;
  wins: number;
  losses: number;
  totalShots: number;
  totalHits: number;
}

const DEFAULT_PROFILE: UserProfile = {
  rating: 1200,
  wins: 0,
  losses: 0,
  totalShots: 0,
  totalHits: 0,
};

function serialize(p: UserProfile): string {
  return JSON.stringify(p);
}

function deserialize(raw: string | null): UserProfile {
  if (!raw) return { ...DEFAULT_PROFILE };
  try {
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    return {
      rating: typeof parsed.rating === "number" ? parsed.rating : DEFAULT_PROFILE.rating,
      wins: typeof parsed.wins === "number" ? parsed.wins : DEFAULT_PROFILE.wins,
      losses: typeof parsed.losses === "number" ? parsed.losses : DEFAULT_PROFILE.losses,
      totalShots: typeof parsed.totalShots === "number" ? parsed.totalShots : DEFAULT_PROFILE.totalShots,
      totalHits: typeof parsed.totalHits === "number" ? parsed.totalHits : DEFAULT_PROFILE.totalHits,
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

const PREFIX = "profile:";

/**
 * Persistent profile store backed by Redis (or in-memory for development/testing).
 */
export class ProfileStore {
  private fallback = new Map<string, string>();

  constructor(
    private readonly redis: RedisLike | null,
    private readonly useRedis: boolean,
  ) {}

  private k(userId: number): string {
    return PREFIX + String(userId);
  }

  async get(userId: number): Promise<UserProfile> {
    if (this.useRedis && this.redis) {
      const raw = await this.redis.get(this.k(userId));
      return deserialize(raw);
    }
    return deserialize(this.fallback.get(this.k(userId)) ?? null);
  }

  async set(userId: number, profile: UserProfile): Promise<void> {
    const value = serialize(profile);
    if (this.useRedis && this.redis) {
      await this.redis.set(this.k(userId), value);
    } else {
      this.fallback.set(this.k(userId), value);
    }
  }

  async ensure(userId: number): Promise<UserProfile> {
    const existing = await this.get(userId);
    return existing;
  }
}

let _store: ProfileStore | null = null;

export function profileStore(): ProfileStore {
  if (_store) return _store;
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const require = createRequire(import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ioredis: any = require("ioredis");
    const RedisConstructor = ioredis.default ?? ioredis.Redis ?? ioredis;
    const client = new RedisConstructor(redisUrl, { maxRetriesPerRequest: null, lazyConnect: false });
    _store = new ProfileStore(client as RedisLike, true);
  } else {
    _store = new ProfileStore(null, false);
  }
  return _store;
}