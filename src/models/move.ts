import { createRequire } from "node:module";
import type { RedisLike } from "../toolkit/session/redis.js";
import type { ShipPosition } from "./ship.js";
import type { Board, ShotResult } from "./board.js";

export interface Move {
  id: string;
  match_id: string;
  player_id: number;
  coordinate: ShipPosition;
  result: ShotResult;
  created_at: number;
}

export interface MoveStorage {
  create(
    match_id: string,
    player_id: number,
    coordinate: ShipPosition,
    result: ShotResult,
  ): Promise<Move>;
  read(id: string): Promise<Move | null>;
  findByMatch(match_id: string): Promise<Move[]>;
  findByPlayerAndMatch(
    player_id: number,
    match_id: string,
  ): Promise<Move[]>;
  countByMatch(match_id: string): Promise<number>;
}

export function checkWinCondition(board: Board): boolean {
  return board.ships.length > 0 && board.ships.every((s) => s.sunk);
}

const MOVE_KEY_PREFIX = "move:";
const MATCH_MOVES_PREFIX = "match_moves:";
const MOVE_COUNTER_KEY = MOVE_KEY_PREFIX + "__counter";

export class RedisMoveStorage implements MoveStorage {
  constructor(private readonly client: RedisLike) {}

  private k(id: string): string {
    return MOVE_KEY_PREFIX + id;
  }

  private mk(match_id: string): string {
    return MATCH_MOVES_PREFIX + match_id;
  }

  private async nextId(): Promise<string> {
    const val = await this.client.get(MOVE_COUNTER_KEY);
    const num = val ? parseInt(val, 10) : 0;
    const nextNum = num + 1;
    await this.client.set(MOVE_COUNTER_KEY, String(nextNum));
    return String(nextNum);
  }

  private async addToMatch(match_id: string, moveId: string): Promise<void> {
    const key = this.mk(match_id);
    const raw = await this.client.get(key);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    ids.push(moveId);
    await this.client.set(key, JSON.stringify(ids));
  }

  async create(
    match_id: string,
    player_id: number,
    coordinate: ShipPosition,
    result: ShotResult,
  ): Promise<Move> {
    const id = await this.nextId();
    const move: Move = {
      id,
      match_id,
      player_id,
      coordinate,
      result,
      created_at: Date.now(),
    };
    await this.client.set(this.k(id), JSON.stringify(move));
    await this.addToMatch(match_id, id);
    return move;
  }

  async read(id: string): Promise<Move | null> {
    const raw = await this.client.get(this.k(id));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Move;
    } catch {
      return null;
    }
  }

  async findByMatch(match_id: string): Promise<Move[]> {
    const raw = await this.client.get(this.mk(match_id));
    if (!raw) return [];
    let ids: string[];
    try {
      ids = JSON.parse(raw);
    } catch {
      return [];
    }
    const moves: Move[] = [];
    for (const id of ids) {
      const move = await this.read(id);
      if (move) moves.push(move);
    }
    return moves;
  }

  async findByPlayerAndMatch(
    player_id: number,
    match_id: string,
  ): Promise<Move[]> {
    const moves = await this.findByMatch(match_id);
    return moves.filter((m) => m.player_id === player_id);
  }

  async countByMatch(match_id: string): Promise<number> {
    const raw = await this.client.get(this.mk(match_id));
    if (!raw) return 0;
    try {
      return (JSON.parse(raw) as string[]).length;
    } catch {
      return 0;
    }
  }
}

export class MemoryMoveStorage implements MoveStorage {
  private store = new Map<string, Move>();
  private matchMoves = new Map<string, string[]>();
  private counter = 0;

  private nextId(): string {
    this.counter++;
    return String(this.counter);
  }

  private addToMatch(match_id: string, moveId: string): void {
    const ids = this.matchMoves.get(match_id) ?? [];
    ids.push(moveId);
    this.matchMoves.set(match_id, ids);
  }

  async create(
    match_id: string,
    player_id: number,
    coordinate: ShipPosition,
    result: ShotResult,
  ): Promise<Move> {
    const id = this.nextId();
    const move: Move = {
      id,
      match_id,
      player_id,
      coordinate,
      result,
      created_at: Date.now(),
    };
    this.store.set(id, move);
    this.addToMatch(match_id, id);
    return move;
  }

  async read(id: string): Promise<Move | null> {
    return this.store.get(id) ?? null;
  }

  async findByMatch(match_id: string): Promise<Move[]> {
    const ids = this.matchMoves.get(match_id) ?? [];
    const moves: Move[] = [];
    for (const id of ids) {
      const move = this.store.get(id);
      if (move) moves.push(move);
    }
    return moves;
  }

  async findByPlayerAndMatch(
    player_id: number,
    match_id: string,
  ): Promise<Move[]> {
    const moves = await this.findByMatch(match_id);
    return moves.filter((m) => m.player_id === player_id);
  }

  async countByMatch(match_id: string): Promise<number> {
    return (this.matchMoves.get(match_id) ?? []).length;
  }
}

export function resolveMoveStorage(env?: {
  REDIS_URL?: string;
}): MoveStorage {
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
    return new RedisMoveStorage(client as RedisLike);
  }
  return new MemoryMoveStorage();
}

export const moveStorage: MoveStorage = resolveMoveStorage();