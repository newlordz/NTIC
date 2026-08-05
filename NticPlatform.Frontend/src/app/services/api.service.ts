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

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private apiUrl = environment.apiUrl || 'http://localhost:5000/api';

  constructor(private http: HttpClient) {}

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

  generateAccessToken(role: string): Observable<{ ticket: string }> {
    return this.http.post<{ ticket: string }>(this.apiUrl + '/auth/token/generate', { role });
  }

  getCompetitions(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl + '/competitions');
  }

  createCompetition(payload: { title: string; description?: string; track?: string; category?: string; deadline?: string; status?: string }): Observable<any> {
    return this.http.post(this.apiUrl + '/competitions', payload);
  }

  updateCompetition(id: string, payload: { title: string; description?: string; track?: string; category?: string; deadline?: string; status?: string }): Observable<any> {
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

  createUser(payload: { email: string; full_name?: string; role?: string; ticket?: string; password?: string; status?: string; phone?: string }): Observable<any> {
    return this.http.post(this.apiUrl + '/users', payload);
  }

  registerPublicUser(payload: { email: string; full_name?: string; role?: string; ticket?: string; password?: string; status?: string; phone?: string }): Observable<any> {
    return this.http.post(this.apiUrl + '/users/register', payload);
  }

  updateUser(id: string, payload: { email: string; full_name?: string; role?: string; ticket?: string; password?: string; status?: string; phone?: string }): Observable<any> {
    return this.http.patch(this.apiUrl + '/users/' + id, payload);
  }

   deleteUser(id: string): Observable<any> {
     return this.http.delete(this.apiUrl + '/users/' + id);
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

  getAuditLogs(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl + '/audit-logs');
  }

  createAuditLog(payload: { action: string; usr?: string; time?: string; type?: string }): Observable<any> {
    return this.http.post(this.apiUrl + '/audit-logs', payload);
  }

  getLmsCourses(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl + '/lms-courses');
  }

  createLmsCourse(payload: any): Observable<any> {
    return this.http.post(this.apiUrl + '/lms-courses', payload);
  }

  bulkSync(collection: string, items: any[]): Observable<any> {
    return this.http.post(this.apiUrl + '/bulk-sync', { collection, items });
  }
}
