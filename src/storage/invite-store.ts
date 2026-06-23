import { getRedisClient, type DomainRedis } from "./persistent.js";

export interface InviteData {
  createdBy: number;
  createdAt: number;
}

export interface PendingMatch {
  matchId: string;
  player1Id: number;
  player2Id: number;
  status: "pending";
  createdAt: number;
  inviteCode: string;
}

const INVITE_KEY_PREFIX = "invite:";
const MATCH_KEY_PREFIX = "pending_match:";
const COUNTER_KEY = "invite:counter";
const DEFAULT_TTL = 7 * 24 * 60 * 60;

export class InviteStore {
  private fallback = new Map<string, string>();

  private getClient(): DomainRedis | null {
    return getRedisClient();
  }

  private async read(key: string): Promise<string | null> {
    const redis = this.getClient();
    if (redis) {
      return redis.get(key);
    }
    return this.fallback.get(key) ?? null;
  }

  private async write(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const redis = this.getClient();
    if (redis) {
      if (ttlSeconds !== undefined) {
        await redis.set(key, value, "EX", ttlSeconds);
      } else {
        await redis.set(key, value);
      }
    } else {
      this.fallback.set(key, value);
    }
  }

  private async remove(key: string): Promise<void> {
    const redis = this.getClient();
    if (redis) {
      await redis.del(key);
    } else {
      this.fallback.delete(key);
    }
  }

  async nextCode(): Promise<string> {
    const raw = await this.read(COUNTER_KEY);
    const next = raw ? parseInt(raw, 10) + 1 : 1;
    await this.write(COUNTER_KEY, String(next));
    return `INV-${next}`;
  }

  async getInvite(code: string): Promise<InviteData | null> {
    const raw = await this.read(INVITE_KEY_PREFIX + code);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as InviteData;
    } catch {
      return null;
    }
  }

  async createInvite(code: string, data: InviteData, ttlSeconds: number = DEFAULT_TTL): Promise<void> {
    await this.write(INVITE_KEY_PREFIX + code, JSON.stringify(data), ttlSeconds);
  }

  async consumeInvite(code: string): Promise<InviteData | null> {
    const key = INVITE_KEY_PREFIX + code;
    const raw = await this.read(key);
    if (!raw) return null;
    let data: InviteData;
    try {
      data = JSON.parse(raw) as InviteData;
    } catch {
      return null;
    }
    await this.remove(key);
    return data;
  }

  async createPendingMatch(match: PendingMatch, ttlSeconds: number = DEFAULT_TTL): Promise<void> {
    await this.write(MATCH_KEY_PREFIX + match.matchId, JSON.stringify(match), ttlSeconds);
  }

  async getPendingMatch(matchId: string): Promise<PendingMatch | null> {
    const raw = await this.read(MATCH_KEY_PREFIX + matchId);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PendingMatch;
    } catch {
      return null;
    }
  }
}

let _store: InviteStore | null = null;

export function inviteStore(): InviteStore {
  if (!_store) {
    _store = new InviteStore();
  }
  return _store;
}