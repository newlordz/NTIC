import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, timeout } from 'rxjs';
import { environment } from '../../environments/environment';

export interface BackendStudent {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  track: string;
  consent_granted: boolean;
  created_at: string;
}

export interface BackendSubmission {
  id: string;
  student_id: string;
  source_code_path: string;
  video_url: string;
  status: string;
  score?: number;
  feedback?: string;
  created_at: string;
}

export interface MyProfile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  ticket: string;
  status: string;
  phone: string | null;
  organization: string | null;
  must_change_password: boolean;
  password_changed_at: string | null;
  password_min_length: number;
  /** Judge/sponsor profile detail. Persisted server-side since the addition of
   *  PATCH /api/users/me -- previously these lived only in localStorage. */
  bio: string;
  expertise: string;
  sector: string;
  rep_name: string;
  experience_level: string;
  tier: string;
}

/**
 * One sponsor / judge / instructor on the personnel roster.
 *
 * Mirrors GET /api/admin/personnel. Every field is something the backend can
 * prove from its own tables. There is deliberately no `tier`, `sector`,
 * `expertise`, `payments` or `track` here -- those have no column in `users`
 * and only ever existed in browser localStorage.
 */
export interface PersonnelPerson {
  id: string;
  email: string;
  full_name: string;
  role: 'sponsor' | 'judge' | 'instructor';
  ticket: string;
  status: string;
  phone: string;
  organization: string;
  created_at: string | null;
  has_photo: boolean;
  has_document: boolean;
  must_change_password: boolean;
  experience_level: string;
  competition_id: string;
  /** A live, unexpired session exists. Means "active recently" because
   *  sessions now expire after the idle window. */
  is_online: boolean;
  active_sessions: number;
  /** From the audit log, so it survives signing out. Null = never logged in. */
  last_login_at: string | null;
  login_count: number;
  open_tickets: number;
  /** Instructor-only. Null for sponsors and judges -- render "n/a", not 0. */
  courses_authored: number | null;
  courses_pending: number | null;
  students_reached: number | null;
  /** Graders only (judge / instructor). Null for sponsors, who cannot grade. */
  submissions_graded: number | null;
  last_graded_at: string | null;
}

export interface PersonnelSummary {
  total: number;
  active: number;
  online: number;
  never_logged_in: number;
  needs_attention: number;
}

export interface PersonnelRoster {
  generated_at: string;  /** Minutes of inactivity before a session drops, i.e. what "online" means. */
  online_window_minutes: number;
  /** Instructor course counts are matched on the free-text `submitted_by`
   *  name because lms_courses has no FK to users. */
  courses_matched_by_name: boolean;
  people: PersonnelPerson[];
  summary: Record<'sponsor' | 'judge' | 'instructor', PersonnelSummary>;
}

/** One competition submission as seen from the judging workspace. */
export interface JudgeSubmission {
  id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  track: string;
  source_code_path: string;
  video_url: string;
  status: string;
  submitted_at: string | null;
  /** Present on history entries only. */
  score?: number | null;
  feedback?: string;
  graded_at?: string | null;
}

export interface JudgeQueue {
  pending_total: number;
  by_track: { track: string; pending: number }[];
  submissions: JudgeSubmission[];
}

export interface JudgeHistory {
  graded_total: number;
  average_score: number | null;
  graded: JudgeSubmission[];
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private apiUrl = environment.apiUrl || 'http://localhost:5000/api';

  constructor(private http: HttpClient) {}

  /** The signed-in user's own profile, including whether a password change is required. */
  getMyProfile(): Observable<MyProfile> {
    return this.http.get<MyProfile>(this.apiUrl + '/users/me');
  }

