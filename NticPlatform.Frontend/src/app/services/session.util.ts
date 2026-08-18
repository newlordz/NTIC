const AUTH_KEYS = ['activeRoleId', 'activeUserEmail', 'activeUserTicket', 'activeUserToken', 'activeUserName'] as const;

export type AuthKey = typeof AUTH_KEYS[number];

const REMEMBER_DEVICE_KEY = 'ntic_remember_device';
const REMEMBERED_USERNAME_KEY = 'ntic_remembered_username';
/** Legacy key that used to hold a base64-encoded password. Only ever removed. */
const LEGACY_PASSWORD_KEY = 'ntic_remembered_password';

/**
 * Reads a session value.
 *
 * sessionStorage ONLY. There is deliberately no localStorage fallback: a bearer
 * token in localStorage survives browser restarts, which defeats both the
 * close-the-tab sign-out and the inactivity timeout, and it stays readable by
 * any XSS payload for as long as it sits there. Older builds did fall back to
 * localStorage, so `purgeLegacyAuthStorage()` deletes anything left behind.
 */
export function getAuthValue(key: AuthKey): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(key);
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

/**
 * Deletes session values left in localStorage by builds that used to persist
 * them there.
 *
 * Dropping the read-fallback in getAuthValue() stops those values being *used*,
 * but on its own it would leave a real bearer token sitting in localStorage
 * indefinitely. This removes them. Safe to call on every load: current code
 * never writes AUTH_KEYS to localStorage, so for an up-to-date client this is a
 * no-op.
 */
export function purgeLegacyAuthStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    AUTH_KEYS.forEach(key => window.localStorage.removeItem(key));
  } catch {
    /* storage unavailable - nothing to clean */
  }
}

export const clearAuthSession = clearAllAuthValues;

/**
 * Strips cardholder data out of any saved form draft.
 *
 * The profile-completion page used to `{ ...profileForm }` into
 * localStorage['ntic_drafts'], and profileForm held cardNumber, cardExpiry,
 * cardCvv and cardName. So existing users have a full card number and CVV
 * sitting in their browser in cleartext right now. Removing the fields from the
 * form stops NEW writes but does nothing about what is already stored --
 * localStorage persists until something deletes it, and drafts are keyed by
 * email so they survive logout.
 *
 * This scrubs the sensitive keys while preserving the rest of the draft, so a
 * user part-way through onboarding does not lose their work. Idempotent and
 * safe to run on every startup.
 */
const CARDHOLDER_DRAFT_KEYS = [
  'cardNumber', 'cardCvv', 'cardExpiry', 'cardName',
  'accountHolderName', 'chequeNo',
];

export function purgeCardDataFromDrafts(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem('ntic_drafts');
    if (!raw) return;
    const drafts = JSON.parse(raw);
    if (!drafts || typeof drafts !== 'object') {
      // Unparseable or unexpected shape: delete rather than leave a blob that
      // might still contain a card number.
      window.localStorage.removeItem('ntic_drafts');
      return;
    }
    let changed = false;
    for (const key of Object.keys(drafts)) {
      const data = drafts[key]?.data;
      if (!data || typeof data !== 'object') continue;
      for (const field of CARDHOLDER_DRAFT_KEYS) {
        if (field in data) {
          delete data[field];
          changed = true;
        }
      }
    }
    if (changed) {
      window.localStorage.setItem('ntic_drafts', JSON.stringify(drafts));
    }
  } catch {
    // If anything about the blob is unreadable, err on the side of deleting it:
    // a lost draft is recoverable, a stored CVV is not acceptable.
    try { window.localStorage.removeItem('ntic_drafts'); } catch { /* ignore */ }
  }
}

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
