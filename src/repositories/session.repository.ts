import { randomUUID } from 'node:crypto';
import type { Session } from '../types/chat.js';
import { TtlCache } from '../utils/ttlCache.js';

export interface SessionRepository {
  create(): Session;
  get(id: string): Session | undefined;
  save(session: Session): void;
}

const ONE_HOUR = 60 * 60 * 1000;

/** Single-instance session store with sliding expiry. A multi-instance deployment would back this with Redis. */
export class InMemorySessionRepository implements SessionRepository {
  private readonly cache: TtlCache<Session>;

  constructor(idleTtlMs = ONE_HOUR, maxSessions = 500) {
    this.cache = new TtlCache(idleTtlMs, maxSessions);
  }

  create(): Session {
    const now = new Date().toISOString();
    const session: Session = { id: randomUUID(), messages: [], createdAt: now, updatedAt: now };
    this.cache.set(session.id, session);
    return session;
  }

  get(id: string): Session | undefined {
    const session = this.cache.get(id);
    if (session) this.cache.set(id, session); // sliding expiry
    return session;
  }

  save(session: Session): void {
    this.cache.set(session.id, { ...session, updatedAt: new Date().toISOString() });
  }
}
