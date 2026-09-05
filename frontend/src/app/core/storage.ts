/**
 * Namespaced browser storage.
 *
 * Mockups are served many-per-origin under /<mockup_id>/ and Web Storage is
 * origin-scoped rather than path-scoped, so every key is prefixed with the
 * segment the app is *mounted* at. The colon separator is load-bearing —
 * tooling seeds both the bare and the "<segment>:"-prefixed form, which is why
 * every read falls back to the bare key.
 *
 * The prefix comes from `<base href>`, NOT from `window.location.pathname`.
 * index.html rewrites the base href to the mount prefix before the bundle
 * loads, so the base is constant for the whole app; the pathname is not. Keying
 * off the pathname made the namespace change with the route ("login:token" on
 * /login, "items:token" on /items), so a deep link or a page refresh looked
 * signed-out and bounced back to /login — every route was effectively
 * un-linkable once authenticated.
 */
function mountNamespace(): string {
  if (typeof document === 'undefined') {
    return 'app';
  }
  try {
    const href = document.querySelector('base')?.getAttribute('href') ?? '/';
    // The base href may be absolute ("https://host/prefix/") or relative ("/prefix/").
    const path = /^[a-z]+:\/\//i.test(href) ? new URL(href).pathname : href;
    return path.split('/').filter(Boolean)[0] || 'app';
  } catch {
    return 'app';
  }
}

const NS = mountNamespace();

export const nsKey = (key: string): string => `${NS}:${key}`;

export function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(nsKey(key)) ?? localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function readJson<T>(key: string): T | null {
  try {
    const raw = readRaw(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(nsKey(key), JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode / quota) — the app still works */
  }
}

export function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(nsKey(key), value);
  } catch {
    /* ignore */
  }
}

/** Removes both the namespaced and the bare form so a sign-out is complete. */
export function removeKeys(...keys: string[]): void {
  try {
    for (const key of keys) {
      localStorage.removeItem(nsKey(key));
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}
