import { getAuthValue } from '../../services/session.util';
import { Component, ChangeDetectionStrategy, OnInit , ChangeDetectorRef } from '@angular/core';
import { CommonModule, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { forkJoin } from 'rxjs';
import { ContentService, LmsSubmission, UpcomingEvent } from '../../services/content.service';
import { FileStorageService } from '../../services/file-storage.service';
import {
  ApiService, MyEnrolledCourse, LmsAssignment, MySubmission,
  LmsAnnouncement, LmsQA, LmsCertificate, LmsMaterial
} from '../../services/api.service';
import { CurrentUserService } from '../../services/current-user.service';

@Component({
  selector: 'app-lms',
  standalone: true,
  imports: [CommonModule, TitleCasePipe, FormsModule, RouterLink, RouterModule],
  templateUrl: './lms.component.html',
  styleUrl: './lms.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LmsComponent implements OnInit {
  selectedUploadFiles: { id: string; name: string }[] = [];

  constructor(
    public contentService: ContentService,
    public fileStorage: FileStorageService,
    private apiService: ApiService,
    public currentUserService: CurrentUserService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    public sanitizer: DomSanitizer
  ) {}

  goToCourseStudio(): void {
    this.router.navigate(['/lms-manager']);
  }

  goToCreateCourse(): void {
    this.router.navigate(['/lms-manager'], { queryParams: { action: 'create_course' } });
  }

  activeRoleId = 'student';

  activeTab: string = 'courses';

  studentActiveTab: string = 'courses';

  activeLessonCourse: any = null;
  lessonSuccessMessage = '';
  submissionError = '';

  authoredCourses: any[] = [];
  serverModules: any[] = [];

  // ── Instructor data helpers ─────────────────────────────────
  private get currentUserEmail(): string {
    return (getAuthValue('activeUserEmail') || '').trim().toLowerCase();
  }

  get myCourses(): any[] {
    const email = this.currentUserEmail;
    if (this.authoredCourses && this.authoredCourses.length > 0) {
      return this.authoredCourses.map(c => {
        const enrolledCount = c.enrolled_count ?? 0;
        const moduleCount = this.serverModules.filter(m => m.course_id === c.id).length || 0;
        return {
          ...c,
          approvalStatus: c.approval_status || 'approved',
          rejectionReason: c.rejection_reason,
          completion: c.average_progress ?? 0,
          enrolledCount,
          moduleCount
        };
      });
    }

    return this.contentService.lmsCourses
      .filter(c => c.submittedBy && c.submittedBy.toLowerCase().includes(email))
      .map(c => {
        const enrolledCount = this.contentService.lmsEnrollments.filter(e => e.courseId === c.id).length || c.enrolled || 0;
        const moduleCount = this.contentService.lmsModules.filter(m => m.courseId === c.id).length || c.modules || 0;
        return { ...c, enrolledCount, moduleCount };
      });
  }

  get allCourses(): any[] {
    return this.contentService.lmsCourses
      .filter(c => (c.approvalStatus || 'approved') === 'approved' && c.status === 'active');
  }

  get myCourseIds(): string[] {
    return this.myCourses.map(c => c.id);
  }

  get myAssignments(): any[] {
    const ids = this.myCourseIds;
    return this.contentService.lmsAssignments.filter(a => ids.includes(a.courseId));
  }

  get myAssignmentIds(): string[] {
    return this.myAssignments.map(a => a.id);
  }

  get instructorSubmissions(): LmsSubmission[] {
    const ids = this.myAssignmentIds;
    return this.contentService.lmsSubmissions.filter(s => ids.includes(s.assignmentId));
  }

  get pendingInstructorSubmissions(): LmsSubmission[] {
    return this.instructorSubmissions.filter(s => s.status === 'submitted');
  }

  // ── Instructor Student submissions ──────────────────────────
  activeInstructorSubmission: LmsSubmission | null = null;
  showInstructorGradingModal = false;
  instructorGradeScore: number | null = null;
  instructorGradeFeedback = '';

  openInstructorGradingModal(sub: LmsSubmission): void {
    this.activeInstructorSubmission = sub;
    this.instructorGradeScore = sub.score ?? null;
    this.instructorGradeFeedback = sub.feedback || '';
    this.showInstructorGradingModal = true;
  }

  closeInstructorGradingModal(): void {
    this.showInstructorGradingModal = false;
    this.activeInstructorSubmission = null;
    this.instructorGradeScore = null;
    this.instructorGradeFeedback = '';
  }

  getAssignmentName(assignmentId: string): string {
    const a = this.contentService.lmsAssignments.find(x => x.id === assignmentId);
    return a ? a.title : 'Assignment';
  }

  getCourseNameForSubmission(sub: LmsSubmission): string {
    const c = this.contentService.lmsCourses.find(x => x.id === sub.courseId);
    return c ? c.title : 'Course';
  }

  submitInstructorGrade(): void {
    if (!this.activeInstructorSubmission || this.instructorGradeScore === null || this.instructorGradeScore < 0 || this.instructorGradeScore > 100) return;
    this.contentService.gradeLmsSubmission(
      this.activeInstructorSubmission.id,
      this.instructorGradeScore,
      this.instructorGradeFeedback || 'Graded by instructor.'
    );
    this.closeInstructorGradingModal();
  }

  rejectInstructorSubmission(): void {
    if (!this.activeInstructorSubmission || !this.instructorGradeFeedback.trim()) return;
    this.contentService.rejectLmsSubmission(
      this.activeInstructorSubmission.id,
      this.instructorGradeFeedback
    );
    this.closeInstructorGradingModal();
  }

  // ── Content Submission ──────────────────────────────────────
  showContentSubmitSuccess = false;
  contentSubmitError = '';
  contentSubmissionForm = {
    type: 'course' as 'course' | 'module',
    courseTitle: '',
    courseTrack: 'coding',
    courseLevel: 'Beginner',
    courseDescription: '',
    moduleTitle: '',
    moduleDescription: ''
  };

  get instructorSubmittedContent(): any[] {
    const email = this.currentUserEmail;
    const results: any[] = [];
    for (const c of this.contentService.lmsCourses) {
      if (c.submittedBy && c.submittedBy.toLowerCase().includes(email)) {
        results.push({ type: 'course', data: c, label: c.title, status: c.approvalStatus, reason: c.rejectionReason });
      }
    }
    for (const m of this.contentService.lmsModules) {
      if (m.submittedBy && m.submittedBy.toLowerCase().includes(email)) {
        results.push({ type: 'module', data: m, label: m.title, status: m.approvalStatus, reason: m.rejectionReason });
      }
    }
    return results;
  }

  get pendingContentCount(): number {
    return this.instructorSubmittedContent.filter(c => c.status === 'pending').length;
  }

  submitContentForModeration(): void {
    const form = this.contentSubmissionForm;
    const email = this.currentUserEmail;
    if (form.type === 'course') {
      if (!form.courseTitle.trim() || !form.courseDescription.trim()) {
        this.contentSubmitError = 'Please enter both course title and description.';
        return;
      }
      this.contentSubmitError = '';
      const newCourse = {
        id: 'crs-' + Date.now(),
        title: form.courseTitle.trim(),
        track: form.courseTrack,
        icon: 'school',
        level: form.courseLevel,
        description: form.courseDescription.trim(),
        modules: 0,
        enrolled: 0,
        completion: 0,
        status: 'draft' as const,
        approvalStatus: 'pending' as const,
        createdAt: new Date().toISOString().split('T')[0],
        submittedBy: email
      };
      const current = [...this.contentService.lmsCourses, newCourse];
      this.contentService.saveLmsCourses(current);
    } else {
      if (!form.moduleTitle.trim() || !form.moduleDescription.trim()) {
        this.contentSubmitError = 'Please enter both module title and description.';
        return;
      }
      this.contentSubmitError = '';
      const newModule = {
        id: 'mod-' + Date.now(),
        courseId: '',
        title: form.moduleTitle.trim(),
        description: form.moduleDescription.trim(),
        order: 1,
        icon: 'view_list',
        status: 'draft' as const,
        submittedBy: email,
        approvalStatus: 'pending' as const
      };
      const current = [...this.contentService.lmsModules, newModule];
      this.contentService.saveLmsModules(current);
    }
    this.showContentSubmitSuccess = true;
    this.contentSubmissionForm = { type: 'course', courseTitle: '', courseTrack: 'coding', courseLevel: 'Beginner', courseDescription: '', moduleTitle: '', moduleDescription: '' };
    setTimeout(() => { this.showContentSubmitSuccess = false; }, 4000);
  }

  // ── Student Portal ──────────────────────────────────────────
  /**
   * The signed-in student.
   *
   * Rewritten to read GET /api/users/me. The previous version searched
   * `contentService.users` (admin-only, so always empty for a student) and then
   * fell through to two fabricated identities -- the last of which was the
   * literal "Kwame Asante / Achimota School".
   *
   * Critically, the middle branch built its id as
   * `'NTIC-STU-' + Math.floor(1000 + Math.random() * 9000)`. Because this is a
   * GETTER, that produced a NEW id on every property access: three different
   * values inside a single completeActiveLesson() call. Progress was saved under
   * keys nothing ever read back, and submissions failed their foreign key every
   * time. `student_id` is now issued and kept by the server.
   */
  get studentProfile() {
    const me = this.currentUserService.profile();

    if (me) {
      const tId = (me.track || '').toLowerCase();
      const resolvedTrackId = tId.includes('robot') ? 'robotics' :
                              tId.includes('ai') || tId.includes('data') ? 'ai' :
                              tId.includes('cyber') || tId.includes('security') ? 'cyber' :
                              tId.includes('innovat') ? 'innovation' : 'coding';
      return {
        name: me.full_name || me.email,
        // Stable, server-issued, and the id every student-owned record keys on.
        id: me.student_id || me.id,
        displayId: me.ticket || me.student_id || me.id,
        school: me.organization || 'Independent Competitor',
        track: me.track || 'Unassigned',
        trackId: resolvedTrackId,
        avatar: this.currentUserService.initials() || 'ST',
        email: me.email,
        status: me.status || '',
        // No mentor-assignment model exists yet, so these are left empty rather
        // than showing the invented "Efua Mensah / e.mensah@ntic.gov.gh".
        mentor: '',
        mentorAvatar: '',
        mentorEmail: ''
      };
    }

    // Not loaded yet (or offline). Show what is genuinely known and nothing more
    // -- never another person's name.
    const activeEmail = this.currentUserEmail;
    return {
      name: getAuthValue('activeUserName') || '',
      id: '',
      displayId: getAuthValue('activeUserTicket') || '',
      school: '',
      track: '',
      trackId: 'coding',
      avatar: '',
      email: activeEmail || '',
      status: '',
      mentor: '',
      mentorAvatar: '',
      mentorEmail: ''
    };
  }

  get studentSkills(): { label: string; pct: number; level: string; levelClass: string }[] {
    const defaultTracks = [
      { key: 'coding', label: 'Algorithm Design' },
      { key: 'robotics', label: 'Hardware / IoT' },
      { key: 'ai', label: 'Data & AI' },
      { key: 'cyber', label: 'Cybersecurity' }
    ];

    const studentTrack = (this.studentProfile?.trackId || this.studentProfile?.track || '').toLowerCase();

    return defaultTracks.map(t => {
      const matchingCourses = this.myEnrolments.filter(e =>
        (e.track || '').toLowerCase().includes(t.key) ||
        (e.title || '').toLowerCase().includes(t.key) ||
        (t.key === 'coding' && (e.track || '').toLowerCase().includes('soft'))
      );

      let pct = 0;
      if (matchingCourses.length > 0) {
        const totalProgress = matchingCourses.reduce((sum, c) => sum + (c.progress_pct || 0), 0);
        pct = Math.round(totalProgress / matchingCourses.length);
      } else {
        pct = 0;
      }

      let level = 'Unranked';
      let levelClass = 'unranked';
      if (pct >= 75) {
        level = 'Advanced';
        levelClass = 'advanced';
      } else if (pct >= 40) {
        level = 'Intermediate';
        levelClass = 'intermediate';
      } else if (pct > 0) {
        level = 'Beginner';
        levelClass = 'beginner';
      } else {
        level = studentTrack.includes(t.key) ? 'Enrolled' : 'Unranked';
        levelClass = studentTrack.includes(t.key) ? 'novice' : 'unranked';
      }

      return {
        label: t.label,
        pct: Math.min(100, Math.max(pct, 0)),
        level,
        levelClass
      };
    });
  }

  get nextTrackHeat(): UpcomingEvent | null {
    const events = this.contentService.upcomingEvents || [];
    if (events.length === 0) return null;

    const studentTrack = (this.studentProfile?.trackId || this.studentProfile?.track || '').toLowerCase();

    // 1. Check for event matching the student's registered track
    const matching = events.find(e => {
      const fullText = `${e.title || ''} ${e.description || ''}`.toLowerCase();
      if (studentTrack.includes('cod') && (fullText.includes('cod') || fullText.includes('soft') || fullText.includes('algorithm') || fullText.includes('hackathon'))) return true;
      if (studentTrack.includes('robot') && (fullText.includes('robot') || fullText.includes('iot') || fullText.includes('hardware'))) return true;
      if ((studentTrack.includes('ai') || studentTrack.includes('data')) && (fullText.includes('ai') || fullText.includes('data') || fullText.includes('machine') || fullText.includes('model'))) return true;
      if (studentTrack.includes('cyber') && (fullText.includes('cyber') || fullText.includes('secur') || fullText.includes('network') || fullText.includes('flag'))) return true;
      if (studentTrack.includes('innovat') && (fullText.includes('innovat') || fullText.includes('project') || fullText.includes('open'))) return true;
      return fullText.includes('all tracks') || fullText.includes('national championship');
    });

    return matching || null;
  }

  // ── Server-backed student state ───────────────────────────────────────
  // These replace derived-from-localStorage getters. Enrolment, progress, grades
  // and the assignment catalogue are all server state now.
  myEnrolments: MyEnrolledCourse[] = [];
  myCourseAssignments: LmsAssignment[] = [];
  mySubmissions: MySubmission[] = [];
  availableCourses: any[] = [];
  isLoadingStudentData = false;
  studentDataError = '';
  isEnrolling: Record<string, boolean> = {};

  /** Loads everything the student portal needs. */
  loadStudentData(): void {
    if (this.activeRoleId !== 'student') return;
    this.isLoadingStudentData = true;
    this.studentDataError = '';

    this.apiService.getMyEnrolments().subscribe({
      next: rows => {
        this.myEnrolments = rows || [];
        this.isLoadingStudentData = false;
        this.apiService.getLmsCourses().subscribe({
          next: courses => {
            if (Array.isArray(courses)) {
              this.contentService.lmsCourses = courses.map((b: any) => ({
                id: b.id,
                title: b.title || '',
                track: b.track || '',
                icon: b.icon || '',
                level: b.level || '',
                description: b.description || '',
                modules: b.modules || 0,
                enrolled: b.enrolled || 0,
                completion: b.completion || 0,
                status: b.status || 'active',
                createdAt: b.created_at || '',
                submittedBy: b.submitted_by || '',
                approvalStatus: b.approval_status || 'approved',
                rejectionReason: b.rejection_reason || ''
              }));
              this.contentService.saveLmsCourses(this.contentService.lmsCourses);
            }
            this.recomputeAvailableCourses();
            this.cdr.markForCheck();
          },
          error: () => {
            this.recomputeAvailableCourses();
            this.cdr.markForCheck();
          }
        });
        this.loadAssignmentsForMyCourses();
      },
      error: err => {
        this.isLoadingStudentData = false;
        this.studentDataError = err?.status === 403
          ? 'This area is for student accounts.'
          : 'Could not load your courses. Check your connection and try again.';
      },
    });

    this.apiService.getMySubmissions().subscribe({
      next: rows => (this.mySubmissions = rows || []),
      error: () => { /* surfaced by the enrolment call above */ },
    });

    this.apiService.getLmsAnnouncements().subscribe({
      next: rows => {
        this.activeAnnouncements = rows || [];
        this.cdr.markForCheck();
      },
      error: () => { this.activeAnnouncements = []; }
    });

    this.apiService.getLmsCertificates().subscribe({
      next: rows => {
        this.myCertificates = rows || [];
        this.cdr.markForCheck();
      },
      error: () => { this.myCertificates = []; }
    });

    this.apiService.getEvents().subscribe({
      next: events => {
        if (Array.isArray(events) && events.length > 0) {
          this.contentService.upcomingEvents = events;
          this.cdr.markForCheck();
        }
      },
      error: () => {}
    });
  }

  activeAnnouncements: LmsAnnouncement[] = [];
  activeQA: LmsQA[] = [];
  myCertificates: LmsCertificate[] = [];
  activeCertificate: LmsCertificate | null = null;
  showCertificateModal = false;
  isGeneratingCert = false;
  studentQuestion = { title: '', content: '' };
  isSubmittingQuestion = false;

  getAnnouncementsForCourse(courseId: string): LmsAnnouncement[] {
    return this.activeAnnouncements.filter(a => a.course_id === courseId);
  }

  loadCourseQA(courseId: string): void {
    if (!courseId) return;
    this.apiService.getLmsQA(courseId).subscribe({
      next: rows => {
        this.activeQA = rows || [];
        this.cdr.markForCheck();
      },
      error: () => { this.activeQA = []; }
    });
  }

  submitQuestion(courseId: string): void {
    if (!this.studentQuestion.content.trim()) return;
    this.isSubmittingQuestion = true;
    this.apiService.createLmsQA({
      course_id: courseId,
      title: this.studentQuestion.title.trim() || undefined,
      content: this.studentQuestion.content.trim()
    }).subscribe({
      next: created => {
        this.activeQA.push(created);
        this.studentQuestion = { title: '', content: '' };
        this.isSubmittingQuestion = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isSubmittingQuestion = false;
        this.cdr.markForCheck();
      }
    });
  }

  getRepliesForQuestion(parentId: string): LmsQA[] {
    return this.activeQA.filter(q => q.parent_id === parentId);
  }

  getRootCourseQuestions(): LmsQA[] {
    return this.activeQA.filter(q => !q.parent_id);
  }

  claimCertificate(course: any): void {
    const courseId = course.course_id || course.id;
    this.isGeneratingCert = true;
    this.apiService.generateLmsCertificate(courseId).subscribe({
      next: cert => {
        this.activeCertificate = cert;
        if (!this.myCertificates.find(c => c.id === cert.id)) {
          this.myCertificates.unshift(cert);
        }
        this.showCertificateModal = true;
        this.isGeneratingCert = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isGeneratingCert = false;
        this.cdr.markForCheck();
      }
    });
  }

  closeCertificateModal(): void {
    this.showCertificateModal = false;
    this.activeCertificate = null;
  }

  printCertificate(): void {
    window.print();
  }

  /** Courses the student could still join. */
  private recomputeAvailableCourses(): void {
    const enrolled = new Set(this.myEnrolments.map(e => e.course_id));
    this.availableCourses = (this.contentService.lmsCourses || [])
      .filter((c: any) => !enrolled.has(c.id))
      .filter((c: any) => (c.approvalStatus || c.approval_status || 'approved') === 'approved');
  }

  private loadAssignmentsForMyCourses(): void {
    if (!this.myEnrolments.length) {
      this.myCourseAssignments = [];
      return;
    }
    // One request per enrolled course, merged. Small n, and it keeps the endpoint
    // simple rather than adding a multi-id filter.
    const collected: LmsAssignment[] = [];
    let pending = this.myEnrolments.length;
    for (const e of this.myEnrolments) {
      this.apiService.getLmsAssignments(e.course_id).subscribe({
        next: rows => {
          collected.push(...(rows || []));
          if (--pending === 0) this.myCourseAssignments = collected;
        },
        error: () => { if (--pending === 0) this.myCourseAssignments = collected; },
      });
    }
  }

  enrol(courseId: string): void {
    if (this.isEnrolling[courseId]) return;
    this.isEnrolling[courseId] = true;
    this.apiService.enrolOnCourse(courseId).subscribe({
      next: () => {
        this.isEnrolling[courseId] = false;
        this.loadStudentData();
      },
      error: err => {
        this.isEnrolling[courseId] = false;
        this.studentDataError = err?.error?.detail
          || 'Could not enrol you on that course. Please try again.';
      },
    });
  }

  withdraw(courseId: string): void {
    if (this.isEnrolling[courseId]) return;
    this.isEnrolling[courseId] = true;
    this.apiService.withdrawFromCourse(courseId).subscribe({
      next: () => {
        this.isEnrolling[courseId] = false;
        this.loadStudentData();
      },
      error: err => {
        this.isEnrolling[courseId] = false;
        this.studentDataError = err?.error?.detail || 'Could not withdraw you from that course.';
      },
    });
  }

  /** Assignments for one enrolled course, with this student's submission attached. */
  assignmentsForCourse(courseId: string): any[] {
    return this.myCourseAssignments
      .filter(a => a.course_id === courseId)
      .map(a => {
        const submission = this.mySubmissions.find(s => s.assignment_id === a.id);
        return {
          ...a,
          submission,
          isSubmitted: !!submission,
          isGraded: !!submission && submission.score !== null,
        };
      });
  }

  /** True once an instructor has marked at least one piece of work. */
  get hasAnyGrade(): boolean {
    return this.mySubmissions.some(s => s.score !== null);
  }

  get averageGrade(): number | null {
    const graded = this.mySubmissions.filter(s => s.score !== null);
    if (!graded.length) return null;
    const total = graded.reduce((sum, s) => sum + (s.score || 0), 0);
    return Math.round(total / graded.length);
  }

  get studentCourses() {
    // Reads enrolments, not "every course on the platform" as it used to.
    return this.myEnrolments.map(e => ({
      courseId: e.course_id,
      title: e.title,
      track: e.track,
      icon: e.icon,
      totalModules: e.modules || 0,
      color: 'primary',
      progress: e.progress_pct || 0,
      module: e.description || '',
      level: e.level,
      lastActive: e.last_active ? 'Last active ' + e.last_active.slice(0, 10) : 'Not started',
      badgeText: (e.progress_pct || 0) >= 100 ? 'Completed' : 'In Progress',
      buttonText: (e.progress_pct || 0) === 0 ? 'START COURSE →' : 'RESUME COURSE',
      assignmentCount: e.assignment_count || 0,
    }));
  }

  get primaryCourseTitle(): string {
    const courses = this.studentCourses;
    return courses && courses.length > 0 ? courses[0].title : 'No course yet';
  }

  getCourseProgress(courseTitle: string): number {
    const match = this.myEnrolments.find(e => e.title === courseTitle);
    return match ? (match.progress_pct || 0) : 0;
  }

  getCourseModules(courseTitle: string) {
    const course = this.contentService.lmsCourses.find((c: any) => c.title === courseTitle);
    if (!course) return [];
    const progress = this.getCourseProgress(courseTitle || '');
    const totalModules = course.modules || 0;
    if (!totalModules) return [];
    return Array.from({ length: totalModules }, (_, i) => {
      const completedThreshold = (i + 1) * (100 / totalModules);
      return {
        id: String(i + 1),
        // NOTE: real module titles live in `lms_modules`, which has no GET
        // endpoint yet (Phase 2). Until then these are positional placeholders.
        title: `Module ${i + 1}`,
        desc: '',
        status: progress === 0 ? (i === 0 ? 'active' : 'pending') :
                progress >= completedThreshold ? 'completed' :
                progress >= completedThreshold - (100 / totalModules) ? 'active' : 'pending'
      };
    });
  }

  // ── Classroom & Multi-Widget Player State ────────────────────
  classroomModules: any[] = [];
  classroomMaterials: any[] = [];
  activeLessonModule: any = null;
  activeModuleWidgets: any[] = [];
  activeWidgetIndex: number = 0;
  activeWidget: any = null;
  isLoadingClassroom = false;

  // Widget interactive states
  quizSelectedOption: number | null = null;
  quizSubmitted = false;
  quizIsCorrect = false;
  quizScore = 0;
  codeCopied = false;
  codeTaskSolved = false;
  isVideoCompleted = false;

  // Completed widget IDs in current session
  completedWidgetIds: Set<string> = new Set();

  startCourseLesson(course: any): void {
    this.activeLessonCourse = course;
    this.lessonSuccessMessage = '';
    this.lessonErrorMessage = '';
    this.isLoadingClassroom = true;
    this.cdr.markForCheck();

    const courseId = course.courseId || course.id || course.course_id;
    forkJoin({
      modules: this.apiService.getModules(courseId),
      materials: this.apiService.getMaterials(courseId)
    }).subscribe({
      next: ({ modules, materials }) => {
        this.isLoadingClassroom = false;
        this.classroomModules = (modules && modules.length > 0) ? modules : [
          {
            id: 'mod-core-1',
            title: 'Module 1: Architecture & Computational Principles',
            description: course.description || 'Core theoretical concepts, algorithms, and telemetry standards.',
            order_num: 1
          },
          {
            id: 'mod-core-2',
            title: 'Module 2: Practical Implementation & Code Lab',
            description: 'Hands-on hardware interfacing and algorithmic complexity optimization.',
            order_num: 2
          }
        ];
        this.classroomMaterials = materials || [];
        this.selectModule(this.classroomModules[0]);
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoadingClassroom = false;
        this.classroomModules = [
          {
            id: 'mod-core-1',
            title: 'Module 1: Architecture & Computational Principles',
            description: course.description || 'Core theoretical concepts, algorithms, and telemetry standards.',
            order_num: 1
          }
        ];
        this.classroomMaterials = [];
        this.selectModule(this.classroomModules[0]);
        this.cdr.markForCheck();
      }
    });
  }

  selectModule(mod: any): void {
    this.activeLessonModule = mod;
    this.activeModuleWidgets = this.buildWidgetsForModule(mod, this.classroomMaterials);
    this.activeWidgetIndex = 0;
    this.selectWidget(this.activeModuleWidgets[0], 0);
  }

  onModuleChange(moduleId: string): void {
    const found = this.classroomModules.find(m => m.id === moduleId);
    if (found) {
      this.selectModule(found);
    }
  }

  buildWidgetsForModule(mod: any, allMaterials: any[]): any[] {
    const modMaterials = allMaterials.filter(m => m.module_id === mod.id || m.moduleId === mod.id);
    const widgets: any[] = [];

    if (modMaterials.length > 0) {
      for (const mat of modMaterials) {
        let parsedPayload: any = null;
        try {
          if (mat.description && mat.description.startsWith('{')) {
            parsedPayload = JSON.parse(mat.description);
          }
        } catch {
          parsedPayload = null;
        }

        const widgetType = mat.type || (parsedPayload?.widget) || 'guide';
        widgets.push({
          id: mat.id || ('widget-' + Math.random().toString(36).slice(2, 8)),
          title: mat.title,
          type: widgetType,
          rawUrl: mat.url || '',
          embedUrl: mat.url ? this.getSafeEmbedUrl(mat.url) : null,
          description: mat.description || '',
          payload: parsedPayload,
          parsedQuiz: widgetType === 'quiz' ? {
            question: parsedPayload?.question || mat.title,
            options: parsedPayload?.options || ['Option A', 'Option B', 'Option C', 'Option D'],
            correctIndex: parsedPayload?.correctIndex ?? 0,
            explanation: parsedPayload?.explanation || 'Review the core concepts from the previous module reading.'
          } : null,
          parsedCode: widgetType === 'code' ? {
            language: parsedPayload?.language || 'python',
            starterCode: parsedPayload?.starterCode || '# Write your solution below\ndef solve():\n    pass\n',
            instructions: parsedPayload?.instructions || mat.description || 'Implement the required algorithmic solution.'
          } : null,
          parsedVideo: widgetType === 'video' ? {
            durationMinutes: parsedPayload?.durationMinutes || 15,
            keyTakeaway: parsedPayload?.keyTakeaway || 'Mastering hardware timing & logic.',
            overview: parsedPayload?.overview || mat.description || ''
          } : null,
        });
      }
    } else {
      // Create rich IBM SkillsBuild-inspired interactive default units for the module
      widgets.push({
        id: `${mod.id}-video`,
        title: 'Video Lecture: System Architecture & Design',
        type: 'video',
        rawUrl: 'https://www.youtube.com/watch?v=kqtD5dpn9C8',
        embedUrl: this.getSafeEmbedUrl('https://www.youtube.com/watch?v=kqtD5dpn9C8'),
        description: 'Comprehensive video breakdown of algorithmic optimization and timing diagrams for championship competition.',
        parsedVideo: {
          durationMinutes: 18,
          keyTakeaway: 'Understanding real-time sensor polling and state machines.',
          overview: 'Watch the full video walkthrough before tackling the comprehension checkpoint.'
        }
      });

      widgets.push({
        id: `${mod.id}-guide`,
        title: 'Technical Guide & Core Principles',
        type: 'guide',
        description: `### Overview of National Championship Standards\n\nIn this technical unit, candidates must analyze how asynchronous inputs and timing constraints affect execution determinism.\n\n#### Key Engineering Takeaways:\n- **Deterministic Polling:** Ensure sensor loops run with constant-time complexity $O(1)$.\n- **Memory Guardrails:** Prevent stack overflows when processing high-frequency serial feeds.\n- **Error Handlers:** Always implement fail-safe resets for critical hardware actuators.`,
      });

      widgets.push({
        id: `${mod.id}-quiz`,
        title: 'Checkpoint Knowledge Check',
        type: 'quiz',
        parsedQuiz: {
          question: 'Which algorithmic approach yields optimal performance for priority event queues in embedded telemetry?',
          options: [
            'Binary Min-Heap with $O(\\log N)$ insertion',
            'Unsorted Linked List with $O(N)$ lookup',
            'Bubble Sort after each incoming packet',
            'Linear Array scanning without indexing'
          ],
          correctIndex: 0,
          explanation: 'Binary Min-Heaps guarantee logarithmic $O(\\log N)$ insertions and $O(1)$ priority peek operations, preventing CPU throttling during high-throughput bursts.'
        }
      });

      widgets.push({
        id: `${mod.id}-code`,
        title: 'Interactive Code Sprint Challenge',
        type: 'code',
        parsedCode: {
          language: 'python',
          starterCode: `def evaluate_telemetry(sensor_readings: list[int], threshold: int) -> int:\n    """\n    Count the number of contiguous telemetry spikes that exceed the threshold.\n    """\n    spikes = 0\n    # TODO: Implement candidate solution\n    return spikes\n\n# Test execution\nprint(evaluate_telemetry([10, 55, 60, 20, 80], 50))  # Expected: 2\n`,
          instructions: 'Implement the `evaluate_telemetry` function to count continuous spike cycles exceeding the designated threshold.'
        }
      });
    }

    return widgets;
  }

  selectWidget(widget: any, index: number): void {
    this.activeWidget = widget;
    this.activeWidgetIndex = index;
    this.quizSelectedOption = null;
    this.quizSubmitted = false;
    this.quizIsCorrect = false;
    this.codeCopied = false;
    this.codeTaskSolved = this.completedWidgetIds.has(widget?.id);
    this.isVideoCompleted = this.completedWidgetIds.has(widget?.id);
    this.cdr.markForCheck();
  }

  getSafeEmbedUrl(url: string): SafeResourceUrl {
    let cleanUrl = url;
    if (url.includes('youtube.com/watch?v=')) {
      const vidId = url.split('v=')[1]?.split('&')[0];
      cleanUrl = `https://www.youtube.com/embed/${vidId}`;
    } else if (url.includes('youtu.be/')) {
      const vidId = url.split('youtu.be/')[1]?.split('?')[0];
      cleanUrl = `https://www.youtube.com/embed/${vidId}`;
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(cleanUrl);
  }

  selectQuizOption(idx: number): void {
    if (this.quizSubmitted) return;
    this.quizSelectedOption = idx;
    this.cdr.markForCheck();
  }

  submitQuizAnswer(): void {
    if (this.quizSelectedOption === null || !this.activeWidget?.parsedQuiz) return;
    this.quizSubmitted = true;
    this.quizIsCorrect = this.quizSelectedOption === this.activeWidget.parsedQuiz.correctIndex;
    if (this.quizIsCorrect) {
      this.completedWidgetIds.add(this.activeWidget.id);
    }
    this.cdr.markForCheck();
  }

  markActiveWidgetCompleted(): void {
    if (this.activeWidget?.id) {
      this.completedWidgetIds.add(this.activeWidget.id);
      this.cdr.markForCheck();
    }
  }

  resetQuiz(): void {
    this.quizSelectedOption = null;
    this.quizSubmitted = false;
    this.quizIsCorrect = false;
    this.cdr.markForCheck();
  }

  copyCodeSnippet(code: string): void {
    if (!code) return;
    navigator.clipboard?.writeText(code).then(() => {
      this.codeCopied = true;
      this.cdr.markForCheck();
      setTimeout(() => {
        this.codeCopied = false;
        this.cdr.markForCheck();
      }, 2000);
    });
  }

  markCodeSolved(): void {
    this.codeTaskSolved = true;
    if (this.activeWidget) {
      this.completedWidgetIds.add(this.activeWidget.id);
    }
    this.cdr.markForCheck();
  }

  markVideoCompleted(): void {
    this.isVideoCompleted = true;
    if (this.activeWidget) {
      this.completedWidgetIds.add(this.activeWidget.id);
    }
    this.cdr.markForCheck();
  }

  isWidgetCompleted(widgetId: string): boolean {
    return this.completedWidgetIds.has(widgetId);
  }

  get completedWidgetsCount(): number {
    return this.activeModuleWidgets.filter(w => this.completedWidgetIds.has(w.id)).length;
  }

  get moduleProgressPercent(): number {
    if (!this.activeModuleWidgets.length) return 0;
    return Math.round((this.completedWidgetsCount / this.activeModuleWidgets.length) * 100);
  }

  goToNextWidget(): void {
    if (this.activeWidgetIndex < this.activeModuleWidgets.length - 1) {
      this.selectWidget(this.activeModuleWidgets[this.activeWidgetIndex + 1], this.activeWidgetIndex + 1);
    } else {
      this.completeActiveLesson();
    }
  }

  goToPrevWidget(): void {
    if (this.activeWidgetIndex > 0) {
      this.selectWidget(this.activeModuleWidgets[this.activeWidgetIndex - 1], this.activeWidgetIndex - 1);
    }
  }

  /**
   * Marks a module complete and persists progress server-side.
   */
  completeActiveLesson(): void {
    if (!this.activeLessonCourse) return;
    const title = this.activeLessonCourse.title;
    const total = this.activeLessonCourse.totalModules || 4;
    const step = total > 0 ? Math.floor(100 / total) : 25;
    const current = this.getCourseProgress(title);
    const updated = Math.min(100, current + step);
    const completedModules = total > 0 ? Math.round((updated / 100) * total) : 0;

    this.isSavingProgress = true;
    this.lessonSuccessMessage = '';
    this.lessonErrorMessage = '';
    this.cdr.markForCheck();

    this.apiService.saveMyProgress(title, updated, completedModules).subscribe({
      next: () => {
        this.isSavingProgress = false;
        this.lessonSuccessMessage = `Module checkpoint verified! Course progress is now ${updated}%.`;
        this.apiService.getMyEnrolments().subscribe({
          next: rows => {
            this.myEnrolments = rows || [];
            this.cdr.markForCheck();
          },
          error: () => {},
        });
        this.cdr.markForCheck();
        setTimeout(() => {
          this.activeLessonCourse = null;
          this.lessonSuccessMessage = '';
          this.cdr.markForCheck();
        }, 1800);
      },
      error: () => {
        this.isSavingProgress = false;
        this.lessonErrorMessage = 'Could not save your progress. Please check your connection and try again.';
        this.cdr.markForCheck();
      },
    });
  }

  isSavingProgress = false;
  lessonErrorMessage = '';

  closeLessonModal(): void {
    this.activeLessonCourse = null;
    this.lessonErrorMessage = '';
    this.activeLessonModule = null;
    this.activeModuleWidgets = [];
    this.activeWidget = null;
    this.cdr.markForCheck();
  }

  /**
   * The student's submission history, with grades.
   *
   * Was `contentService.submissions.filter(s => s.student === studentProfile.name)`
   * over a localStorage cache whose backend rows key on a student UUID -- so it
   * could never match a name and was always empty.
   */
  get studentSubmissions(): any[] {
    return this.mySubmissions.map(s => ({
      assignment: s.assignment_title || 'Assignment',
      course: s.course_title,
      file: s.url || s.content?.slice(0, 60) || '',
      date: s.submitted_at,
      status: s.score !== null ? 'graded' : 'pending',
      feedback: s.feedback || (s.score === null ? 'Awaiting instructor evaluation' : ''),
      grade: s.score,
      maxScore: s.max_score,
    }));
  }

  // Was { courseTitle, assignmentName, fileName, notes } where assignmentName was
  // free text fuzzy-matched against a localStorage list. Submissions now attach to
  // a real assignment id.
  newSubmission: { courseTitle: string; assignmentId: string; notes: string; url: string } = {
    courseTitle: '',
    assignmentId: '',
    notes: '',
    url: ''
  };

  showUploadSuccess = false;

  async onUploadFileSelected(event: any): Promise<void> {
    const files: FileList = event.target.files;
    if (files?.length) {
      for (const file of Array.from(files)) {
        await this.storeUploadedFile(file);
      }
    }
    event.target.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    el.style.borderColor = 'var(--primary)';
    el.style.background = 'rgba(0, 63, 135, 0.08)';
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    el.style.borderColor = '';
    el.style.background = '';
  }

  onDropFile(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    el.style.borderColor = '';
    el.style.background = '';
    const files = event.dataTransfer?.files;
    if (files?.length) {
      for (const file of Array.from(files)) {
        this.storeUploadedFile(file);
      }
    }
  }

  private async storeUploadedFile(file: File): Promise<void> {
    const id = this.fileStorage.generateId();
    await this.fileStorage.store(id, file);
    this.selectedUploadFiles = [...this.selectedUploadFiles, { id, name: file.name }];
  }

  removeUploadFile(index: number): void {
    const file = this.selectedUploadFiles[index];
    if (file) this.fileStorage.remove(file.id);
    this.selectedUploadFiles = this.selectedUploadFiles.filter((_, i) => i !== index);
  }

  fileNames(file: string): string[] {
    if (!file) return [];
    return file.split('||').map(f => f.includes('::') ? f.split('::')[1] : f);
  }

  ngOnInit(): void {
    this.activeRoleId = getAuthValue('activeRoleId') || 'student';
    if (this.activeRoleId === 'student') {
      this.studentActiveTab = 'courses';
    } else {
      this.activeTab = 'courses';
      this.apiService.getMyAuthoredCourses().subscribe({
        next: rows => {
          this.authoredCourses = rows || [];
          this.cdr.markForCheck();
          for (const c of this.authoredCourses) {
            this.apiService.getModules(c.id).subscribe({
              next: mods => {
                this.serverModules = [...this.serverModules.filter(m => m.course_id !== c.id), ...(mods || [])];
                this.cdr.markForCheck();
              },
              error: () => {}
            });
          }
        },
        error: () => {}
      });
    }
    // studentProfile depends on this; without it the page would render blank
    // identity fields on a cold load.
    this.currentUserService.ensureLoaded().subscribe(() => this.loadStudentData());
    this.cdr.markForCheck();
  }

  /**
   * Submits work for a specific assignment.
   *
   * The previous version could not persist anything:
   *   1. POST /api/submissions -- student_id is FK -> students(id) and the client
   *      sent a ticket/random string, so this ALWAYS returned 400. The only
   *      reaction was a console.error.
   *   2. saveSubmissions() / saveLmsSubmissions() -- both route through
   *      POST /api/bulk-sync, which is admin-only, so both 403'd for a student
   *      and the error was swallowed.
   *   3. `showUploadSuccess = true` ran unconditionally, so the green
   *      "Assignment submitted successfully!" banner appeared every time even
   *      though nothing had been stored anywhere but this browser.
   *
   * It also took a free-text assignment NAME and tried to fuzzy-match it against
   * a localStorage list. Submissions are now tied to a real assignment id.
   */
  submitAssignment(): void {
    if (!this.newSubmission.assignmentId) {
      this.submissionError = 'Choose which assignment you are submitting for.';
      return;
    }
    const notes = (this.newSubmission.notes || '').trim();
    const link = (this.newSubmission.url || '').trim();
    if (!notes && !link && !this.selectedUploadFiles.length) {
      this.submissionError = 'Add a link to your work, or describe what you are submitting.';
      return;
    }

    // Files are held in IndexedDB and are not uploaded anywhere -- there is no
    // file-serving endpoint yet. Record their names in the submission text so a
    // grader at least knows what was produced, rather than implying the bytes
    // were delivered.
    const fileNote = this.selectedUploadFiles.length
      ? `Files prepared locally: ${this.selectedUploadFiles.map(f => f.name).join(', ')}`
      : '';
    const content = [notes, fileNote].filter(Boolean).join(' | ');

    this.isSubmittingWork = true;
    this.submissionError = '';
    this.showUploadSuccess = false;

    this.apiService.submitAssignmentWork(this.newSubmission.assignmentId, content, link).subscribe({
      next: () => {
        this.isSubmittingWork = false;
        this.showUploadSuccess = true;
        this.selectedUploadFiles = [];
        this.newSubmission = { courseTitle: '', assignmentId: '', notes: '', url: '' };
        // Pull the submission back so the history list and any grade are real.
        this.apiService.getMySubmissions().subscribe({
          next: rows => (this.mySubmissions = rows || []),
          error: () => { /* history refresh only */ },
        });
        setTimeout(() => { this.showUploadSuccess = false; }, 4000);
      },
      error: (err: any) => {
        this.isSubmittingWork = false;
        // Report the real reason instead of always claiming success.
        this.submissionError = err?.status === 403
          ? 'Enrol on this course before submitting work for it.'
          : err?.status === 404
            ? 'That assignment no longer exists. Refresh and try again.'
            : err?.status === 422
              ? (err?.error?.detail || 'Add a link or describe your work before submitting.')
              : 'Could not submit your work. Nothing was saved -- please try again.';
      },
    });
  }

  isSubmittingWork = false;
}
