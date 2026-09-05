/**
 * Namespaced browser storage.
 *
 * Mockups are served many-per-origin under /<mockup_id>/ and Web Storage is
 * origin-scoped rather than path-scoped, so every key is prefixed with the first
 * URL path segment. The colon separator is load-bearing — tooling seeds both the
 * bare and the "<segment>:"-prefixed form.
 */
const NS =
  (typeof window !== 'undefined'
    ? window.location.pathname.split('/')[1]
    : '') || 'app';

export const nsKey = (key: string): string => `${NS}:${key}`;

export function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(nsKey(key));
  } catch {
    return null;
  }
}

export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(nsKey(key));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(nsKey(key), JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode / quota) — preview still works */
  }
}

export function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(nsKey(key), value);
  } catch {
    /* ignore */
  }
}

export function removeKeys(...keys: string[]): void {
  try {
    for (const key of keys) {
      localStorage.removeItem(nsKey(key));
    }
  } catch {
    /* ignore */
  }
}
