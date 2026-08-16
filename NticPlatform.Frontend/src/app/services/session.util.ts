const AUTH_KEYS = ['activeRoleId', 'activeUserEmail', 'activeUserTicket', 'activeUserToken', 'activeUserName'] as const;

export type AuthKey = typeof AUTH_KEYS[number];

const REMEMBER_DEVICE_KEY = 'ntic_remember_device';
const REMEMBERED_USERNAME_KEY = 'ntic_remembered_username';
/** Legacy key that used to hold a base64-encoded password. Only ever removed. */
const LEGACY_PASSWORD_KEY = 'ntic_remembered_password';

export function getAuthValue(key: AuthKey): string | null {
  if (typeof window === 'undefined') return null;
  const session = window.sessionStorage.getItem(key);
  if (session !== null) return session;
  return window.localStorage.getItem(key);
}

/**
 * Session values live in sessionStorage only, so closing the tab ends the
 * session. There is intentionally no "persist across restarts" option: a
 * long-lived bearer token in localStorage is readable by any XSS payload.
 */
export function setAuthValue(key: AuthKey, value: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(key);
  window.sessionStorage.removeItem(key);
  window.sessionStorage.setItem(key, value);
}

export function clearAuthValue(key: AuthKey): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(key);
  window.localStorage.removeItem(key);
}

export function clearAllAuthValues(): void {
  AUTH_KEYS.forEach(clearAuthValue);
  // Defence in depth: make sure no legacy credential survives a logout.
  purgeLegacyStoredPassword();
}

export const clearAuthSession = clearAllAuthValues;

export function hasRememberedDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(REMEMBER_DEVICE_KEY) === 'true';
}

/**
 * Deletes any password left behind by the previous implementation, which
 * base64-encoded the user's real password into localStorage. Base64 is
 * encoding, not encryption. Called on load and on logout so existing users are
 * cleaned up without needing to do anything.
 */
export function purgeLegacyStoredPassword(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LEGACY_PASSWORD_KEY);
  } catch {
    /* storage unavailable - nothing to clean */
  }
}

/**
 * Returns the remembered *username* only.
 *
 * `password` is always an empty string and is kept in the shape purely so
 * existing callers keep compiling. Passwords are never persisted.
 */
export function getRememberedCredentials(): { username: string; password: string; remembered: boolean } {
  if (typeof window === 'undefined') return { username: '', password: '', remembered: false };
  purgeLegacyStoredPassword();
  const remembered = window.localStorage.getItem(REMEMBER_DEVICE_KEY) === 'true';
  const username = window.localStorage.getItem(REMEMBERED_USERNAME_KEY) || '';
  return { username, password: '', remembered };
}

/**
 * Remembers the username so the login form can prefill it. The `password`
 * argument is accepted and deliberately discarded.
 */
export function saveRememberedCredentials(username: string, _password: string, remember: boolean): void {
  if (typeof window === 'undefined') return;
  // Never persist a password, regardless of the "remember" choice.
  purgeLegacyStoredPassword();
  if (remember) {
    window.localStorage.setItem(REMEMBER_DEVICE_KEY, 'true');
    window.localStorage.setItem(REMEMBERED_USERNAME_KEY, username);
  } else {
    forgetRememberedCredentials();
  }
}

export function forgetRememberedCredentials(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(REMEMBER_DEVICE_KEY);
  window.localStorage.removeItem(REMEMBERED_USERNAME_KEY);
  purgeLegacyStoredPassword();
}
