const AUTH_KEYS = ['activeRoleId', 'activeUserEmail', 'activeUserTicket'] as const;

export type AuthKey = typeof AUTH_KEYS[number];

export function getAuthValue(key: AuthKey): string | null {
  if (typeof window === 'undefined') return null;
  const session = window.sessionStorage.getItem(key);
  if (session !== null) return session;
  return window.localStorage.getItem(key);
}

export function setAuthValue(key: AuthKey, value: string, rememberDevice: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(key);
  window.sessionStorage.removeItem(key);
  const target = rememberDevice ? window.localStorage : window.sessionStorage;
  target.setItem(key, value);
}

export function clearAuthValue(key: AuthKey): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(key);
  window.localStorage.removeItem(key);
}

export function clearAllAuthValues(): void {
  AUTH_KEYS.forEach(clearAuthValue);
}

export function hasRememberedDevice(): boolean {
  return getAuthValue('activeRoleId') !== null && window.localStorage.getItem('activeRoleId') !== null;
}
