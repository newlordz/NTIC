import {
  getAuthValue,
  setAuthValue,
  clearAuthValue,
  clearAllAuthValues,
  hasRememberedDevice,
  getRememberedCredentials,
  saveRememberedCredentials,
  forgetRememberedCredentials,
  purgeLegacyStoredPassword,
} from './session.util';

describe('SessionUtil', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  describe('getAuthValue', () => {
    it('should return null when no value is stored', () => {
      expect(getAuthValue('activeRoleId')).toBeNull();
    });

    it('should return value from sessionStorage', () => {
      sessionStorage.setItem('activeRoleId', 'student');
      expect(getAuthValue('activeRoleId')).toBe('student');
    });

    it('should fall back to localStorage when sessionStorage is empty', () => {
      localStorage.setItem('activeRoleId', 'instructor');
      expect(getAuthValue('activeRoleId')).toBe('instructor');
    });

    it('should prefer sessionStorage over localStorage', () => {
      sessionStorage.setItem('activeRoleId', 'judge');
      localStorage.setItem('activeRoleId', 'student');
      expect(getAuthValue('activeRoleId')).toBe('judge');
    });
  });

  describe('setAuthValue', () => {
    // Session values must never land in localStorage: a bearer token there
    // survives browser restarts and is readable by any XSS payload.
    it('should store the session in sessionStorage only', () => {
      setAuthValue('activeRoleId', 'admin');
      expect(sessionStorage.getItem('activeRoleId')).toBe('admin');
      expect(localStorage.getItem('activeRoleId')).toBeNull();
    });

    it('should clear a stale localStorage value before setting', () => {
      sessionStorage.setItem('activeRoleId', 'old-session');
      localStorage.setItem('activeRoleId', 'old-local');
      setAuthValue('activeRoleId', 'new-value');
      expect(localStorage.getItem('activeRoleId')).toBeNull();
      expect(sessionStorage.getItem('activeRoleId')).toBe('new-value');
    });
  });

  describe('clearAuthValue', () => {
    it('should remove value from both storages', () => {
      sessionStorage.setItem('activeUserEmail', 'a@b.com');
      localStorage.setItem('activeUserEmail', 'c@d.com');
      clearAuthValue('activeUserEmail');
      expect(sessionStorage.getItem('activeUserEmail')).toBeNull();
      expect(localStorage.getItem('activeUserEmail')).toBeNull();
    });
  });

  describe('clearAllAuthValues', () => {
    it('should clear all auth keys', () => {
      setAuthValue('activeRoleId', 'admin');
      setAuthValue('activeUserEmail', 'x@y.com');
      setAuthValue('activeUserTicket', 'TICK-001');
      setAuthValue('activeUserToken', 'token123');
      clearAllAuthValues();
      expect(getAuthValue('activeRoleId')).toBeNull();
      expect(getAuthValue('activeUserEmail')).toBeNull();
      expect(getAuthValue('activeUserTicket')).toBeNull();
      expect(getAuthValue('activeUserToken')).toBeNull();
    });

    it('should also purge a legacy stored password', () => {
      localStorage.setItem('ntic_remembered_password', 'YWJjMTIz');
      clearAllAuthValues();
      expect(localStorage.getItem('ntic_remembered_password')).toBeNull();
    });
  });

  describe('hasRememberedDevice', () => {
    it('should return true when the remember-device flag is set', () => {
      localStorage.setItem('ntic_remember_device', 'true');
      expect(hasRememberedDevice()).toBeTrue();
    });

    it('should return false when the flag is absent', () => {
      sessionStorage.setItem('activeRoleId', 'student');
      expect(hasRememberedDevice()).toBeFalse();
    });
  });

  describe('remembered credentials', () => {
    it('should remember the username but never the password', () => {
      saveRememberedCredentials('kofi@example.com', 'sup3r-secret', true);
      expect(localStorage.getItem('ntic_remembered_username')).toBe('kofi@example.com');
      expect(localStorage.getItem('ntic_remembered_password')).toBeNull();
      // The password must not appear anywhere in localStorage, encoded or not.
      const dump = JSON.stringify(localStorage);
      expect(dump).not.toContain('sup3r-secret');
      expect(dump).not.toContain(btoa('sup3r-secret'));
    });

    it('should always return an empty password', () => {
      saveRememberedCredentials('kofi@example.com', 'sup3r-secret', true);
      const creds = getRememberedCredentials();
      expect(creds.username).toBe('kofi@example.com');
      expect(creds.password).toBe('');
      expect(creds.remembered).toBeTrue();
    });

    it('should forget everything when remember is false', () => {
      saveRememberedCredentials('kofi@example.com', 'sup3r-secret', true);
      saveRememberedCredentials('kofi@example.com', 'sup3r-secret', false);
      expect(localStorage.getItem('ntic_remember_device')).toBeNull();
      expect(localStorage.getItem('ntic_remembered_username')).toBeNull();
      expect(getRememberedCredentials().remembered).toBeFalse();
    });

    it('forgetRememberedCredentials should clear all three keys', () => {
      localStorage.setItem('ntic_remember_device', 'true');
      localStorage.setItem('ntic_remembered_username', 'a@b.com');
      localStorage.setItem('ntic_remembered_password', 'legacy');
      forgetRememberedCredentials();
      expect(localStorage.getItem('ntic_remember_device')).toBeNull();
      expect(localStorage.getItem('ntic_remembered_username')).toBeNull();
      expect(localStorage.getItem('ntic_remembered_password')).toBeNull();
    });

    it('should migrate existing users by purging a previously stored password', () => {
      localStorage.setItem('ntic_remembered_password', btoa('old-password'));
      purgeLegacyStoredPassword();
      expect(localStorage.getItem('ntic_remembered_password')).toBeNull();
    });

    it('reading credentials should purge a legacy password as a side effect', () => {
      localStorage.setItem('ntic_remember_device', 'true');
      localStorage.setItem('ntic_remembered_username', 'a@b.com');
      localStorage.setItem('ntic_remembered_password', btoa('old-password'));
      getRememberedCredentials();
      expect(localStorage.getItem('ntic_remembered_password')).toBeNull();
    });
  });
});