  /**
   * Save the signed-in user's own profile.
   *
   * Only the fields listed here can be changed. The server enforces the same
   * allow-list, so role, status, email and ticket cannot be altered through
   * this call even if they are added to the payload.
   */
  updateMyProfile(payload: {
    full_name?: string;
    phone?: string;
    organization?: string;
    bio?: string;
    expertise?: string;
    sector?: string;
    rep_name?: string;
    tier?: string;
    experience_level?: string;
  }): Observable<{ status: string; updated: string[] }> {
    return this.http.patch<{ status: string; updated: string[] }>(
      this.apiUrl + '/users/me',
      payload
    );
  }

  /**
   * Changes the signed-in user's own password.
   *
   * The server verifies the current password, applies the strength policy,
   * stores only a hash, and signs out the user's other devices. Pass an empty
   * `currentPassword` only when the server has flagged a forced rotation.
   */
  changeMyPassword(currentPassword: string, newPassword: string): Observable<{ status: string; other_sessions_revoked: number }> {
    return this.http.post<{ status: string; other_sessions_revoked: number }>(
      this.apiUrl + '/users/me/change-password',
      { current_password: currentPassword || '', new_password: newPassword }
    );
  }

  getStudents(): Observable<BackendStudent[]> {
    return this.http.get<BackendStudent[]>(this.apiUrl + '/students');
  }

  createStudent(payload: { first_name: string; last_name: string; email: string; track: string; consent_granted: boolean }): Observable<any> {
    return this.http.post(this.apiUrl + '/students', payload);
  }

  deleteStudent(id: string): Observable<any> {
    return this.http.delete(this.apiUrl + '/students/' + id);
  }

  getSubmissions(): Observable<BackendSubmission[]> {
    return this.http.get<BackendSubmission[]>(this.apiUrl + '/submissions');
  }

  createSubmission(payload: { student_id: string; source_code_path: string; video_url: string }): Observable<any> {
    return this.http.post(this.apiUrl + '/submissions', payload);
  }

  deleteSubmission(id: string): Observable<any> {
    return this.http.delete(this.apiUrl + '/submissions/' + id);
  }

