import { createRequire } from "node:module";
import type { RedisLike } from "../toolkit/session/redis.js";

export type MatchState = "waiting" | "in_progress" | "completed";

export interface Match {
  id: string;
  playerA: number;
  playerB: number;
  turn: number;
  state: MatchState;
  created_at: number;
}

export interface MatchStorage {
  create(playerA: number, playerB: number): Promise<Match>;
  read(id: string): Promise<Match | null>;
  update(
    id: string,
    updates: Partial<Omit<Match, "id">>,
  ): Promise<Match | null>;
  delete(id: string): Promise<boolean>;
  findByPlayer(telegram_id: number): Promise<Match[]>;
  startMatch(id: string): Promise<Match | null>;
  passTurn(id: string, currentPlayer: number): Promise<Match | null>;
  completeMatch(id: string): Promise<Match | null>;
}

const MATCH_KEY_PREFIX = "match:";
const MATCH_COUNTER_KEY = MATCH_KEY_PREFIX + "__counter";
const PLAYER_MATCHES_PREFIX = "player_matches:";

export class RedisMatchStorage implements MatchStorage {
  constructor(private readonly client: RedisLike) {}

  private k(id: string): string {
    return MATCH_KEY_PREFIX + id;
  }

  private pk(telegram_id: number): string {
    return PLAYER_MATCHES_PREFIX + String(telegram_id);
  }

  private async nextId(): Promise<string> {
    const nextNum = await this.client.incr(MATCH_COUNTER_KEY);
    return String(nextNum);
  }

  private async addPlayerMatch(telegram_id: number, matchId: string): Promise<void> {
    const key = this.pk(telegram_id);
    const raw = await this.client.get(key);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    if (!ids.includes(matchId)) {
      ids.push(matchId);
      await this.client.set(key, JSON.stringify(ids));
    }
  }

  private async removePlayerMatch(telegram_id: number, matchId: string): Promise<void> {
    const key = this.pk(telegram_id);
    const raw = await this.client.get(key);
    if (!raw) return;
    const ids: string[] = JSON.parse(raw);
    const filtered = ids.filter((m) => m !== matchId);
    if (filtered.length === 0) {
      await this.client.del(key);
    } else {
      await this.client.set(key, JSON.stringify(filtered));
    }
  }

  async create(playerA: number, playerB: number): Promise<Match> {
    const id = await this.nextId();
    const match: Match = {
      id,
      playerA,
      playerB,
      turn: 0,
      state: "waiting",
      created_at: Date.now(),
    };
    await this.client.set(this.k(id), JSON.stringify(match));
    await this.addPlayerMatch(playerA, id);
    await this.addPlayerMatch(playerB, id);
    return match;
  }

  async read(id: string): Promise<Match | null> {
    const raw = await this.client.get(this.k(id));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Match;
    } catch {
      return null;
    }
  }

  async update(
    id: string,
    updates: Partial<Omit<Match, "id">>,
  ): Promise<Match | null> {
    const existing = await this.read(id);
    if (!existing) return null;
    const updated: Match = { ...existing, ...updates };
    await this.client.set(this.k(id), JSON.stringify(updated));
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.read(id);
    if (!existing) return false;
    await this.client.del(this.k(id));
    await this.removePlayerMatch(existing.playerA, id);
    await this.removePlayerMatch(existing.playerB, id);
    return true;
  }

  async findByPlayer(telegram_id: number): Promise<Match[]> {
    const key = this.pk(telegram_id);
    const raw = await this.client.get(key);
    if (!raw) return [];
    let ids: string[];
    try {
      ids = JSON.parse(raw);
    } catch {
      return [];
    }
    const matches: Match[] = [];
    for (const id of ids) {
      const match = await this.read(id);
      if (match) matches.push(match);
    }
    return matches;
  }

  async startMatch(id: string): Promise<Match | null> {
    const match = await this.read(id);
    if (!match) return null;
    if (match.state !== "waiting") return match;
    return this.update(id, {
      state: "in_progress",
      turn: match.playerA,
    });
  }

  async passTurn(
    id: string,
    currentPlayer: number,
  ): Promise<Match | null> {
    const match = await this.read(id);
    if (!match) return null;
    if (match.state !== "in_progress") return match;
    if (match.turn !== currentPlayer) return match;
    const nextTurn =
      match.turn === match.playerA ? match.playerB : match.playerA;
    return this.update(id, { turn: nextTurn });
  }

  async completeMatch(id: string): Promise<Match | null> {
    const match = await this.read(id);
    if (!match) return null;
    if (match.state !== "in_progress") return match;
    return this.update(id, { state: "completed", turn: 0 });
  }
}

