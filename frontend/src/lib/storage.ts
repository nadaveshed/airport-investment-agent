const SESSION_KEY = 'airport-agent-session';

// Storage can be unavailable (private mode, blocked cookies); the session then just won't survive a reload.

export function loadSessionId(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function saveSessionId(id: string | null) {
  try {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
