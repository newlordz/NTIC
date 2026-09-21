import { TestBed } from '@angular/core/testing';
import { SessionSyncService } from './session-sync.service';
import { CurrentUserService } from './current-user.service';
import { setAuthValue, clearAllAuthValues, getAuthValue } from './session.util';
import { of } from 'rxjs';

describe('SessionSyncService', () => {
  let service: SessionSyncService;
  let mockCurrentUserService: jasmine.SpyObj<CurrentUserService>;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();

    mockCurrentUserService = jasmine.createSpyObj('CurrentUserService', ['refresh', 'clear']);
    mockCurrentUserService.refresh.and.returnValue(of(null));

    TestBed.configureTestingModule({
      providers: [
        SessionSyncService,
        { provide: CurrentUserService, useValue: mockCurrentUserService }
      ]
    });

    service = TestBed.inject(SessionSyncService);
  });

  afterEach(() => {
    service.destroy();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should return true immediately when activeUserToken is already present in sessionStorage', async () => {
    setAuthValue('activeUserToken', 'test-token');
    const result = await service.requestSessionFromExistingTabs(50);
    expect(result).toBeTrue();
  });

  it('should timeout and return false when no other tabs respond', async () => {
    clearAllAuthValues();
    const result = await service.requestSessionFromExistingTabs(50);
    expect(result).toBeFalse();
    expect(getAuthValue('activeUserToken')).toBeNull();
  });

  it('should emit sessionRevoked$ when receiving SESSION_REVOKED message', (done) => {
    service.sessionRevoked$.subscribe(() => {
      done();
    });

    (service as any).handleMessage({ type: 'SESSION_REVOKED' });
  });

  it('should respond with SESSION_OFFER if session exists on incoming SESSION_REQUEST', () => {
    setAuthValue('activeUserToken', 'jwt-token-abc');
    setAuthValue('activeRoleId', 'admin');

    const channelSpy = jasmine.createSpyObj('BroadcastChannel', ['postMessage', 'close']);
    (service as any).channel = channelSpy;

    (service as any).handleMessage({ type: 'SESSION_REQUEST', requestId: 'req-123' });

    expect(channelSpy.postMessage).toHaveBeenCalledWith(jasmine.objectContaining({
      type: 'SESSION_OFFER',
      requestId: 'req-123',
      snapshot: jasmine.objectContaining({
        activeUserToken: 'jwt-token-abc',
        activeRoleId: 'admin'
      })
    }));
  });

  it('should restore session into sessionStorage when receiving matching SESSION_OFFER', () => {
    const resolveSpy = jasmine.createSpy('resolve');
    (service as any).pendingRequests.set('req-456', { resolve: resolveSpy, timer: 123 });

    (service as any).handleMessage({
      type: 'SESSION_OFFER',
      requestId: 'req-456',
      snapshot: {
        activeUserToken: 'remote-jwt',
        activeRoleId: 'super_admin',
        activeUserEmail: 'admin@ntic.test',
        activeUserTicket: 'NTIC-ADMIN',
        activeUserName: 'Admin User'
      }
    });

    expect(resolveSpy).toHaveBeenCalledWith(true);
    expect(getAuthValue('activeUserToken')).toBe('remote-jwt');
    expect(getAuthValue('activeRoleId')).toBe('super_admin');
    expect(localStorage.getItem('activeUserToken')).toBeNull();
    expect(mockCurrentUserService.refresh).toHaveBeenCalled();
  });
});
