import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
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

  getSchools(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl + '/schools');
  }

  createSchool(payload: { name: string; region: string; teams?: number; score?: number; rank?: number; status?: string }): Observable<any> {
    return this.http.post(this.apiUrl + '/schools', payload);
  }

  deleteSchool(id: string): Observable<any> {
    return this.http.delete(this.apiUrl + '/schools/' + id);
  }
}
