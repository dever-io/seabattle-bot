import { getRedisClient } from "./persistent.js";

const QUEUE_KEY = "matchmaking:queue";
const MATCH_PREFIX = "match:";

interface QueuedMatch {
  p1: string;
  p2: string;
  createdAt: number;
}

export class MatchmakingQueue {
  private fallbackQueue: string[] = [];
  private fallbackMatches = new Map<string, string>();

  async addToQueue(userId: string): Promise<boolean> {
    const redis = getRedisClient();
    if (redis) {
      const existing = await redis.lpos(QUEUE_KEY, userId);
      if (existing !== null) return false;
      await redis.rpush(QUEUE_KEY, userId);
    } else {
      if (this.fallbackQueue.includes(userId)) return false;
      this.fallbackQueue.push(userId);
    }
    return true;
  }

  async isInQueue(userId: string): Promise<boolean> {
    const redis = getRedisClient();
    if (redis) {
      const pos = await redis.lpos(QUEUE_KEY, userId);
      return pos !== null;
    }
    return this.fallbackQueue.includes(userId);
  }

  async queueLength(): Promise<number> {
    const redis = getRedisClient();
    if (redis) return redis.llen(QUEUE_KEY);
    return this.fallbackQueue.length;
  }

  async tryMatch(): Promise<[string, string] | null> {
    const redis = getRedisClient();
    let p1: string | null;
    let p2: string | null;

    if (redis) {
      p1 = await redis.lpop(QUEUE_KEY);
      p2 = await redis.lpop(QUEUE_KEY);
    } else {
      p1 = this.fallbackQueue.shift() ?? null;
      p2 = this.fallbackQueue.shift() ?? null;
    }

    if (!p1 || !p2) {
      if (p1 && !redis) this.fallbackQueue.unshift(p1);
      if (p1 && redis) await redis.lpush(QUEUE_KEY, p1);
      return null;
    }

    const matchKey = `${MATCH_PREFIX}${p1}:${p2}`;
    const matchData: QueuedMatch = {
      p1,
      p2,
      createdAt: Date.now(),
    };

    if (redis) {
      await redis.set(matchKey, JSON.stringify(matchData));
    } else {
      this.fallbackMatches.set(matchKey, JSON.stringify(matchData));
    }

    return [p1, p2];
  }
}

let _queue: MatchmakingQueue | null = null;

export function matchmakingQueue(): MatchmakingQueue {
  if (!_queue) {
    _queue = new MatchmakingQueue();
  }
  return _queue;
}

export function resetMatchmakingQueue(): void {
  _queue = null;
}