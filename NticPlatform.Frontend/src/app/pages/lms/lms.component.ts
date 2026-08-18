import { getAuthValue } from '../../services/session.util';
import { Component, OnInit } from '@angular/core';
import { CommonModule, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContentService, LmsSubmission } from '../../services/content.service';
import { FileStorageService } from '../../services/file-storage.service';
import { ApiService, MyEnrolledCourse, LmsAssignment, MySubmission } from '../../services/api.service';
import { CurrentUserService } from '../../services/current-user.service';

@Component({
  selector: 'app-lms',
  standalone: true,
  imports: [CommonModule, TitleCasePipe, FormsModule],
  templateUrl: './lms.component.html',
  styleUrl: './lms.component.scss'
})
export class LmsComponent implements OnInit {
  selectedUploadFiles: { id: string; name: string }[] = [];

  constructor(public contentService: ContentService, public fileStorage: FileStorageService, private apiService: ApiService, public currentUserService: CurrentUserService) {}

  activeRoleId = 'student';

  activeTab = 'courses';

  studentActiveTab = 'courses';

  activeLessonCourse: any = null;
  lessonSuccessMessage = '';

  submissionError = '';

  // ── Instructor data helpers ─────────────────────────────────
  private get currentUserEmail(): string {
    return (getAuthValue('activeUserEmail') || '').trim().toLowerCase();
  }

  get myCourses(): any[] {
    const email = this.currentUserEmail;
    return this.contentService.lmsCourses
      .filter(c => c.submittedBy && c.submittedBy.toLowerCase().includes(email))
      .map(c => {
        const enrolledCount = this.contentService.lmsEnrollments.filter(e => e.courseId === c.id).length;
        const moduleCount = this.contentService.lmsModules.filter(m => m.courseId === c.id).length;
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
        this.recomputeAvailableCourses();
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

  startCourseLesson(course: any): void {
    this.activeLessonCourse = course;
    this.lessonSuccessMessage = '';
  }

  /**
   * Marks a module complete and persists progress server-side.
   *
   * The old version wrote to localStorage under a key built from a randomly
   * regenerated id, sent `student_id` from the client (which the server trusted),
   * and showed its success message from a `setTimeout` that fired regardless of
   * whether the request succeeded -- the `.subscribe()` had no error handler at
   * all.
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

    this.apiService.saveMyProgress(title, updated, completedModules).subscribe({
      next: () => {
        this.isSavingProgress = false;
        this.lessonSuccessMessage = `Module completed. Course progress is now ${updated}%.`;
        // Refresh so the card, the tile and any other view agree with the server.
        this.apiService.getMyEnrolments().subscribe({
          next: rows => (this.myEnrolments = rows || []),
          error: () => { /* keep showing the optimistic figure */ },
        });
        setTimeout(() => {
          this.activeLessonCourse = null;
          this.lessonSuccessMessage = '';
        }, 1600);
      },
      error: () => {
        this.isSavingProgress = false;
        // Say it failed instead of celebrating. Progress is not saved.
        this.lessonErrorMessage = 'Could not save your progress. Please try again.';
      },
    });
  }

  isSavingProgress = false;
  lessonErrorMessage = '';

  closeLessonModal(): void {
    this.activeLessonCourse = null;
    this.lessonErrorMessage = '';
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
    }
    // studentProfile depends on this; without it the page would render blank
    // identity fields on a cold load.
    this.currentUserService.ensureLoaded().subscribe(() => this.loadStudentData());
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
