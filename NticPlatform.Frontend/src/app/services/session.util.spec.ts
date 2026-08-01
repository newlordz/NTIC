import { getAuthValue, setAuthValue, clearAuthValue, clearAllAuthValues, hasRememberedDevice } from './session.util';

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
    it('should store in localStorage when rememberDevice is true', () => {
      setAuthValue('activeRoleId', 'admin', true);
      expect(localStorage.getItem('activeRoleId')).toBe('admin');
      expect(sessionStorage.getItem('activeRoleId')).toBeNull();
    });

    it('should store in sessionStorage when rememberDevice is false', () => {
      setAuthValue('activeRoleId', 'sponsor', false);
      expect(sessionStorage.getItem('activeRoleId')).toBe('sponsor');
      expect(localStorage.getItem('activeRoleId')).toBeNull();
    });

    it('should clear both storages before setting', () => {
      sessionStorage.setItem('activeRoleId', 'old-session');
      localStorage.setItem('activeRoleId', 'old-local');
      setAuthValue('activeRoleId', 'new-value', true);
      expect(sessionStorage.getItem('activeRoleId')).toBeNull();
      expect(localStorage.getItem('activeRoleId')).toBe('new-value');
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
      setAuthValue('activeRoleId', 'admin', true);
      setAuthValue('activeUserEmail', 'x@y.com', true);
      setAuthValue('activeUserTicket', 'TICK-001', true);
      setAuthValue('activeUserToken', 'token123', true);
      clearAllAuthValues();
      expect(getAuthValue('activeRoleId')).toBeNull();
      expect(getAuthValue('activeUserEmail')).toBeNull();
      expect(getAuthValue('activeUserTicket')).toBeNull();
      expect(getAuthValue('activeUserToken')).toBeNull();
    });
  });

  describe('hasRememberedDevice', () => {
    it('should return true when activeRoleId is in localStorage', () => {
      localStorage.setItem('activeRoleId', 'student');
      expect(hasRememberedDevice()).toBeTrue();
    });

    it('should return false when no activeRoleId in localStorage', () => {
      sessionStorage.setItem('activeRoleId', 'student');
      expect(hasRememberedDevice()).toBeFalse();
    });
  });
});
