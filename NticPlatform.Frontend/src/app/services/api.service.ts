import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { HANDLES_OWN_WRITE_ERRORS } from '../interceptors/http-resilience.interceptor';
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
  /** Competition/learning track. Read by the student LMS profile and the judge
   *  dashboard filter, both of which previously saw `undefined`. */
  track: string;
  /** The caller's `students` row id, provisioned on first read. Equal to `id`.
   *  Null for every non-student role. This is the id to send with submissions,
   *  enrolments and progress -- the client used to invent a random one per
   *  render, which is why none of that data could be read back. */
  student_id: string | null;
}

/** Result of enrolling on a course. */
export interface StudentEnrolment {
  id: string;
  course_id: string;
  course_title: string;
  status: string;
  enrolled_total: number;
}

/** One course the signed-in student is enrolled on. */
export interface MyEnrolledCourse {
  course_id: string;
  title: string;
  track: string;
  icon: string;
  level: string;
  description: string;
  modules: number;
  progress_pct: number;
  completed_modules: number;
  enrolled_at: string;
  last_active: string;
  status: string;
  assignment_count: number;
}

/** An assignment a student may submit against. */
export interface LmsAssignment {
  id: string;
  course_id: string;
  course_title: string;
  title: string;
  description: string;
  due_date: string;
  max_score: number;
  track: string;
  status: string;
}

/** A student's own submission, with the grade once one exists. */
export interface MySubmission {
  id: string;
  assignment_id: string;
  assignment_title: string;
  course_id: string;
  course_title: string;
  submitted_at: string;
  content: string;
  url: string;
  /** Null until an instructor grades it. */
  score: number | null;
  status: string;
  feedback: string;
  max_score: number;
  due_date: string;
}

export interface MyProgressRow {
  course_title: string;
  progress_pct: number;
  completed_modules: number;
  last_accessed: string;
}

/** A competition cycle the signed-in student has registered for. */
export interface MyCompetitionRegistration {
  competition_id: string;
  competition_title: string;
  competition_status: string;
  track: string;
  status: string;
  registered_at: string | null;
}

/** A course the caller authored, with live counts. */
export interface AuthoredCourse {
  id: string;
  title: string;
  track: string;
  icon: string;
  level: string;
  description: string;
  modules: number;
  status: string;
  /** 'pending' until another reviewer approves it. Authors cannot self-approve. */
  approval_status: string;
  rejection_reason: string;
  created_at: string;
  enrolled_count: number;
  assignment_count: number;
  awaiting_grading: number;
  average_progress: number;
  /** The cycle this course prepares for, or null for evergreen material. */
  competitionId?: string | null;
}

/** One enrolled student on a course the caller owns. */
export interface CourseStudent {
  student_id: string;
  student_name: string;
  student_email: string;
  progress_pct: number;
  enrolled_at: string;
  last_active: string;
  status: string;
  submissions: number;
  graded: number;
  average_score: number | null;
}

export interface LmsModule {
  id: string;
  course_id: string;
  title: string;
  description: string;
  order_num: number;
  icon: string;
  status: string;
}

export interface LmsMaterial {
  id: string;
  course_id: string;
  module_id: string;
  title: string;
  type: string;
  url: string;
  description: string;
}

/** A student submission awaiting a mark. */
export interface GradingQueueItem {
  id: string;
  assignment_id: string;
  assignment_title: string;
  course_id: string;
  course_title: string;
  student_id: string;
  student_name: string;
  student_email: string;
  submitted_at: string;
  content: string;
  url: string;
  score: number | null;
  status: string;
  feedback: string;
  max_score: number;
}

export interface ModerationQueueItem {
  id: string;
  title: string;
  track: string;
  level: string;
  description: string;
  modules: number;
  submitted_by: string;
  created_at: string;
}

/**
 * A sponsor's commitment.
 *
 * All money fields are STRINGS. The columns are NUMERIC(14,2) and parsing them into
 * a JS number would reintroduce exactly the binary-float rounding the column type
 * exists to prevent. Format for display; never accumulate as floats.
 */
export interface Sponsorship {
  id: string;
  sponsor_id: string;
  organization: string;
  tier: string;
  sector: string;
  amount_pledged: string;
  currency: string;
  competition_id: string;
  /** 'pending' until an admin confirms it. Sponsors cannot self-activate. */
  status: string;
  notes: string;
  created_at: string | null;
  /** Verified money only. A pending reference is a claim, not a receipt. */
  amount_received: string;
  amount_pending: string;
  payment_count: number;
}

