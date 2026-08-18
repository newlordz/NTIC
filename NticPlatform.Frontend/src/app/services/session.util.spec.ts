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
  purgeLegacyAuthStorage,
  purgeCardDataFromDrafts,
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

    // A bearer token in localStorage survives a browser restart, which would
    // defeat both the close-the-tab sign-out and the inactivity timeout. There
    // is deliberately no fallback, so a value stranded there by an old build
    // must be ignored rather than honoured.
    it('should NOT fall back to localStorage', () => {
      localStorage.setItem('activeRoleId', 'instructor');
      expect(getAuthValue('activeRoleId')).toBeNull();
    });

    it('should ignore localStorage even when sessionStorage has a value', () => {
      sessionStorage.setItem('activeRoleId', 'judge');
      localStorage.setItem('activeRoleId', 'student');
      expect(getAuthValue('activeRoleId')).toBe('judge');
    });
  });

  describe('purgeLegacyAuthStorage', () => {
    // Ignoring the stale value is not enough on its own: a real token would sit
    // in localStorage indefinitely. It must actually be deleted.
    it('should delete session keys stranded in localStorage', () => {
      localStorage.setItem('activeUserToken', 'legacy-token');
      localStorage.setItem('activeRoleId', 'super_admin');
      localStorage.setItem('activeUserEmail', 'old@ntic.test');
      purgeLegacyAuthStorage();
      expect(localStorage.getItem('activeUserToken')).toBeNull();
      expect(localStorage.getItem('activeRoleId')).toBeNull();
      expect(localStorage.getItem('activeUserEmail')).toBeNull();
    });

    it('should leave the current sessionStorage session untouched', () => {
      setAuthValue('activeUserToken', 'live-token');
      purgeLegacyAuthStorage();
      expect(getAuthValue('activeUserToken')).toBe('live-token');
    });

    it('should not disturb the remembered username', () => {
      localStorage.setItem('ntic_remember_device', 'true');
      localStorage.setItem('ntic_remembered_username', 'kofi@example.com');
      purgeLegacyAuthStorage();
      expect(localStorage.getItem('ntic_remembered_username')).toBe('kofi@example.com');
      expect(hasRememberedDevice()).toBeTrue();
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

  describe('purgeCardDataFromDrafts', () => {
    // The profile-completion form spread the whole profileForm into
    // localStorage['ntic_drafts'], so real users have a card number and CVV on
    // disk in cleartext. Removing the form fields stops new writes but cannot
    // clean what is already there.
    const writeDraft = (data: any) => {
      localStorage.setItem('ntic_drafts', JSON.stringify({
        'sponsor@example.com': { tab: 'sponsor', data, savedAt: '2026-01-01T00:00:00Z' },
      }));
    };
    const readDraft = () =>
      JSON.parse(localStorage.getItem('ntic_drafts') || '{}')['sponsor@example.com']?.data;

    it('removes the card number and CVV from an existing draft', () => {
      writeDraft({
        fullName: 'Ama Boateng',
        cardNumber: '4532111122223333',
        cardCvv: '123',
        cardExpiry: '11/28',
        cardName: 'Ama Boateng',
      });
      purgeCardDataFromDrafts();
      const data = readDraft();
      expect(data.cardNumber).toBeUndefined();
      expect(data.cardCvv).toBeUndefined();
      expect(data.cardExpiry).toBeUndefined();
      expect(data.cardName).toBeUndefined();
    });

    it('leaves the rest of the draft intact so onboarding work is not lost', () => {
      writeDraft({ fullName: 'Ama Boateng', sector: 'Technology', cardCvv: '999' });
      purgeCardDataFromDrafts();
      const data = readDraft();
      expect(data.fullName).toBe('Ama Boateng');
      expect(data.sector).toBe('Technology');
      expect(data.cardCvv).toBeUndefined();
    });

    it('does not leave the card number anywhere in localStorage', () => {
      writeDraft({ cardNumber: '4532111122223333', cardCvv: '123' });
      purgeCardDataFromDrafts();
      const dump = JSON.stringify(localStorage);
      expect(dump).not.toContain('4532111122223333');
      expect(dump).not.toContain('cardCvv');
    });

    it('is a no-op when there is no draft', () => {
      purgeCardDataFromDrafts();
      expect(localStorage.getItem('ntic_drafts')).toBeNull();
    });

    it('discards an unparseable drafts blob rather than trusting it', () => {
      localStorage.setItem('ntic_drafts', 'not-json{{{');
      purgeCardDataFromDrafts();
      expect(localStorage.getItem('ntic_drafts')).toBeNull();
    });

    it('is safe to run repeatedly', () => {
      writeDraft({ fullName: 'Ama Boateng', cardCvv: '123' });
      purgeCardDataFromDrafts();
      purgeCardDataFromDrafts();
      expect(readDraft().fullName).toBe('Ama Boateng');
      expect(readDraft().cardCvv).toBeUndefined();
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
