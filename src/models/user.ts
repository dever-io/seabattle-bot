import { createRequire } from "node:module";
import type { RedisLike } from "../toolkit/session/redis.js";

export interface User {
  telegram_id: number;
  display_name: string;
  rating: number;
  wins: number;
  losses: number;
}

export interface UserStorage {
  create(user: User): Promise<User>;
  read(telegram_id: number): Promise<User | null>;
  update(
    telegram_id: number,
    updates: Partial<Omit<User, "telegram_id">>,
  ): Promise<User | null>;
  delete(telegram_id: number): Promise<boolean>;
  list(): Promise<User[]>;
}

const USER_KEY_PREFIX = "user:";
const INITIAL_RATING = 1200;

export function newUser(
  telegram_id: number,
  display_name: string,
): User {
  return {
    telegram_id,
    display_name,
    rating: INITIAL_RATING,
    wins: 0,
    losses: 0,
  };
}

export class RedisUserStorage implements UserStorage {
  constructor(private readonly client: RedisLike) {}

  private k(telegram_id: number): string {
    return USER_KEY_PREFIX + String(telegram_id);
  }

  async create(user: User): Promise<User> {
    const key = this.k(user.telegram_id);
    const existing = await this.client.get(key);
    if (existing) {
      return JSON.parse(existing) as User;
    }
    const data: User = {
      ...user,
      rating: user.rating ?? INITIAL_RATING,
      wins: user.wins ?? 0,
      losses: user.losses ?? 0,
    };
    await this.client.set(key, JSON.stringify(data));
    return data;
  }

  async read(telegram_id: number): Promise<User | null> {
    const raw = await this.client.get(this.k(telegram_id));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }

  async update(
    telegram_id: number,
    updates: Partial<Omit<User, "telegram_id">>,
  ): Promise<User | null> {
    const existing = await this.read(telegram_id);
    if (!existing) return null;
    const updated: User = { ...existing, ...updates };
    await this.client.set(this.k(telegram_id), JSON.stringify(updated));
    return updated;
  }

  async delete(telegram_id: number): Promise<boolean> {
    const existing = await this.read(telegram_id);
    if (!existing) return false;
    await this.client.del(this.k(telegram_id));
    return true;
  }

  async list(): Promise<User[]> {
    const keys = await this.client.keys(USER_KEY_PREFIX + "*");
    const users: User[] = [];
    for (const key of keys) {
      const raw = await this.client.get(key);
      if (raw) {
        try {
          users.push(JSON.parse(raw) as User);
        } catch {
          // skip corrupt entries
        }
      }
    }
    return users;
  }
}

export class MemoryUserStorage implements UserStorage {
  private store = new Map<number, User>();

  reset(): void {
    this.store.clear();
  }

  async create(user: User): Promise<User> {
    const existing = this.store.get(user.telegram_id);
    if (existing) return existing;
    const data: User = {
      ...user,
      rating: user.rating ?? INITIAL_RATING,
      wins: user.wins ?? 0,
      losses: user.losses ?? 0,
    };
    this.store.set(data.telegram_id, data);
    return data;
  }

  async read(telegram_id: number): Promise<User | null> {
    return this.store.get(telegram_id) ?? null;
  }

  async update(
    telegram_id: number,
    updates: Partial<Omit<User, "telegram_id">>,
  ): Promise<User | null> {
    const existing = this.store.get(telegram_id);
    if (!existing) return null;
    const updated: User = { ...existing, ...updates };
    this.store.set(telegram_id, updated);
    return updated;
  }

  async delete(telegram_id: number): Promise<boolean> {
    return this.store.delete(telegram_id);
  }

  async list(): Promise<User[]> {
    return [...this.store.values()];
  }
}

export function resolveUserStorage(env?: {
  REDIS_URL?: string;
}): UserStorage {
  const envObj = env ?? process.env;
  if (envObj.REDIS_URL) {
    const require = createRequire(import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ioredis: any = require("ioredis");
    const Redis = ioredis.default ?? ioredis.Redis ?? ioredis;
    const client = new Redis(envObj.REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: false,
    });
    return new RedisUserStorage(client as RedisLike);
  }
  return new MemoryUserStorage();
}

export const userStorage: UserStorage = resolveUserStorage();

export function resetUserStorage(): void {
  if (userStorage instanceof MemoryUserStorage) {
    (userStorage as MemoryUserStorage).reset();
  }
}
export { INITIAL_RATING };