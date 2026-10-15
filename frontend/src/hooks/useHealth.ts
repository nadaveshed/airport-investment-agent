/* Fetches dataset metadata and provider configuration status from the health endpoint. */

import { useEffect, useState } from 'react';
import type { Health } from '../types';

/** Dataset info and whether chat is enabled. null while loading, 'error' if the request failed. */
export function useHealth() {
  const [health, setHealth] = useState<Health | 'error' | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`Health request failed (${res.status})`);
        return res.json() as Promise<Health>;
      })
      .then(setHealth)
      .catch(() => setHealth('error'));
  }, []);

  return health;
}