export interface SponsorPayment {
  id: string;
  sponsorship_id: string;
  sponsor_id: string;
  amount: string;
  currency: string;
  method: string;
  reference: string;
  notes: string;
  /** 'pending_verification' | 'verified' | 'rejected' */
  status: string;
  verified_by_name: string;
  verified_at: string | null;
  rejection_reason: string;
  created_at: string | null;
  organization: string;
  sponsor_email: string;
}

/**
 * One confirmed partner on the public wall.
 *
 * Deliberately carries no money or contact data: this comes from a PUBLIC endpoint,
 * and the wall only needs a name, a tier and a sector.
 */
export interface PublicPartner {
  organization: string;
  tier: string;
  sector: string;
  since: string | null;
}

/** Real ecosystem aggregates, replacing the hardcoded infographic. */
export interface SponsorshipSummary {
  partner_count: number;
  total_committed: string;
  total_received: string;
  awaiting_verification: string;
  awaiting_verification_count: number;
  pending_pledges: number;
  /** Genuinely computed, unlike the previous hardcoded 72%. */
  received_pct: number;
  tiers: Array<{ tier: string; sponsor_count: number; amount: string; pct: number }>;
  sectors: Array<{ sector: string; sponsor_count: number; amount: string }>;
}

/**
 * One managed person on the personnel roster.
 *
 * Every field is something the backend can prove from its own tables. `tier`,
 * `sector`, `expertise` and `track` used to be excluded here because they had no
 * column and existed only in browser localStorage -- they are real `users` columns
 * now, so they are reported. Still absent, because nothing stores them: a
 * sponsor `package` / `total`, an embedded `payments` array, an instructor
 * `portfolio`, and `region`.
 *
 * Role-specific figures are NULL rather than 0 for roles they do not apply to, so
 * the UI can hide a column instead of showing a false measurement.
 */
export interface PersonnelPerson {
  id: string;
  email: string;
  full_name: string;
  role: 'student' | 'sponsor' | 'judge' | 'instructor';
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
  /** Real columns as of the profile-persistence work. */
  track: string;
  tier: string;
  sector: string;
  expertise: string;
  /** A live, unexpired session exists. Means "active recently" because
   *  sessions expire after the idle window. */
  is_online: boolean;
  active_sessions: number;
  /** From the audit log, so it survives signing out. Null = never logged in. */
  last_login_at: string | null;
  login_count: number;
  open_tickets: number;
  /** Instructor-only. Null for other roles -- render "n/a", not 0. */
  courses_authored: number | null;
  courses_pending: number | null;
  courses_rejected: number | null;
  students_reached: number | null;
  awaiting_grading: number | null;
  /** Graders only (judge / instructor). Null for sponsors and students. */
  submissions_graded: number | null;
  last_graded_at: string | null;
  /** Student-only learning activity. */
  courses_enrolled: number | null;
  average_progress: number | null;
  work_submitted: number | null;
  work_graded: number | null;
  average_score: number | null;
  competitions_registered: number | null;
  /** Sponsor-only money. Strings: the columns are NUMERIC and parsing to a JS
   *  number would reintroduce float rounding. Received = VERIFIED only. */
  pledge_count: number | null;
  active_pledges: number | null;
  amount_pledged: string | null;
  amount_received: string | null;
  amount_awaiting: string | null;
  payments_awaiting_count: number | null;
}

