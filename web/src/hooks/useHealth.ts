import { useEffect, useState } from 'react';
import type { Health } from '../types';

/** Dataset info and whether chat is enabled. null while loading, 'error' if the request failed. */
export function useHealth() {
  const [health, setHealth] = useState<Health | 'error' | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json() as Promise<Health>)
      .then(setHealth)
      .catch(() => setHealth('error'));
  }, []);

  return health;
}