  getEvents(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl + '/events');
  }

  createEvent(payload: { title: string; date: string; time: string; location: string; description: string; type?: string }): Observable<any> {
    return this.http.post(this.apiUrl + '/events', payload);
  }

  deleteEvent(id: string): Observable<any> {
    return this.http.delete(this.apiUrl + '/events/' + id);
  }

  getStories(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl + '/stories');
  }

  createStory(payload: { title: string; excerpt: string; date: string; image?: string }): Observable<any> {
    return this.http.post(this.apiUrl + '/stories', payload);
  }

  deleteStory(id: string): Observable<any> {
    return this.http.delete(this.apiUrl + '/stories/' + id);
  }

  getPhilosophy(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl + '/philosophy');
  }

  createPhilosophy(payload: { title: string; description?: string; image?: string }): Observable<any> {
    return this.http.post(this.apiUrl + '/philosophy', payload);
  }

  updatePhilosophy(id: string, payload: { title: string; description?: string; image?: string }): Observable<any> {
    return this.http.patch(this.apiUrl + '/philosophy/' + id, payload);
  }

  deletePhilosophy(id: string): Observable<any> {
    return this.http.delete(this.apiUrl + '/philosophy/' + id);
  }

  getHeroSlides(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl + '/hero-slides');
  }

  createHeroSlide(payload: any): Observable<any> {
    return this.http.post(this.apiUrl + '/hero-slides', payload);
  }

  deleteHeroSlide(id: string): Observable<any> {
    return this.http.delete(this.apiUrl + '/hero-slides/' + id);
  }

  getTalent(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl + '/talent');
  }

  createTalent(payload: any): Observable<any> {
    return this.http.post(this.apiUrl + '/talent', payload);
  }

  updateTalent(id: string, payload: any): Observable<any> {
    return this.http.patch(this.apiUrl + '/talent/' + id, payload);
  }

  deleteTalent(id: string): Observable<any> {
    return this.http.delete(this.apiUrl + '/talent/' + id);
  }

  getPlatformStats(): Observable<any> {
    return this.http.get<any>(this.apiUrl + '/platform-stats');
  }

  updatePlatformStats(payload: any): Observable<any> {
    return this.http.patch(this.apiUrl + '/platform-stats', payload);
  }

  getCsrUpdates(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl + '/csr');
  }

  createCsrUpdate(payload: any): Observable<any> {
    return this.http.post(this.apiUrl + '/csr', payload);
  }

  getLandingCopy(): Observable<Record<string, string>> {
    return this.http.get<Record<string, string>>(this.apiUrl + '/landing-copy');
  }

  saveLandingCopy(payload: Record<string, string>): Observable<any> {
    return this.http.put(this.apiUrl + '/landing-copy', payload);
  }

  deleteCsrUpdate(id: string): Observable<any> {
    return this.http.delete(this.apiUrl + '/csr/' + id);
  }

  getSchools(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl + '/schools');
  }

  createSchool(payload: { name: string; region: string; teams?: number; score?: number; rank?: number; status?: string }): Observable<any> {
    return this.http.post(this.apiUrl + '/schools', payload);
  }

  deleteSchool(id: string): Observable<any> {
    return this.http.delete(this.apiUrl + '/schools/' + id);
  }

  login(email: string, password: string): Observable<any> {
    return this.http.post(this.apiUrl + '/login', { email, password }).pipe(
      timeout(8000)
    );
  }

  logout(token: string): Observable<any> {
    return this.http.post(this.apiUrl + '/logout', { token });
  }

  // ─── Auth Session Management ─────────────────────────────────────────
  getAuthSessionsCount(): Observable<{ total: number; by_role: Record<string, number> }> {
    return this.http.get<{ total: number; by_role: Record<string, number> }>(this.apiUrl + '/auth/sessions/count');
  }

  getAuthSessions(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl + '/auth/sessions');
  }

  revokeAuthSession(token: string): Observable<any> {
    return this.http.post(this.apiUrl + '/auth/sessions/revoke', { token });
  }

  revokeAllSessions(): Observable<{ status: string; revoked: number }> {
    return this.http.post<{ status: string; revoked: number }>(this.apiUrl + '/auth/sessions/revoke-all', {});
  }

  expireUserSessions(userId: string): Observable<any> {
    return this.http.post(this.apiUrl + '/auth/sessions/expire-user/' + userId, {});
  }

  verifyContact(payload: { email?: string; phone?: string }): Observable<{ email_available: boolean; phone_available: boolean }> {
    return this.http.post<{ email_available: boolean; phone_available: boolean }>(this.apiUrl + '/auth/verify-contact', payload);
  }

  saveDraft(payload: { email: string; data: any }): Observable<any> {
    return this.http.post(this.apiUrl + '/drafts', payload);
  }

  /**
   * Loads a saved registration draft.
   *
   * A draft holds the full registration form (names, phones, GPS, guardian
   * contacts), so the server requires proof of ownership: either a staff session
   * or `resumeToken` — the id of an OTP challenge that was just verified for
   * this exact email address (returned by OtpService.verify).
   */
  loadDraft(email: string, resumeToken = ''): Observable<{ data: any }> {
    const query = resumeToken ? `?resume_token=${encodeURIComponent(resumeToken)}` : '';
    return this.http.get<{ data: any }>(this.apiUrl + '/drafts/' + encodeURIComponent(email) + query);
  }

  deleteDraft(email: string): Observable<any> {
    return this.http.delete(this.apiUrl + '/drafts/' + encodeURIComponent(email));
  }

  saveLmsProgress(payload: { student_id: string; course_title: string; progress_pct: number; completed_modules: number }): Observable<any> {
    return this.http.post(this.apiUrl + '/lms/progress', payload);
  }

  getLmsProgress(studentId: string): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl + '/lms/progress/' + encodeURIComponent(studentId));
  }

  generateAccessToken(role: string): Observable<{ ticket: string }> {
    return this.http.post<{ ticket: string }>(this.apiUrl + '/auth/token/generate', { role });
  }

  getCompetitions(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl + '/competitions');
  }

  createCompetition(payload: Record<string, any>): Observable<any> {
    return this.http.post(this.apiUrl + '/competitions', payload);
  }

  updateCompetition(id: string, payload: Record<string, any>): Observable<any> {
    return this.http.patch(this.apiUrl + '/competitions/' + id, payload);
  }

  deleteCompetition(id: string): Observable<any> {
    return this.http.delete(this.apiUrl + '/competitions/' + id);
  }

  getTeams(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl + '/teams');
  }

  createTeam(payload: { name: string; track?: string; lead?: string; members?: number; status?: string; school_name?: string }): Observable<any> {
    return this.http.post(this.apiUrl + '/teams', payload);
  }

  updateTeam(id: string, payload: { name: string; track?: string; lead?: string; members?: number; status?: string; school_name?: string }): Observable<any> {
    return this.http.patch(this.apiUrl + '/teams/' + id, payload);
  }

  deleteTeam(id: string): Observable<any> {
    return this.http.delete(this.apiUrl + '/teams/' + id);
  }

  gradeSubmission(id: string, payload: { score?: number; feedback?: string; status?: string }): Observable<any> {
    return this.http.patch(this.apiUrl + '/submissions/' + id + '/grade', payload);
  }

  updateStudent(id: string, payload: { first_name: string; last_name: string; email: string; track: string; consent_granted: boolean }): Observable<any> {
    return this.http.patch(this.apiUrl + '/students/' + id, payload);
  }

  updateEvent(id: string, payload: { title: string; date: string; time: string; location: string; description: string; type?: string }): Observable<any> {
    return this.http.patch(this.apiUrl + '/events/' + id, payload);
  }

  updateStory(id: string, payload: { title: string; excerpt: string; date: string; image?: string }): Observable<any> {
    return this.http.patch(this.apiUrl + '/stories/' + id, payload);
  }

  updateSchool(id: string, payload: { name: string; region: string; teams?: number; score?: number; rank?: number; status?: string }): Observable<any> {
    return this.http.patch(this.apiUrl + '/schools/' + id, payload);
  }

  getUsers(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl + '/users');
  }

  getUsersCount(): Observable<{ total: number }> {
    return this.http.get<{ total: number }>(this.apiUrl + '/users/count');
  }

  /**
   * Operational roster for sponsors, judges and instructors.
   *
   * Only returns facts the database can prove. Note `courses*` /
   * `studentsReached` are null for sponsors and judges (they have no course
   * workload) -- render them as "n/a", never as 0.
   */
  getPersonnel(): Observable<PersonnelRoster> {
    return this.http.get<PersonnelRoster>(this.apiUrl + '/admin/personnel');
  }

  /** Submissions still awaiting a score. Shared pool, oldest first. */
  getJudgeQueue(track = ''): Observable<JudgeQueue> {
    const q = track ? '?track=' + encodeURIComponent(track) : '';
    return this.http.get<JudgeQueue>(this.apiUrl + '/judge/queue' + q);
  }

  /** What the signed-in grader has scored. Private to that grader. */
  getJudgeHistory(limit = 50): Observable<JudgeHistory> {
    return this.http.get<JudgeHistory>(this.apiUrl + '/judge/history?limit=' + limit);
  }

  createUser(payload: { email: string; full_name?: string; role?: string; ticket?: string; password?: string; status?: string; phone?: string; organization?: string; age_group?: string; experience_level?: string; competition_id?: string; photo_file_id?: string; doc_file_id?: string }): Observable<any> {
    return this.http.post(this.apiUrl + '/users', payload);
  }

  registerPublicUser(payload: { email: string; full_name?: string; role?: string; ticket?: string; password?: string; status?: string; phone?: string; organization?: string; age_group?: string; experience_level?: string; competition_id?: string; photo_file_id?: string; doc_file_id?: string }): Observable<any> {
    return this.http.post(this.apiUrl + '/users/register', payload);
  }

  updateUser(id: string, payload: { email: string; full_name?: string; role?: string; ticket?: string; password?: string; status?: string; phone?: string }): Observable<any> {
    return this.http.patch(this.apiUrl + '/users/' + id, payload);
  }

   deleteUser(id: string): Observable<any> {
     return this.http.delete(this.apiUrl + '/users/' + id);
   }

   resetUserPassword(id: string): Observable<{ email: string; ticket: string; otp: string }> {
     return this.http.post<{ email: string; ticket: string; otp: string }>(this.apiUrl + '/users/' + id + '/reset-password', {});
   }

   // Pending Approvals (cross-machine sync)
   getApprovals(status?: string): Observable<any[]> {
     const qs = status ? `?status=${encodeURIComponent(status)}` : '';
     return this.http.get<any[]>(this.apiUrl + '/approvals' + qs);
   }

   createApproval(payload: any): Observable<any> {
     return this.http.post(this.apiUrl + '/approvals', payload);
   }

   updateApproval(id: string, payload: any): Observable<any> {
     return this.http.patch(this.apiUrl + '/approvals/' + id, payload);
   }

   deleteApproval(id: string): Observable<any> {
     return this.http.delete(this.apiUrl + '/approvals/' + id);
   }

  getHof(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl + '/hof');
  }

  createHof(payload: any): Observable<any> {
    return this.http.post(this.apiUrl + '/hof', payload);
  }

  deleteHof(id: string): Observable<any> {
    return this.http.delete(this.apiUrl + '/hof/' + id);
  }

  getNewsItems(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl + '/news');
  }

  createNewsItem(payload: { headline: string; tag?: string; date?: string; link?: string }): Observable<any> {
    return this.http.post(this.apiUrl + '/news', payload);
  }

  deleteNewsItem(id: string): Observable<any> {
    return this.http.delete(this.apiUrl + '/news/' + id);
  }

  getAuditLogs(params?: { limit?: number; category?: string; usr?: string; q?: string }): Observable<any[]> {
    let url = this.apiUrl + '/audit-logs';
    if (params) {
      const q = new URLSearchParams();
      if (params.limit) q.set('limit', String(params.limit));
      if (params.category && params.category !== 'all') q.set('category', params.category);
      if (params.usr && params.usr !== 'all') q.set('usr', params.usr);
      if (params.q && params.q.trim()) q.set('q', params.q.trim());
      const str = q.toString();
      if (str) url += '?' + str;
    }
    return this.http.get<any[]>(url);
  }

  createAuditLog(payload: { action: string; usr?: string; time?: string; type?: string; ip?: string; client?: string }): Observable<any> {
    return this.http.post(this.apiUrl + '/audit-logs', payload);
  }

  pruneAuditLogs(days: number = 90, preserveCritical: boolean = true): Observable<{ pruned_count: number; retained_days: number; preserved_critical: boolean }> {
    return this.http.delete<{ pruned_count: number; retained_days: number; preserved_critical: boolean }>(`${this.apiUrl}/audit-logs/prune?days=${days}&preserve_critical=${preserveCritical}`);
  }

  getLmsCourses(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl + '/lms-courses');
  }

  createLmsCourse(payload: any): Observable<any> {
    return this.http.post(this.apiUrl + '/lms-courses', payload);
  }

  getSystemNodesHealth(): Observable<any> {
    return this.http.get<any>(this.apiUrl + '/system/nodes-health');
  }

  getSystemTelemetry(): Observable<any> {
    return this.http.get<any>(this.apiUrl + '/system/telemetry');
  }

  bulkSync(collection: string, items: any[]): Observable<any> {
    return this.http.post(this.apiUrl + '/bulk-sync', { collection, items });
  }
}
