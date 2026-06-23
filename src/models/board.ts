import { createRequire } from "node:module";
import type { RedisLike } from "../toolkit/session/redis.js";
import {
  type Ship,
  type ShipOrientation,
  type ShipPosition,
  type ShipType,
  SHIP_SIZES,
  computePositions,
  fleetTypes,
} from "./ship.js";

export const BOARD_SIZE = 10;

export const SHOT_RESULT_HIT = "hit";
export const SHOT_RESULT_MISS = "miss";
export const SHOT_RESULT_SUNK = "sunk";
export type ShotResult =
  | typeof SHOT_RESULT_HIT
  | typeof SHOT_RESULT_MISS
  | typeof SHOT_RESULT_SUNK;

export const PLACE_ERROR_BOUNDS = "bounds";
export const PLACE_ERROR_OVERLAP = "overlap";
export const PLACE_ERROR_DUPLICATE = "duplicate";
export type PlaceError =
  | typeof PLACE_ERROR_BOUNDS
  | typeof PLACE_ERROR_OVERLAP
  | typeof PLACE_ERROR_DUPLICATE;

export interface PlacementResult {
  ok: true;
  board: Board;
  ship: Ship;
}

export interface PlacementError {
  ok: false;
  error: PlaceError;
}

export interface ShotOutcome {
  result: ShotResult;
  position: ShipPosition;
  ship?: Ship;
  board: Board;
}

export interface Board {
  owner: number;
  ships: Ship[];
  hits: ShipPosition[];
  misses: ShipPosition[];
}

function emptyBoard(owner: number): Board {
  return { owner, ships: [], hits: [], misses: [] };
}

function posKey(pos: ShipPosition): string {
  return `${pos.row},${pos.col}`;
}

function inBounds(pos: ShipPosition): boolean {
  return (
    pos.row >= 0 &&
    pos.row < BOARD_SIZE &&
    pos.col >= 0 &&
    pos.col < BOARD_SIZE
  );
}

function positionsOverlap(
  a: ShipPosition[],
  b: ShipPosition[],
): boolean {
  const set = new Set<string>();
  for (const p of a) set.add(posKey(p));
  for (const p of b) {
    if (set.has(posKey(p))) return true;
  }
  return false;
}

function validatePlacement(
  board: Board,
  type: ShipType,
  row: number,
  col: number,
  orientation: ShipOrientation,
): PlaceError | null {
  const size = SHIP_SIZES[type];
  const newPositions = computePositions(row, col, orientation, size);

  for (const p of newPositions) {
    if (!inBounds(p)) return PLACE_ERROR_BOUNDS;
  }

  const hasDuplicate = board.ships.some((s) => s.type === type);
  if (hasDuplicate) return PLACE_ERROR_DUPLICATE;

  const allOccupied = board.ships.flatMap((s) => s.positions);
  if (positionsOverlap(newPositions, allOccupied)) {
    return PLACE_ERROR_OVERLAP;
  }

  return null;
}

export interface BoardStorage {
  placeShip(
    owner: number,
    type: ShipType,
    row: number,
    col: number,
    orientation: ShipOrientation,
  ): Promise<PlacementResult | PlacementError>;
  getBoard(owner: number): Promise<Board>;
  fire(
    target: number,
    row: number,
    col: number,
  ): Promise<ShotOutcome | null>;
}

const BOARD_KEY_PREFIX = "board:";

export class RedisBoardStorage implements BoardStorage {
  private counter = 0;

  constructor(private readonly client: RedisLike) {}

  private k(owner: number): string {
    return BOARD_KEY_PREFIX + String(owner);
  }

  private nextShipId(owner: number): string {
    this.counter++;
    return String(owner) + "_" + String(this.counter);
  }

  async load(owner: number): Promise<Board> {
    const raw = await this.client.get(this.k(owner));
    if (!raw) return emptyBoard(owner);
    try {
      return JSON.parse(raw) as Board;
    } catch {
      return emptyBoard(owner);
    }
  }

  async save(board: Board): Promise<void> {
    await this.client.set(this.k(board.owner), JSON.stringify(board));
  }

