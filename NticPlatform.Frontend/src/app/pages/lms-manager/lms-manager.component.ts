import { Component, ChangeDetectionStrategy, OnInit , ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ContentService, LmsCourse, LmsModule, LmsMaterial, LmsAssignment, LmsSubmission, LmsEnrollment } from '../../services/content.service';
import { DialogService } from '../../services/dialog.service';
import {
  ApiService, AuthoredCourse, GradingQueueItem, CourseStudent, ModerationQueueItem,
  LmsModule as ApiLmsModule, LmsMaterial as ApiLmsMaterial,
  LmsAssignment as LmsAssignmentApi,
} from '../../services/api.service';

export interface PendingModerationItem {
  id: string;
  type: 'course' | 'module' | 'material' | 'assignment';
  typeLabel: string;
  title: string;
  description: string;
  submittedBy: string;
  createdAt: string;
  courseTitle?: string;
  rawItem: any;
}

@Component({
  selector: 'app-lms-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './lms-manager.component.html',
  styleUrls: ['./lms-manager.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LmsManagerComponent implements OnInit {
  activeTab: 'approvals' | 'courses' | 'modules' | 'materials' | 'assignments' | 'students' = 'courses';

  // Filters & Search
  searchQuery = '';
  selectedTrack = 'all';
  selectedStatus = 'all';
  selectedLevel = 'all';
  selectedCourseId = 'all';
  selectedApprovalFilter = 'all'; // 'all' | 'pending' | 'approved' | 'rejected'
  // Cycle scoping: courses can now be tied to a competition cycle. 'all' shows
  // every course the author owns; a specific id scopes to that cycle.
  competitions: Array<{ id: string; title: string }> = [];
  selectedCycle = 'all';

  // Modals visibility
  isCourseModalOpen = false;
  isModuleModalOpen = false;
  isMaterialModalOpen = false;
  isAssignmentModalOpen = false;
  isGradingModalOpen = false;
  isRejectModalOpen = false;

  formMode: 'create' | 'edit' = 'create';

  // Form Models
  courseForm: LmsCourse = this.emptyCourse();
  moduleForm: LmsModule = this.emptyModule();
  materialForm: LmsMaterial = this.emptyMaterial();
  assignmentForm: LmsAssignment = this.emptyAssignment();

  // Grading & Moderation
  activeSubmission: any = null;
  gradingScore: number = 0;
  gradingFeedback: string = '';

  activeRejectItem: PendingModerationItem | null = null;
  rejectionReasonInput: string = '';

  // ── Server-backed state ─────────────────────────────────────────────
  // These replace reads of contentService.lmsModules / lmsMaterials /
  // lmsAssignments / lmsSubmissions / lmsEnrollments, every one of which defaults
  // to [] and had NO backend GET -- so the Modules, Materials, Assignments,
  // Submissions and Students tabs were all permanently empty unless an admin had
  // bulk-synced data into that same browser.
  authoredCourses: AuthoredCourse[] = [];
  gradingQueue: GradingQueueItem[] = [];
  courseRoster: CourseStudent[] = [];
  moderationQueue: ModerationQueueItem[] = [];
  serverModules: ApiLmsModule[] = [];
  serverMaterials: ApiLmsMaterial[] = [];
  serverAssignments: LmsAssignmentApi[] = [];
  isLoading = false;
  isSaving = false;
  saveError = '';
  loadError = '';

  constructor(
    public contentService: ContentService,
    private dialogService: DialogService,
    private apiService: ApiService
  , private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.reload();
    this.cdr.markForCheck();
  }

  /** Reloads everything this page shows from the server. */
  reload(): void {
    this.isLoading = true;
    this.loadError = '';

    // Cycles are needed to label and filter courses. A failure here must not
    // take the page down, so it is tolerated.
    this.apiService.getCompetitions().subscribe({
      next: rows => {
        this.competitions = (rows || [])
          .map(c => ({ id: c.id, title: c.title }))
          .sort((a, b) => a.title.localeCompare(b.title));
      },
      error: () => { this.competitions = []; }
    });

    this.apiService.getMyAuthoredCourses(this.selectedCycle === 'all' ? undefined : this.selectedCycle).subscribe({
      next: rows => {
        this.authoredCourses = rows || [];
        this.isLoading = false;
        // Pull child content for the courses we own.
        this.serverModules = [];
        this.serverMaterials = [];
        this.serverAssignments = [];
        for (const c of this.authoredCourses) {
          this.apiService.getModules(c.id).subscribe({
            next: mods => (this.serverModules = [...this.serverModules, ...(mods || [])]),
            error: () => { /* per-course failure is not fatal */ },
          });
          this.apiService.getMaterials(c.id).subscribe({
            next: mats => (this.serverMaterials = [...this.serverMaterials, ...(mats || [])]),
            error: () => { /* per-course failure is not fatal */ },
          });
          this.apiService.getLmsAssignments(c.id).subscribe({
            next: asgns => (this.serverAssignments = [...this.serverAssignments, ...(asgns || [])]),
            error: () => { /* per-course failure is not fatal */ },
          });
        }
      },
      error: err => {
        this.isLoading = false;
        this.loadError = err?.status === 403
          ? 'Your account is not permitted to author LMS content.'
          : 'Could not load your courses. Check your connection and try again.';
      },
    });

    this.apiService.getGradingQueue().subscribe({
      next: rows => (this.gradingQueue = rows || []),
      error: () => { /* surfaced by the course load above */ },
    });

    this.apiService.getModerationQueue().subscribe({
      next: rows => (this.moderationQueue = rows || []),
      // Instructors are not reviewers, so a 403 here is expected and not an error.
      error: () => (this.moderationQueue = []),
    });

    if (this.selectedCourseId && this.selectedCourseId !== 'all') {
      this.loadRoster(this.selectedCourseId);
    }
  }

  /** Loads the enrolled roster for one course. */
  loadRoster(courseId: string): void {
    if (!courseId || courseId === 'all') {
      this.courseRoster = [];
      return;
    }
    this.apiService.getCourseStudents(courseId).subscribe({
      next: rows => (this.courseRoster = rows || []),
      error: () => (this.courseRoster = []),
    });
  }

  /** Approve or reject someone else's submitted content. */
  moderate(courseId: string, approve: boolean, reason: string = ''): void {
    this.apiService.moderateCourse(courseId, approve, reason).subscribe({
      next: () => this.reload(),
      error: (err: any) => {
        this.saveError = err?.status === 403
          ? 'You cannot review your own content. Ask another reviewer.'
          : err?.status === 422
            ? 'Give a reason when rejecting content.'
            : 'Could not record your review. Please try again.';
      },
    });
  }

  // ── Stats Counters ──────────────────────────────────────────
  // Now derived from server data. These read contentService arrays that default to
  // [] and had no backend GET, so every counter except course count showed 0
  // regardless of what existed in the database.
  get totalCourses(): number {
    return this.authoredCourses.length;
  }
  get activeCoursesCount(): number {
    return this.authoredCourses.filter(c => c.status === 'active' && c.approval_status === 'approved').length;
  }
  get pendingReviewCount(): number {
    return this.authoredCourses.filter(c => c.approval_status === 'pending').length;
  }
  get rejectedCount(): number {
    return this.authoredCourses.filter(c => c.approval_status === 'rejected').length;
  }
  get totalModules(): number {
    return this.serverModules.length;
  }
  get totalMaterials(): number {
    return this.serverMaterials.length;
  }
  get totalAssignments(): number {
    return this.authoredCourses.reduce((sum, c) => sum + (c.assignment_count || 0), 0);
  }
  get pendingGradingCount(): number {
    return this.gradingQueue.length;
  }
  get totalEnrolledStudents(): number {
    return this.authoredCourses.reduce((sum, c) => sum + (c.enrolled_count || 0), 0);
  }

  // ── Moderation Approvals Queue ──────────────────────────────
  //
  // Comes from GET /api/lms/moderation-queue, which the SERVER filters to exclude
  // the reviewer's own submissions. The previous version walked local
  // contentService arrays with no owner scoping at all, so an instructor was shown
  // their own pending content and could approve it themselves -- and the resulting
  // record was stamped with the hardcoded default 'admin@ntic.org.gh' rather than
  // whoever actually acted.
  get pendingLmsItems(): PendingModerationItem[] {
    return this.moderationQueue.map(c => ({
      id: c.id,
      type: 'course' as const,
      typeLabel: 'Course',
      title: c.title,
      description: c.description,
      submittedBy: c.submitted_by || 'Instructor',
      createdAt: c.created_at,
      rawItem: c,
    }));
  }

  get pendingApprovalsCount(): number {
    return this.pendingLmsItems.length;
  }

  // ── Moderation Actions ──────────────────────────────────────────
  /**
   * Approves submitted content.
   *
   * Was contentService.approveLmsItem(), a local mutation pushed through
   * admin-only bulk-sync -- so the approval never reached the database and the
   * instructor's content stayed invisible to students. The server also now refuses
   * self-review, which the old flow permitted.
   */
  approveModerationItem(item: PendingModerationItem): void {
    this.moderate(item.id, true);
  }

  openRejectModal(item: PendingModerationItem): void {
    this.activeRejectItem = item;
    this.rejectionReasonInput = '';
    this.isRejectModalOpen = true;
  }

  closeRejectModal(): void {
    this.isRejectModalOpen = false;
    this.activeRejectItem = null;
  }

  submitRejection(): void {
    if (!this.activeRejectItem || !this.rejectionReasonInput.trim()) return;
    // The reason is required server-side too, so it genuinely reaches the author.
    this.moderate(this.activeRejectItem.id, false, this.rejectionReasonInput.trim());
    this.closeRejectModal();
  }

  /** Scope the course list to a cycle (or 'all') and reload from the server. */
  onCycleChange(): void {
    this.reload();
  }

  /** Human label for a course's cycle, falling back to 'Evergreen'. */
  cycleLabel(competitionId?: string | null): string {
    if (!competitionId) return 'Evergreen';
    const c = this.competitions.find(x => x.id === competitionId);
    return c ? c.title : competitionId;
  }

  // ── Filtered Lists ──────────────────────────────────────────
  //
  // These read server state now. The module / material / assignment / submission /
  // enrolment lists previously came from contentService arrays that default to []
  // and have no backend GET at all, so those five tabs rendered empty regardless
  // of what was in the database.
  //
  // Each getter maps the API's snake_case into the camelCase shape this page's
  // template already binds to. Mapping here rather than renaming ~850 lines of
  // template keeps the change contained and avoids silently blank cells.
  get filteredCourses(): any[] {
    const q = this.searchQuery.toLowerCase();
    return this.authoredCourses
      .filter(c => {
        const matchTrack = this.selectedTrack === 'all' || c.track === this.selectedTrack;
        const matchStatus = this.selectedStatus === 'all' || c.status === this.selectedStatus;
        const matchLevel = this.selectedLevel === 'all' || c.level === this.selectedLevel;
        const matchApproval = this.selectedApprovalFilter === 'all'
          || (c.approval_status || 'approved') === this.selectedApprovalFilter;
        const matchSearch = !q || c.title.toLowerCase().includes(q)
          || (c.description || '').toLowerCase().includes(q);
        return matchTrack && matchStatus && matchLevel && matchApproval && matchSearch;
      })
      .map(c => ({
        ...c,
        approvalStatus: c.approval_status,
        rejectionReason: c.rejection_reason,
        submittedBy: 'You',
        createdAt: c.created_at,
        enrolled: c.enrolled_count,
        // Real figures, straight from the database.
        completion: c.average_progress,
        awaitingGrading: c.awaiting_grading,
        assignmentCount: c.assignment_count,
      }));
  }

  get filteredModules(): any[] {
    const q = this.searchQuery.toLowerCase();
    return this.serverModules
      .filter(m => {
        const matchCourse = this.selectedCourseId === 'all' || m.course_id === this.selectedCourseId;
        const matchSearch = !q || m.title.toLowerCase().includes(q)
          || (m.description || '').toLowerCase().includes(q);
        return matchCourse && matchSearch;
      })
      .map(m => ({
        ...m,
        courseId: m.course_id,
        order: m.order_num,
        submittedBy: 'You',
        approvalStatus: 'approved',
      }));
  }

  get filteredMaterials(): any[] {
    const q = this.searchQuery.toLowerCase();
    return this.serverMaterials
      .filter(m => {
        const matchCourse = this.selectedCourseId === 'all' || m.course_id === this.selectedCourseId;
        const matchSearch = !q || m.title.toLowerCase().includes(q)
          || (m.description || '').toLowerCase().includes(q);
        return matchCourse && matchSearch;
      })
      .map(m => ({
        ...m,
        courseId: m.course_id,
        moduleId: m.module_id,
        submittedBy: 'You',
        approvalStatus: 'approved',
      }));
  }

  get filteredAssignments(): any[] {
    const q = this.searchQuery.toLowerCase();
    return this.serverAssignments
      .filter(a => {
        const matchCourse = this.selectedCourseId === 'all' || a.course_id === this.selectedCourseId;
        const matchTrack = this.selectedTrack === 'all' || a.track === this.selectedTrack;
        const matchSearch = !q || a.title.toLowerCase().includes(q);
        return matchCourse && matchTrack && matchSearch;
      })
      .map(a => ({
        ...a,
        courseId: a.course_id,
        maxScore: a.max_score,
        dueDate: a.due_date,
        submittedBy: 'You',
        approvalStatus: 'approved',
      }));
  }

  /** Submissions awaiting a mark on the caller's own courses. */
  get filteredSubmissions(): any[] {
    const q = this.searchQuery.toLowerCase();
    return this.gradingQueue
      .filter(s => {
        const matchCourse = this.selectedCourseId === 'all' || s.course_id === this.selectedCourseId;
        const matchSearch = !q || (s.student_name || '').toLowerCase().includes(q)
          || (s.student_email || '').toLowerCase().includes(q);
        return matchCourse && matchSearch;
      })
      .map(s => ({
        ...s,
        studentName: s.student_name,
        studentEmail: s.student_email,
        assignmentId: s.assignment_id,
        submittedAt: s.submitted_at,
        courseId: s.course_id,
      }));
  }

  /** The enrolled roster. Needs a specific course selected. */
  get filteredEnrollments(): any[] {
    const q = this.searchQuery.toLowerCase();
    return this.courseRoster
      .filter(e => !q
        || (e.student_name || '').toLowerCase().includes(q)
        || (e.student_email || '').toLowerCase().includes(q))
      .map(e => ({
        ...e,
        studentName: e.student_name || e.student_email || 'Student',
        studentEmail: e.student_email,
        progressPct: e.progress_pct,
        courseId: this.selectedCourseId,
        enrolledAt: e.enrolled_at,
        lastActive: e.last_active,
        averageScore: e.average_score,
      }));
  }

  // ── Lookup Helpers ──────────────────────────────────────────
  // Resolve against server data. These searched contentService arrays that have no
  // backend GET, so every lookup fell through to 'Unassigned' / 'General'.
  getCourseTitle(courseId: string): string {
    const course = this.authoredCourses.find(c => c.id === courseId);
    return course ? course.title : 'Unassigned';
  }

  getModuleTitle(moduleId: string): string {
    const mod = this.serverModules.find(m => m.id === moduleId);
    return mod ? mod.title : 'General';
  }

  getModulesForCourse(courseId: string): ApiLmsModule[] {
    if (!courseId) return [];
    return this.serverModules.filter(m => m.course_id === courseId);
  }

  getAssignmentTitle(assignmentId: string): string {
    const asgn = this.serverAssignments.find(a => a.id === assignmentId);
    return asgn ? asgn.title : 'Assignment';
  }

  // ── Course Actions ──────────────────────────────────────────
  openCourseModal(course?: LmsCourse): void {
    if (course) {
      this.formMode = 'edit';
      this.courseForm = { ...course };
    } else {
      this.formMode = 'create';
      this.courseForm = this.emptyCourse();
    }
    this.isCourseModalOpen = true;
  }

  closeCourseModal(): void {
    this.isCourseModalOpen = false;
  }

  /**
   * Saves a course to the server.
   *
   * The previous version wrote to `contentService.saveLmsCourse()`, which syncs via
   * POST /api/bulk-sync -- an admin-only endpoint. For an instructor the request
   * 403'd, the error was discarded by `error: () => {}`, and the course existed only
   * in that browser's localStorage while this modal closed as if it had saved.
   *
   * It also set `submittedBy = 'Admin'` and `approvalStatus = 'approved'` on the
   * client. The first meant an instructor's own course never matched their "My
   * Courses" filter; the second self-published it. The server now decides both.
   */
  saveCourse(): void {
    if (!this.courseForm.title.trim()) return;
    this.isSaving = true;
    this.saveError = '';

    const payload = {
      title: this.courseForm.title.trim(),
      track: this.courseForm.track || '',
      icon: this.courseForm.icon || 'school',
      level: this.courseForm.level || '',
      description: this.courseForm.description || '',
      modules: this.courseForm.modules || 0,
      competition_id: this.courseForm.competitionId || '',
    };

    const request = this.formMode === 'create'
      ? this.apiService.createAuthoredCourse(payload)
      : this.apiService.updateAuthoredCourse(this.courseForm.id, payload);

    request.subscribe({
      next: () => {
        this.isSaving = false;
        this.closeCourseModal();
        this.reload();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.saveError = this.describeWriteError(err, 'course');
      },
    });
  }

  async deleteCourse(id: string): Promise<void> {
    const ok = await this.dialogService.confirm({
      title: 'Delete Course',
      message: 'Are you sure you want to delete this course and all associated modules, materials, and assignments?',
      confirmText: 'Delete Course',
      type: 'danger'
    });
    if (!ok) return;
    this.apiService.deleteAuthoredCourse(id).subscribe({
      next: () => this.reload(),
      error: (err: any) => {
        // 409 means students are enrolled -- deleting would orphan their work.
        this.saveError = this.describeWriteError(err, 'course');
      },
    });
  }

  /** Turns an HTTP failure into something a human can act on. */
  private describeWriteError(err: any, what: string): string {
    if (err?.status === 403) {
      return `This ${what} belongs to another author, so you cannot change it.`;
    }
    if (err?.status === 409) {
      return err?.error?.detail || `That ${what} is in use and cannot be removed.`;
    }
    if (err?.status === 422) {
      return err?.error?.detail || `Please check the ${what} details.`;
    }
    if (err?.status === 404) {
      return `That ${what} no longer exists. Refreshing.`;
    }
    return `Could not save the ${what}. Nothing was changed -- please try again.`;
  }

  duplicateCourse(course: LmsCourse): void {
    const duplicated: LmsCourse = {
      ...course,
      id: 'crs-' + Date.now(),
      title: course.title + ' (Copy)',
      status: 'draft',
      approvalStatus: 'approved',
      createdAt: new Date().toISOString().split('T')[0]
    };
    this.contentService.saveLmsCourse(duplicated);
  }

  // ── Module Actions ──────────────────────────────────────────
  openModuleModal(mod?: LmsModule): void {
    if (mod) {
      this.formMode = 'edit';
      this.moduleForm = { ...mod };
    } else {
      this.formMode = 'create';
      this.moduleForm = this.emptyModule();
      if (this.selectedCourseId !== 'all') {
        this.moduleForm.courseId = this.selectedCourseId;
      }
    }
    this.isModuleModalOpen = true;
  }

  closeModuleModal(): void {
    this.isModuleModalOpen = false;
  }

  saveModule(): void {
    if (!this.moduleForm.title.trim() || !this.moduleForm.courseId) return;
    this.isSaving = true;
    this.saveError = '';
    // Was contentService.saveLmsModule() -> admin-only bulk-sync -> 403 for an
    // instructor, discarded. There was also NO module endpoint of any kind.
    this.apiService.createModule({
      course_id: this.moduleForm.courseId,
      title: this.moduleForm.title.trim(),
      description: this.moduleForm.description || '',
      order_num: this.moduleForm.order || 1,
      icon: this.moduleForm.icon || 'menu_book',
    }).subscribe({
      next: () => { this.isSaving = false; this.closeModuleModal(); this.reload(); },
      error: (err: any) => {
        this.isSaving = false;
        this.saveError = this.describeWriteError(err, 'module');
      },
    });
  }

  async deleteModule(id: string): Promise<void> {
    const ok = await this.dialogService.confirm({
      title: 'Delete Curriculum Module',
      message: 'Delete this module? Associated materials will also be removed.',
      confirmText: 'Delete Module',
      type: 'danger'
    });
    if (!ok) return;
    this.apiService.deleteModule(id).subscribe({
      next: () => this.reload(),
      error: (err: any) => { this.saveError = this.describeWriteError(err, 'module'); },
    });
  }

  // ── Material Actions ──────────────────────────────────────────
  openMaterialModal(mat?: LmsMaterial): void {
    if (mat) {
      this.formMode = 'edit';
      this.materialForm = { ...mat };
    } else {
      this.formMode = 'create';
      this.materialForm = this.emptyMaterial();
      if (this.selectedCourseId !== 'all') {
        this.materialForm.courseId = this.selectedCourseId;
      }
    }
    this.isMaterialModalOpen = true;
  }

  closeMaterialModal(): void {
    this.isMaterialModalOpen = false;
  }

  saveMaterial(): void {
    if (!this.materialForm.title.trim() || !this.materialForm.courseId) return;
    this.isSaving = true;
    this.saveError = '';
    this.apiService.createMaterial({
      course_id: this.materialForm.courseId,
      module_id: this.materialForm.moduleId || '',
      title: this.materialForm.title.trim(),
      type: this.materialForm.type || 'link',
      url: this.materialForm.url || '',
      description: this.materialForm.description || '',
    }).subscribe({
      next: () => { this.isSaving = false; this.closeMaterialModal(); this.reload(); },
      error: (err: any) => {
        this.isSaving = false;
        this.saveError = this.describeWriteError(err, 'material');
      },
    });
  }

  async deleteMaterial(id: string): Promise<void> {
    const ok = await this.dialogService.confirm({
      title: 'Delete Learning Asset',
      message: 'Delete this learning material?',
      confirmText: 'Delete Asset',
      type: 'danger'
    });
    if (!ok) return;
    this.apiService.deleteMaterial(id).subscribe({
      next: () => this.reload(),
      error: (err: any) => { this.saveError = this.describeWriteError(err, 'material'); },
    });
  }

  // ── Assignment Actions ──────────────────────────────────────────
  openAssignmentModal(asgn?: LmsAssignment): void {
    if (asgn) {
      this.formMode = 'edit';
      this.assignmentForm = { ...asgn };
    } else {
      this.formMode = 'create';
      this.assignmentForm = this.emptyAssignment();
      if (this.selectedCourseId !== 'all') {
        this.assignmentForm.courseId = this.selectedCourseId;
      }
    }
    this.isAssignmentModalOpen = true;
  }

  closeAssignmentModal(): void {
    this.isAssignmentModalOpen = false;
  }

  saveAssignment(): void {
    if (!this.assignmentForm.title.trim() || !this.assignmentForm.courseId) return;
    this.isSaving = true;
    this.saveError = '';
    this.apiService.createAssignment({
      course_id: this.assignmentForm.courseId,
      title: this.assignmentForm.title.trim(),
      description: this.assignmentForm.description || '',
      due_date: this.assignmentForm.dueDate || '',
      max_score: this.assignmentForm.maxScore || 100,
      track: this.assignmentForm.track || '',
    }).subscribe({
      next: () => { this.isSaving = false; this.closeAssignmentModal(); this.reload(); },
      error: (err: any) => {
        this.isSaving = false;
        this.saveError = this.describeWriteError(err, 'assignment');
      },
    });
  }

  async deleteAssignment(id: string): Promise<void> {
    const ok = await this.dialogService.confirm({
      title: 'Delete Assignment',
      message: 'Delete this assignment?',
      confirmText: 'Delete Assignment',
      type: 'danger'
    });
    if (!ok) return;
    this.apiService.deleteAssignment(id).subscribe({
      next: () => this.reload(),
      error: (err: any) => {
        // 409 means students have already submitted work against it.
        this.saveError = this.describeWriteError(err, 'assignment');
      },
    });
  }

  adminRevisionNotes = '';
  gradeScore: number | null = null;

  // ── Submission Grading Desk ─────────────────────────────────────
  openGradingModal(submission: any): void {
    this.activeSubmission = submission;
    this.adminRevisionNotes = submission?.feedback || '';
    this.gradeScore = submission?.score ?? null;
    this.isGradingModalOpen = true;
  }

  closeGradingModal(): void {
    this.isGradingModalOpen = false;
    this.activeSubmission = null;
    this.adminRevisionNotes = '';
    this.gradeScore = null;
  }

  /**
   * Records a mark against a student's submission.
   *
   * Was contentService.gradeLmsSubmission(), which set `sub.score` on a local
   * object and pushed the array through admin-only bulk-sync. The mark never left
   * the browser, and no read path existed for the student even if it had -- so a
   * grade and its feedback were invisible to the person they were written for.
   *
   * The 0-100 bound below was also wrong: assignments carry their own max_score.
   */
  gradeSubmission(): void {
    if (!this.activeSubmission || this.gradeScore === null) return;
    const max = this.activeSubmission.max_score ?? 100;
    if (this.gradeScore < 0 || this.gradeScore > max) {
      this.saveError = `Score must be between 0 and ${max}.`;
      return;
    }
    this.isSaving = true;
    this.saveError = '';
    this.apiService.gradeLmsSubmission(
      this.activeSubmission.id, this.gradeScore, this.adminRevisionNotes || '',
    ).subscribe({
      next: () => { this.isSaving = false; this.closeGradingModal(); this.reload(); },
      error: (err: any) => {
        this.isSaving = false;
        this.saveError = err?.status === 403
          ? 'You can only grade work submitted on your own courses.'
          : this.describeWriteError(err, 'grade');
      },
    });
  }


  /**
   * Sends the work back to the student for revision.
   *
   * Both of the handlers this replaces (`submitInstructorRegradeRequest` and
   * `rejectSubmissionToStudent`) called ContentService methods that mutated a local
   * object and then pushed the array through admin-only bulk-sync. The student was
   * never told anything, and the work stayed in the queue looking untouched.
   *
   * No score is recorded, so the submission correctly remains outstanding.
   */
  returnForRevision(): void {
    if (!this.activeSubmission || !this.adminRevisionNotes.trim()) {
      this.saveError = 'Explain what needs changing before sending it back.';
      return;
    }
    this.isSaving = true;
    this.saveError = '';
    this.apiService.returnLmsSubmission(
      this.activeSubmission.id, this.adminRevisionNotes.trim(),
    ).subscribe({
      next: () => { this.isSaving = false; this.closeGradingModal(); this.reload(); },
      error: (err: any) => {
        this.isSaving = false;
        this.saveError = err?.status === 403
          ? 'You can only review work submitted on your own courses.'
          : this.describeWriteError(err, 'revision request');
      },
    });
  }

  /** Kept as aliases so both existing template buttons keep working. */
  submitInstructorRegradeRequest(): void { this.returnForRevision(); }
  rejectSubmissionToStudent(): void { this.returnForRevision(); }

  // ── Empty Model Factories ──────────────────────────────────────────
  private emptyCourse(): LmsCourse {
    return {
      id: '',
      title: '',
      track: 'coding',
      icon: 'school',
      level: 'Beginner',
      description: '',
      modules: 0,
      enrolled: 0,
      completion: 0,
      status: 'active',
      approvalStatus: 'approved',
      createdAt: new Date().toISOString().split('T')[0],
      competitionId: ''
    };
  }

  private emptyModule(): LmsModule {
    return {
      id: '',
      courseId: '',
      title: '',
      description: '',
      order: 1,
      icon: 'view_module',
      status: 'published',
      approvalStatus: 'approved'
    };
  }

  private emptyMaterial(): LmsMaterial {
    return {
      id: '',
      courseId: '',
      moduleId: '',
      title: '',
      type: 'document',
      url: '',
      description: '',
      approvalStatus: 'approved',
      createdAt: new Date().toISOString().split('T')[0]
    };
  }

  private emptyAssignment(): LmsAssignment {
    return {
      id: '',
      courseId: '',
      title: '',
      description: '',
      dueDate: new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0],
      maxScore: 100,
      track: 'coding',
      status: 'active',
      approvalStatus: 'approved',
      createdAt: new Date().toISOString().split('T')[0]
    };
  }
}