/** Full record for the personnel detail drawer. */
export interface PersonnelDetail {
  id: string;
  email: string;
  full_name: string;
  role: string;
  ticket: string;
  status: string;
  phone: string;
  organization: string;
  created_at: string | null;
  bio: string;
  expertise: string;
  sector: string;
  rep_name: string;
  tier: string;
  experience_level: string;
  track: string;
  courses: Array<{ id: string; title: string; approval_status: string; enrolled: number; awaiting_grading: number }>;
  enrolments: Array<{ course_title: string; progress_pct: number; status: string; enrolled_at: string }>;
  submissions: Array<{ assignment_title: string; score: number | null; status: string; submitted_at: string; max_score: number }>;
  pledges: Array<{ id: string; tier: string; amount_pledged: string; status: string; created_at: string | null }>;
  payments: Array<{ id: string; amount: string; method: string; reference: string; status: string; created_at: string | null; verified_by_name: string; rejection_reason: string }>;
  recent_grading: Array<{ submission_id: string; score: number; graded_at: string | null }>;
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
  /** Now false: instructor course counts key on `lms_courses.owner_id`, a real id
   *  link. The old free-text `submitted_by` name match silently failed for every
   *  course created in the LMS Manager, which hardcoded it to the literal 'Admin'. */
  courses_matched_by_name: boolean;
  people: PersonnelPerson[];
  summary: Record<'student' | 'sponsor' | 'judge' | 'instructor', PersonnelSummary>;
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
  /** Whether `source_code_path` can actually be opened. There is no file-serving
   *  endpoint, so a bare filename is unreachable -- the judge UI rendered it as
   *  inert text, which reads as a broken link. */
  source_is_url: boolean;
  max_score: number;
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
    track?: string;
  }): Observable<{ status: string; updated: string[] }> {
    return this.http.patch<{ status: string; updated: string[] }>(
      this.apiUrl + '/users/me',
      payload
    );
  }

  /**
   * Files the caller's own completed profile for admin review.
   *
   * Replaces pushing a row through `saveApprovals()` -> POST /api/bulk-sync,
   * which is admin-only and so silently 403'd for every judge and sponsor who
   * finished onboarding -- their application never reached the review queue.
   * The server builds the record from the verified session, so neither the
   * applicant nor their role can be forged.
   */
  submitMyOnboarding(notes: string = ''): Observable<{ id: string; type: string; status: string }> {
    return this.http.post<{ id: string; type: string; status: string }>(
      this.apiUrl + '/approvals/mine',
      { notes }
    );
  }

  // ── Student self-service LMS ──────────────────────────────────────────
  // Every call below replaces something that previously could not work: enrolment
  // had no endpoint at all, submissions went to an endpoint whose foreign key they
  // could never satisfy, and grades had no read path.

  /** Enrol the signed-in student on a course. Idempotent. */
  enrolOnCourse(courseId: string): Observable<StudentEnrolment> {
    return this.http.post<StudentEnrolment>(
      this.apiUrl + '/lms/enrollments', { course_id: courseId }
    );
  }

  /** Withdraw the signed-in student from a course. */
  withdrawFromCourse(courseId: string): Observable<{ status: string; course_id: string }> {
    return this.http.delete<{ status: string; course_id: string }>(
      `${this.apiUrl}/lms/enrollments/${encodeURIComponent(courseId)}`
    );
  }

  /** The student's own courses. Replaces listing every course on the platform. */
  getMyEnrolments(): Observable<MyEnrolledCourse[]> {
    return this.http.get<MyEnrolledCourse[]>(this.apiUrl + '/lms/my-enrollments');
  }

  /** Assignments, optionally scoped to one course. */
  getLmsAssignments(courseId: string = ''): Observable<LmsAssignment[]> {
    const q = courseId ? `?course_id=${encodeURIComponent(courseId)}` : '';
    return this.http.get<LmsAssignment[]>(this.apiUrl + '/lms/assignments' + q);
  }

  /** Submit work. Resubmitting replaces the attempt and clears any grade. */
  submitAssignmentWork(assignmentId: string, content: string, url: string = ''): Observable<any> {
    return this.http.post(this.apiUrl + '/lms/submissions', {
      assignment_id: assignmentId, content, url,
    });
  }

  /** The student's own submissions, including score and feedback. */
  getMySubmissions(): Observable<MySubmission[]> {
    return this.http.get<MySubmission[]>(this.apiUrl + '/lms/my-submissions');
  }

  /** Save progress. student_id is taken from the session, never sent. */
  saveMyProgress(courseTitle: string, progressPct: number, completedModules: number): Observable<any> {
    return this.http.post(this.apiUrl + '/lms/progress', {
      course_title: courseTitle, progress_pct: progressPct, completed_modules: completedModules,
    });
  }

  /** Read progress back -- the path that previously did not exist. */
  getMyProgress(): Observable<MyProgressRow[]> {
    return this.http.get<MyProgressRow[]>(this.apiUrl + '/lms/my-progress');
  }

  // ── Competition registration ──────────────────────────────────────────
  // registerStudentForCycle() used to be `studentRegisteredMap[id] = true` with no
  // HTTP call and no table, so a student's sign-up vanished on refresh and no
  // organiser ever saw it.

  registerForCompetition(competitionId: string): Observable<any> {
    return this.http.post(this.apiUrl + '/competitions/register', {
      competition_id: competitionId,
    });
  }

  withdrawFromCompetition(competitionId: string): Observable<any> {
    return this.http.delete(
      `${this.apiUrl}/competitions/register/${encodeURIComponent(competitionId)}`
    );
  }

  getMyCompetitionRegistrations(): Observable<MyCompetitionRegistration[]> {
    return this.http.get<MyCompetitionRegistration[]>(
      this.apiUrl + '/competitions/my-registrations'
    );
  }

  // ── Instructor authoring / grading ────────────────────────────────────
  // Every one of these replaces a write that went through POST /api/bulk-sync
  // (admin-only), so for an instructor it 403'd and the error was discarded --
  // courses, modules, materials, assignments and grades existed only in that one
  // browser's localStorage while the UI reported success.

  /** Courses the caller authored, with live roster and grading counts. */
  getMyAuthoredCourses(competitionId?: string): Observable<AuthoredCourse[]> {
    const qs = competitionId ? `?competition_id=${encodeURIComponent(competitionId)}` : '';
    return this.http.get<AuthoredCourse[]>(this.apiUrl + '/lms/my-courses' + qs);
  }

  createAuthoredCourse(payload: {
    title: string; track?: string; icon?: string; level?: string;
    description?: string; modules?: number; competition_id?: string;
  }): Observable<{ id: string; title: string; approval_status: string; competitionId?: string | null }> {
    return this.http.post<{ id: string; title: string; approval_status: string; competitionId?: string | null }>(
      this.apiUrl + '/lms/courses', payload
    );
  }

  updateAuthoredCourse(courseId: string, payload: {
    title: string; track?: string; icon?: string; level?: string;
    description?: string; modules?: number; competition_id?: string;
  }): Observable<any> {
    return this.http.patch(`${this.apiUrl}/lms/courses/${encodeURIComponent(courseId)}`, payload);
  }

  deleteAuthoredCourse(courseId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/lms/courses/${encodeURIComponent(courseId)}`);
  }

  /** The enrolled roster for a course. The "Students" tab was always empty. */
  getCourseStudents(courseId: string): Observable<CourseStudent[]> {
    return this.http.get<CourseStudent[]>(
      `${this.apiUrl}/lms/courses/${encodeURIComponent(courseId)}/students`
    );
  }

  createModule(payload: {
    course_id: string; title: string; description?: string;
    order_num?: number; icon?: string;
  }): Observable<any> {
    return this.http.post(this.apiUrl + '/lms/modules', payload);
  }

  getModules(courseId: string = ''): Observable<LmsModule[]> {
    const q = courseId ? `?course_id=${encodeURIComponent(courseId)}` : '';
    return this.http.get<LmsModule[]>(this.apiUrl + '/lms/modules' + q);
  }

  deleteModule(moduleId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/lms/modules/${encodeURIComponent(moduleId)}`);
  }

  createMaterial(payload: {
    course_id: string; module_id?: string; title: string;
    type?: string; url?: string; description?: string;
  }): Observable<any> {
    return this.http.post(this.apiUrl + '/lms/materials', payload);
  }

  getMaterials(courseId: string = ''): Observable<LmsMaterial[]> {
    const q = courseId ? `?course_id=${encodeURIComponent(courseId)}` : '';
    return this.http.get<LmsMaterial[]>(this.apiUrl + '/lms/materials' + q);
  }

  deleteMaterial(materialId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/lms/materials/${encodeURIComponent(materialId)}`);
  }

  createAssignment(payload: {
    course_id: string; title: string; description?: string;
    due_date?: string; max_score?: number; track?: string;
  }): Observable<any> {
    return this.http.post(this.apiUrl + '/lms/assignments', payload);
  }

  deleteAssignment(assignmentId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/lms/assignments/${encodeURIComponent(assignmentId)}`);
  }

  /** Student work awaiting a mark on the caller's own courses. */
  getGradingQueue(courseId: string = ''): Observable<GradingQueueItem[]> {
    const q = courseId ? `?course_id=${encodeURIComponent(courseId)}` : '';
    return this.http.get<GradingQueueItem[]>(this.apiUrl + '/lms/grading-queue' + q);
  }

  /** Mark a student's work. This is what finally makes a grade visible to them. */
  gradeLmsSubmission(submissionId: string, score: number, feedback: string = ''): Observable<any> {
    return this.http.patch(
      `${this.apiUrl}/lms/submissions/${encodeURIComponent(submissionId)}/grade`,
      { score, feedback }
    );
  }

  /** Courses awaiting review, excluding the reviewer's own submissions. */
  getModerationQueue(): Observable<ModerationQueueItem[]> {
    return this.http.get<ModerationQueueItem[]>(this.apiUrl + '/lms/moderation-queue');
  }

  /**
   * Sends a submission back for revision instead of grading it.
   *
   * Replaces requestSubmissionRevision()/rejectLmsSubmission(), which mutated a
   * local object and pushed it through admin-only bulk-sync -- the student was
   * never told anything.
   */
  returnLmsSubmission(submissionId: string, feedback: string): Observable<any> {
    return this.http.patch(
      `${this.apiUrl}/lms/submissions/${encodeURIComponent(submissionId)}/return`,
      { feedback }
    );
  }

  /** Approve or reject submitted content. The server refuses self-review. */
  moderateCourse(courseId: string, approve: boolean, reason: string = ''): Observable<any> {
    return this.http.patch(
      `${this.apiUrl}/lms/courses/${encodeURIComponent(courseId)}/moderate`,
      { approve, reason }
    );
  }

  // ── Sponsorships & payments ───────────────────────────────────────────
  // Replaces a hardcoded infographic and payments that never persisted. Amounts
  // are strings end to end: the column is NUMERIC and parsing to a JS number would
  // reintroduce the float rounding the column exists to avoid.

  /** Record the signed-in sponsor's commitment. Starts 'pending'. */
  createMySponsorship(payload: {
    tier?: string; sector?: string; amount_pledged: string;
    competition_id?: string; notes?: string;
  }): Observable<{ id: string; status: string; amount_pledged: string }> {
    return this.http.post<{ id: string; status: string; amount_pledged: string }>(
      this.apiUrl + '/sponsorships', payload
    );
  }

  /** The sponsor's own commitments, with real received/pending totals. */
  getMySponsorships(): Observable<Sponsorship[]> {
    return this.http.get<Sponsorship[]>(this.apiUrl + '/sponsorships/mine');
  }

  /** Every commitment. Admin only. */
  getAllSponsorships(): Observable<Sponsorship[]> {
    return this.http.get<Sponsorship[]>(this.apiUrl + '/sponsorships');
  }

  setSponsorshipStatus(sponsorshipId: string, status: string): Observable<any> {
    return this.http.patch(
      `${this.apiUrl}/sponsorships/${encodeURIComponent(sponsorshipId)}/status`,
      { status }
    );
  }

  /**
   * Records a payment the sponsor says they have made.
   *
   * Lands as 'pending_verification' -- nothing in this application contacts a bank,
   * MoMo API or card processor, so it is a claim for an administrator to check. The
   * old UI wrote 'Confirmed' on submit.
   */
  recordSponsorPayment(sponsorshipId: string, payload: {
    amount: string; method?: string; reference: string; notes?: string;
  }): Observable<{ id: string; status: string; amount: string }> {
    return this.http.post<{ id: string; status: string; amount: string }>(
      `${this.apiUrl}/sponsorships/${encodeURIComponent(sponsorshipId)}/payments`,
      payload
    );
  }

  getMySponsorPayments(): Observable<SponsorPayment[]> {
    return this.http.get<SponsorPayment[]>(this.apiUrl + '/sponsorships/payments/mine');
  }

  /** The admin verification queue. */
  getPendingSponsorPayments(): Observable<SponsorPayment[]> {
    return this.http.get<SponsorPayment[]>(this.apiUrl + '/sponsorships/payments/pending');
  }

  verifySponsorPayment(paymentId: string, verified: boolean, reason: string = ''): Observable<any> {
    return this.http.patch(
      `${this.apiUrl}/sponsorships/payments/${encodeURIComponent(paymentId)}/verify`,
      { verified, reason }
    );
  }

  /** Real aggregates for the sponsorship ecosystem panel. */
  getSponsorshipSummary(): Observable<SponsorshipSummary> {
    return this.http.get<SponsorshipSummary>(this.apiUrl + '/sponsorships/summary');
  }

  /**
   * Confirmed partners for the public landing page.
   *
   * Public endpoint. Returns organisation, tier and sector only -- no amounts or
   * contact details -- and only for sponsorships an administrator has confirmed, so
   * a self-declared pledge cannot publish itself onto the homepage.
   */
  getPublicPartners(): Observable<{ total: number; partners: PublicPartner[] }> {
    return this.http.get<{ total: number; partners: PublicPartner[] }>(
      this.apiUrl + '/partners'
    );
  }

  // ── Personnel management ──────────────────────────────────────────────
  // The monitor was read-only: an admin could see somebody needed attention but had
  // to leave for User Management to act, and could not end a session at all.

  /** Everything the platform knows about one person, for the detail drawer. */
  getPersonnelDetail(userId: string): Observable<PersonnelDetail> {
    return this.http.get<PersonnelDetail>(
      `${this.apiUrl}/admin/personnel/${encodeURIComponent(userId)}`
    );
  }

  /** Activate / suspend / deactivate. Suspending also revokes live sessions. */
  setPersonnelStatus(userId: string, status: 'Active' | 'Suspended' | 'Inactive', reason = ''):
      Observable<{ id: string; status: string; sessions_revoked: number }> {
    return this.http.patch<{ id: string; status: string; sessions_revoked: number }>(
      `${this.apiUrl}/admin/personnel/${encodeURIComponent(userId)}/status`,
      { status, reason }
    );
  }

  /** Force a password rotation at next sign-in, ending current sessions. */
  requirePasswordChange(userId: string):
      Observable<{ id: string; must_change_password: boolean; sessions_revoked: number }> {
    return this.http.post<{ id: string; must_change_password: boolean; sessions_revoked: number }>(
      `${this.apiUrl}/admin/personnel/${encodeURIComponent(userId)}/require-password-change`, {}
    );
  }

  /** Sign a person out of every device without disabling the account. */
  revokePersonnelSessions(userId: string): Observable<{ id: string; sessions_revoked: number }> {
    return this.http.post<{ id: string; sessions_revoked: number }>(
      `${this.apiUrl}/admin/personnel/${encodeURIComponent(userId)}/revoke-sessions`, {}
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

  getSubmissions(competitionId = ''): Observable<BackendSubmission[]> {
    const q = competitionId ? '?competition_id=' + encodeURIComponent(competitionId) : '';
    return this.http.get<BackendSubmission[]>(this.apiUrl + '/submissions' + q);
  }

  createSubmission(payload: { student_id: string; source_code_path: string; video_url: string; competition_id?: string | null }): Observable<any> {
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

  getTeams(competitionId = ''): Observable<any[]> {
    const q = competitionId ? '?competition_id=' + encodeURIComponent(competitionId) : '';
    return this.http.get<any[]>(this.apiUrl + '/teams' + q);
  }

  createTeam(payload: { name: string; track?: string; lead?: string; members?: number; status?: string; school_name?: string; competition_id?: string | null; lead_email?: string; member_emails?: string[] }): Observable<any> {
    return this.http.post(this.apiUrl + '/teams', payload);
  }

  updateTeam(id: string, payload: { name: string; track?: string; lead?: string; members?: number; status?: string; school_name?: string; competition_id?: string | null; lead_email?: string; member_emails?: string[] }): Observable<any> {
    return this.http.patch(this.apiUrl + '/teams/' + id, payload);
  }

  deleteTeam(id: string): Observable<any> {
    return this.http.delete(this.apiUrl + '/teams/' + id);
  }

  // ── Institution student portal & mentors ──────────────────────────

  /** Student accounts belonging to the caller's institution (or all, for admins). */
  getInstitutionStudents(): Observable<Array<{
    id: string; full_name: string; email: string; ticket: string;
    status: string; organization: string; must_change_password: boolean;
    has_logged_in: boolean;
  }>> {
    return this.http.get<any[]>(this.apiUrl + '/institution/students');
  }

  /** Issue a fresh one-time password for a student in the caller's institution. */
  resetStudentCredentials(studentId: string): Observable<{
    id: string; full_name: string; email: string; temporary_password: string;
  }> {
    return this.http.post<any>(
      this.apiUrl + '/institution/students/' + encodeURIComponent(studentId) + '/reset-credentials',
      {}
    );
  }

  /** Instructors the caller can pick a mentor from. */
  getInstitutionInstructors(): Observable<Array<{
    id: string; full_name: string; email: string; organization: string;
  }>> {
    return this.http.get<any[]>(this.apiUrl + '/institution/instructors');
  }

  /** Assign or unassign an instructor as a team's mentor. */
  assignTeamMentor(teamId: string, mentorId: string | null): Observable<any> {
    return this.http.patch(
      this.apiUrl + '/teams/' + encodeURIComponent(teamId) + '/mentor',
      { mentor_id: mentorId }
    );
  }

  /** A team with no institution asks to be given a mentor. */
  requestTeamMentor(teamId: string): Observable<any> {
    return this.http.post(
      this.apiUrl + '/teams/' + encodeURIComponent(teamId) + '/request-mentor', {}
    );
  }

  /** Admin: give every mentor-less team an instructor. */
  autoAssignMentors(): Observable<{ assigned: number }> {
    return this.http.post<{ assigned: number }>(this.apiUrl + '/teams/auto-assign-mentors', {});
  }

  /** The teams the signed-in student belongs to (solo or squad), with mentor status. */
  getMyTeams(): Observable<Array<{
    id: string; name: string; track: string; competitionId: string | null;
    mentorId: string | null; mentorStatus: string; isSolo: boolean; isLead: boolean;
  }>> {
    return this.http.get<any[]>(this.apiUrl + '/teams/mine');
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
  getJudgeQueue(track = '', competitionId = ''): Observable<JudgeQueue> {
    const params: string[] = [];
    if (track) params.push('track=' + encodeURIComponent(track));
    // Scopes the queue to one cycle so a judge working a cycle is not shown
    // every unscored submission on the platform.
    if (competitionId) params.push('competition_id=' + encodeURIComponent(competitionId));
    const q = params.length ? '?' + params.join('&') : '';
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

   /**
    * The caller's own applications and requests, including the outcome.
    *
    * GET /api/approvals is admin-only, so an institution that filed a team change
    * previously had no way to see what happened to it -- the only copy was in
    * localStorage, which never learns the reviewer's decision or its reason.
    */
   getMyApprovals(): Observable<Array<{
     id: string; type: string; entity: string; status: string;
     submitted: string; reviewedAt: string; reviewer: string;
     rejectionReasons: string; rejectionNotes: string;
     details: any; competitionId: string | null;
   }>> {
     return this.http.get<any[]>(this.apiUrl + '/approvals/mine');
   }

   createApproval(payload: any): Observable<any> {
     return this.http.post(this.apiUrl + '/approvals', payload);
   }

   /**
    * File a team addition or rename/roster change for admin review.
    *
    * Institutions cannot use `createApproval`: POST /api/approvals requires
    * APPROVAL_ROLES, which excludes school_admin and instructor, so their
    * requests 403'd and never reached the admin queue. This endpoint accepts
    * those roles and derives the institution from the caller's session, so no
    * school can file a change against another.
    */
   submitTeamChange(payload: {
     type: 'Team Addition' | 'Team Modification' | 'Team Disbandment';
     name: string;
     team_id?: string;
     track?: string;
     lead?: string;
     members?: string[];
     mentor?: string;
     motto?: string;
   }): Observable<{ id: string; type: string; entity: string; school: string; status: string }> {
     return this.http.post<{ id: string; type: string; entity: string; school: string; status: string }>(
       this.apiUrl + '/approvals/team-change',
       payload,
       // The dashboard reports this one itself, naming the squad involved.
       { context: new HttpContext().set(HANDLES_OWN_WRITE_ERRORS, true) }
     );
   }

   /**
    * File an application from the public registration page.
    *
    * Public registration previously persisted applications only through
    * `contentService.saveApprovals()` -> POST /api/bulk-sync, which requires an
    * admin -- so for an anonymous applicant every write 401'd, the applicant got
    * a confirmation email, and the reviewer queue stayed empty. This endpoint is
    * unauthenticated, allowlists the type and always records status 'pending'.
    */
   submitPublicApplication(payload: {
     type: string;
     entity: string;
     contact?: string;
     details?: any;
   }): Observable<{ id: string; type: string; status: string }> {
     return this.http.post<{ id: string; type: string; status: string }>(
       this.apiUrl + '/approvals/public',
       payload,
       // The registration page reports this failure itself, with wording specific
       // to an applicant rather than the generic "change not saved".
       { context: new HttpContext().set(HANDLES_OWN_WRITE_ERRORS, true) }
     );
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