export class MemoryMatchStorage implements MatchStorage {
  private store = new Map<string, Match>();
  private playerMatches = new Map<number, string[]>();
  private counter = 0;

  private nextId(): string {
    this.counter++;
    return String(this.counter);
  }

  private addPlayerMatch(telegram_id: number, matchId: string): void {
    const ids = this.playerMatches.get(telegram_id) ?? [];
    if (!ids.includes(matchId)) {
      ids.push(matchId);
      this.playerMatches.set(telegram_id, ids);
    }
  }

  private removePlayerMatch(telegram_id: number, matchId: string): void {
    const ids = this.playerMatches.get(telegram_id);
    if (!ids) return;
    const filtered = ids.filter((m) => m !== matchId);
    if (filtered.length === 0) {
      this.playerMatches.delete(telegram_id);
    } else {
      this.playerMatches.set(telegram_id, filtered);
    }
  }

  async create(playerA: number, playerB: number): Promise<Match> {
    const id = this.nextId();
    const match: Match = {
      id,
      playerA,
      playerB,
      turn: 0,
      state: "waiting",
      created_at: Date.now(),
    };
    this.store.set(id, match);
    this.addPlayerMatch(playerA, id);
    this.addPlayerMatch(playerB, id);
    return match;
  }

  async read(id: string): Promise<Match | null> {
    return this.store.get(id) ?? null;
  }

  async update(
    id: string,
    updates: Partial<Omit<Match, "id">>,
  ): Promise<Match | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated: Match = { ...existing, ...updates };
    this.store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const existing = this.store.get(id);
    if (!existing) return false;
    this.store.delete(id);
    this.removePlayerMatch(existing.playerA, id);
    this.removePlayerMatch(existing.playerB, id);
    return true;
  }

  async findByPlayer(telegram_id: number): Promise<Match[]> {
    const ids = this.playerMatches.get(telegram_id) ?? [];
    const matches: Match[] = [];
    for (const id of ids) {
      const match = this.store.get(id);
      if (match) matches.push(match);
    }
    return matches;
  }

  async startMatch(id: string): Promise<Match | null> {
    const match = this.store.get(id);
    if (!match) return null;
    if (match.state !== "waiting") return match;
    const updated: Match = { ...match, state: "in_progress", turn: match.playerA };
    this.store.set(id, updated);
    return updated;
  }

  async passTurn(
    id: string,
    currentPlayer: number,
  ): Promise<Match | null> {
    const match = this.store.get(id);
    if (!match) return null;
    if (match.state !== "in_progress") return match;
    if (match.turn !== currentPlayer) return match;
    const nextTurn =
      match.turn === match.playerA ? match.playerB : match.playerA;
    const updated: Match = { ...match, turn: nextTurn };
    this.store.set(id, updated);
    return updated;
  }

  async completeMatch(id: string): Promise<Match | null> {
    const match = this.store.get(id);
    if (!match) return null;
    if (match.state !== "in_progress") return match;
    const updated: Match = { ...match, state: "completed", turn: 0 };
    this.store.set(id, updated);
    return updated;
  }
}

export function resolveMatchStorage(env?: {
  REDIS_URL?: string;
}): MatchStorage {
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
    return new RedisMatchStorage(client as RedisLike);
  }
  return new MemoryMatchStorage();
}

export const matchStorage: MatchStorage = resolveMatchStorage();