  async placeShip(
    owner: number,
    type: ShipType,
    row: number,
    col: number,
    orientation: ShipOrientation,
  ): Promise<PlacementResult | PlacementError> {
    const board = await this.load(owner);
    const error = validatePlacement(board, type, row, col, orientation);
    if (error) return { ok: false, error };

    const size = SHIP_SIZES[type];
    const positions = computePositions(row, col, orientation, size);
    const ship: Ship = {
      id: this.nextShipId(owner),
      owner,
      type,
      size,
      positions,
      orientation,
      sunk: false,
      hits: [],
    };

    board.ships.push(ship);
    await this.save(board);
    return { ok: true, board, ship };
  }

  async getBoard(owner: number): Promise<Board> {
    return this.load(owner);
  }

  async fire(
    target: number,
    row: number,
    col: number,
  ): Promise<ShotOutcome | null> {
    const board = await this.load(target);
    const pos: ShipPosition = { row, col };
    const key = posKey(pos);

    if (
      board.hits.some((h) => posKey(h) === key) ||
      board.misses.some((m) => posKey(m) === key)
    ) {
      return null;
    }

    let hitShip: Ship | undefined;
    for (const ship of board.ships) {
      if (ship.positions.some((p) => posKey(p) === key)) {
        hitShip = ship;
        break;
      }
    }

    if (!hitShip) {
      board.misses.push(pos);
      await this.save(board);
      return { result: SHOT_RESULT_MISS, position: pos, board };
    }

    hitShip.hits.push(pos);
    board.hits.push(pos);

    let result: ShotResult = SHOT_RESULT_HIT;
    if (hitShip.hits.length >= hitShip.size) {
      hitShip.sunk = true;
      result = SHOT_RESULT_SUNK;
    }

    await this.save(board);
    return { result, position: pos, ship: hitShip, board };
  }
}

export class MemoryBoardStorage implements BoardStorage {
  private store = new Map<number, Board>();
  private counter = 0;

  private load(owner: number): Board {
    return this.store.get(owner) ?? emptyBoard(owner);
  }

  private save(board: Board): void {
    this.store.set(board.owner, board);
  }

  private nextShipId(owner: number): string {
    this.counter++;
    return String(owner) + "_" + String(this.counter);
  }

  async placeShip(
    owner: number,
    type: ShipType,
    row: number,
    col: number,
    orientation: ShipOrientation,
  ): Promise<PlacementResult | PlacementError> {
    const board = this.load(owner);
    const error = validatePlacement(board, type, row, col, orientation);
    if (error) return { ok: false, error };

    const size = SHIP_SIZES[type];
    const positions = computePositions(row, col, orientation, size);
    const ship: Ship = {
      id: this.nextShipId(owner),
      owner,
      type,
      size,
      positions,
      orientation,
      sunk: false,
      hits: [],
    };

    board.ships.push(ship);
    this.save(board);
    return { ok: true, board, ship };
  }

  async getBoard(owner: number): Promise<Board> {
    return this.load(owner);
  }

  async fire(
    target: number,
    row: number,
    col: number,
  ): Promise<ShotOutcome | null> {
    const board = this.load(target);
    const pos: ShipPosition = { row, col };
    const key = posKey(pos);

    if (
      board.hits.some((h) => posKey(h) === key) ||
      board.misses.some((m) => posKey(m) === key)
    ) {
      return null;
    }

    let hitShip: Ship | undefined;
    for (const ship of board.ships) {
      if (ship.positions.some((p) => posKey(p) === key)) {
        hitShip = ship;
        break;
      }
    }

    if (!hitShip) {
      board.misses.push(pos);
      this.save(board);
      return { result: SHOT_RESULT_MISS, position: pos, board };
    }

    hitShip.hits.push(pos);
    board.hits.push(pos);

    let result: ShotResult = SHOT_RESULT_HIT;
    if (hitShip.hits.length >= hitShip.size) {
      hitShip.sunk = true;
      result = SHOT_RESULT_SUNK;
    }

    this.save(board);
    return { result, position: pos, ship: hitShip, board };
  }
}

export function resolveBoardStorage(env?: {
  REDIS_URL?: string;
}): BoardStorage {
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
    return new RedisBoardStorage(client as RedisLike);
  }
  return new MemoryBoardStorage();
}

export const boardStorage: BoardStorage = resolveBoardStorage();