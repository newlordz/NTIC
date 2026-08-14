const AUTH_KEYS = ['activeRoleId', 'activeUserEmail', 'activeUserTicket', 'activeUserToken', 'activeUserName'] as const;

export type AuthKey = typeof AUTH_KEYS[number];

export function getAuthValue(key: AuthKey): string | null {
  if (typeof window === 'undefined') return null;
  const session = window.sessionStorage.getItem(key);
  if (session !== null) return session;
  return window.localStorage.getItem(key);
}

export function setAuthValue(key: AuthKey, value: string, rememberDevice: boolean = false): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(key);
  window.sessionStorage.removeItem(key);
  // Store active session in sessionStorage so returning to landing does not bypass login
  window.sessionStorage.setItem(key, value);
}

export function clearAuthValue(key: AuthKey): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(key);
  window.localStorage.removeItem(key);
}

export function clearAllAuthValues(): void {
  AUTH_KEYS.forEach(clearAuthValue);
}

export const clearAuthSession = clearAllAuthValues;

export function hasRememberedDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem('ntic_remember_device') === 'true';
}

export function getRememberedCredentials(): { username: string; password: string; remembered: boolean } {
  if (typeof window === 'undefined') return { username: '', password: '', remembered: false };
  const remembered = window.localStorage.getItem('ntic_remember_device') === 'true';
  const username = window.localStorage.getItem('ntic_remembered_username') || '';
  let password = '';
  const storedPass = window.localStorage.getItem('ntic_remembered_password');
  if (storedPass) {
    try {
      password = decodeURIComponent(escape(window.atob(storedPass)));
    } catch (e) {
      password = storedPass;
    }
  }
  return { username, password, remembered };
}

export function saveRememberedCredentials(username: string, password: string, remember: boolean): void {
  if (typeof window === 'undefined') return;
  if (remember) {
    window.localStorage.setItem('ntic_remember_device', 'true');
    window.localStorage.setItem('ntic_remembered_username', username);
    try {
      const obfuscated = window.btoa(unescape(encodeURIComponent(password)));
      window.localStorage.setItem('ntic_remembered_password', obfuscated);
    } catch (e) {
      window.localStorage.setItem('ntic_remembered_password', password);
    }
  } else {
    forgetRememberedCredentials();
  }
}

export function forgetRememberedCredentials(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('ntic_remember_device');
  window.localStorage.removeItem('ntic_remembered_username');
  window.localStorage.removeItem('ntic_remembered_password');
}
