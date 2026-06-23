import { createRequire } from "node:module";
import type { RedisLike } from "../toolkit/session/redis.js";

export interface MatchInvite {
  code: string;
  host_id: number;
  expires_at: number;
}

export interface MatchInviteStorage {
  create(host_id: number, ttlMs: number): Promise<MatchInvite>;
  read(code: string): Promise<MatchInvite | null>;
  delete(code: string): Promise<boolean>;
  findByHost(host_id: number): Promise<MatchInvite[]>;
}

export function validateCode(code: string): string | null {
  if (!code || code.trim().length === 0) return "Code cannot be empty.";
  if (code.length > 32) return "Code must be 32 characters or fewer.";
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return "Code may only contain letters, digits, hyphens, and underscores.";
  return null;
}

export function isExpired(invite: MatchInvite): boolean {
  return Date.now() > invite.expires_at;
}

const INVITE_KEY_PREFIX = "minvite:";
const INVITE_COUNTER_KEY = INVITE_KEY_PREFIX + "__counter";
const HOST_INVITES_PREFIX = "host_invites:";

export class RedisMatchInviteStorage implements MatchInviteStorage {
  constructor(private readonly client: RedisLike) {}

  private k(code: string): string {
    return INVITE_KEY_PREFIX + code;
  }

  private hk(host_id: number): string {
    return HOST_INVITES_PREFIX + String(host_id);
  }

  private async nextCode(): Promise<string> {
    const nextNum = await this.client.incr(INVITE_COUNTER_KEY);
    return `INV-${nextNum}`;
  }

  private async addHostInvite(host_id: number, code: string): Promise<void> {
    const key = this.hk(host_id);
    const raw = await this.client.get(key);
    const codes: string[] = raw ? JSON.parse(raw) : [];
    if (!codes.includes(code)) {
      codes.push(code);
      await this.client.set(key, JSON.stringify(codes));
    }
  }

  private async removeHostInvite(host_id: number, code: string): Promise<void> {
    const key = this.hk(host_id);
    const raw = await this.client.get(key);
    if (!raw) return;
    const codes: string[] = JSON.parse(raw);
    const filtered = codes.filter((c) => c !== code);
    if (filtered.length === 0) {
      await this.client.del(key);
    } else {
      await this.client.set(key, JSON.stringify(filtered));
    }
  }

  async create(host_id: number, ttlMs: number): Promise<MatchInvite> {
    const code = await this.nextCode();
    const invite: MatchInvite = {
      code,
      host_id,
      expires_at: Date.now() + ttlMs,
    };
    await this.client.set(this.k(code), JSON.stringify(invite));
    await this.addHostInvite(host_id, code);
    return invite;
  }

  async read(code: string): Promise<MatchInvite | null> {
    const raw = await this.client.get(this.k(code));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as MatchInvite;
    } catch {
      return null;
    }
  }

  async delete(code: string): Promise<boolean> {
    const existing = await this.read(code);
    if (!existing) return false;
    await this.client.del(this.k(code));
    await this.removeHostInvite(existing.host_id, code);
    return true;
  }

  async findByHost(host_id: number): Promise<MatchInvite[]> {
    const key = this.hk(host_id);
    const raw = await this.client.get(key);
    if (!raw) return [];
    let codes: string[];
    try {
      codes = JSON.parse(raw);
    } catch {
      return [];
    }
    const invites: MatchInvite[] = [];
    for (const code of codes) {
      const invite = await this.read(code);
      if (invite) invites.push(invite);
    }
    return invites;
  }
}

export class MemoryMatchInviteStorage implements MatchInviteStorage {
  private store = new Map<string, MatchInvite>();
  private hostInvites = new Map<number, string[]>();
  private counter = 0;

  reset(): void {
    this.store.clear();
    this.hostInvites.clear();
    this.counter = 0;
  }

  private nextCode(): string {
    this.counter++;
    return `INV-${this.counter}`;
  }

  private addHostInvite(host_id: number, code: string): void {
    const codes = this.hostInvites.get(host_id) ?? [];
    if (!codes.includes(code)) {
      codes.push(code);
      this.hostInvites.set(host_id, codes);
    }
  }

  private removeHostInvite(host_id: number, code: string): void {
    const codes = this.hostInvites.get(host_id);
    if (!codes) return;
    const filtered = codes.filter((c) => c !== code);
    if (filtered.length === 0) {
      this.hostInvites.delete(host_id);
    } else {
      this.hostInvites.set(host_id, filtered);
    }
  }

  async create(host_id: number, ttlMs: number): Promise<MatchInvite> {
    const code = this.nextCode();
    const invite: MatchInvite = {
      code,
      host_id,
      expires_at: Date.now() + ttlMs,
    };
    this.store.set(code, invite);
    this.addHostInvite(host_id, code);
    return invite;
  }

  async read(code: string): Promise<MatchInvite | null> {
    return this.store.get(code) ?? null;
  }

  async delete(code: string): Promise<boolean> {
    const existing = this.store.get(code);
    if (!existing) return false;
    this.store.delete(code);
    this.removeHostInvite(existing.host_id, code);
    return true;
  }

  async findByHost(host_id: number): Promise<MatchInvite[]> {
    const codes = this.hostInvites.get(host_id) ?? [];
    const invites: MatchInvite[] = [];
    for (const code of codes) {
      const invite = this.store.get(code);
      if (invite) invites.push(invite);
    }
    return invites;
  }
}

export function resolveMatchInviteStorage(env?: {
  REDIS_URL?: string;
}): MatchInviteStorage {
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
    return new RedisMatchInviteStorage(client as RedisLike);
  }
  return new MemoryMatchInviteStorage();
}

export const matchInviteStorage: MatchInviteStorage = resolveMatchInviteStorage();

export function resetMatchInviteStorage(): void {
  if (matchInviteStorage instanceof MemoryMatchInviteStorage) {
    (matchInviteStorage as MemoryMatchInviteStorage).reset();
  }
}