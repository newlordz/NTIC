import { Component, ChangeDetectionStrategy, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { getAuthValue } from '../../services/session.util';
import { ContentService, LmsCourse, LmsModule, LmsMaterial, LmsAssignment, LmsSubmission, LmsEnrollment } from '../../services/content.service';
import { DialogService } from '../../services/dialog.service';
import {
  ApiService, AuthoredCourse, GradingQueueItem, CourseStudent, ModerationQueueItem,
  LmsModule as ApiLmsModule, LmsMaterial as ApiLmsMaterial,
  LmsAssignment as LmsAssignmentApi, LmsAnnouncement, LmsQA
} from '../../services/api.service';

import { CurrentUserService } from '../../services/current-user.service';

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

export interface ModuleBlock {
  id: string;
  type: 'text' | 'video' | 'quiz' | 'code' | 'break' | 'resource' | 'image' | 'file';
  title?: string;
  content?: string;
  url?: string;
  fileName?: string;
  fileSize?: string;
  mimeType?: string;
  videoDuration?: number;
  videoTakeaway?: string;
  videoSource?: 'url' | 'upload';
  quizQuestion?: string;
  quizOptions?: string[];
  quizCorrectIndex?: number;
  quizExplanation?: string;
  codeLanguage?: string;
  codeStarter?: string;
  codeInstructions?: string;
  breakLabel?: string;
  breakRequirement?: 'read' | 'pass_quiz' | 'none';
  isEditing?: boolean;
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
  activeTab: string = 'courses';

  // ── Dedicated Full-Page Workspaces Navigation ───────────────
  currentView: 'hub' | 'course_console' | 'module_studio' | 'course_wizard' = 'hub';
  activeDetailCourse: any = null;
  activeDetailModule: any = null;
  courseConsoleTab: 'modules' | 'materials' | 'assignments' | 'students' = 'modules';
  showCourseInsights = false;

  // 1-at-a-time Progressive Course Wizard
  courseWizardStep = 1; // 1: Title, 2: Track, 3: Difficulty & Level, 4: Scope & Summary

  // Module Visual Block Canvas Subsystem
  moduleBlocks: ModuleBlock[] = [];
  selectedBlockId: string | null = null;
  editingBlockId: string | null = null;
  isCanvasPreviewMode = false;
  isUploadingBlockFile: { [blockId: string]: boolean } = {};

  get activeRoleId(): string {
    return (getAuthValue('activeRoleId') || '').toLowerCase();
  }

  get isInstructor(): boolean {
    return this.activeRoleId === 'instructor';
  }

  get isAdmin(): boolean {
    return ['super_admin', 'admin', 'content_manager'].includes(this.activeRoleId);
  }

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

  trackOptions = [
    { id: 'coding', label: 'Coding & Algorithms', icon: 'terminal', color: '#6366f1' },
    { id: 'robotics', label: 'Robotics & Automation', icon: 'smart_toy', color: '#0ea5e9' },
    { id: 'ai', label: 'Artificial Intelligence', icon: 'psychology', color: '#a855f7' },
    { id: 'cyber', label: 'Cybersecurity & Networks', icon: 'shield', color: '#10b981' },
    { id: 'innovation', label: 'Innovation & Tech', icon: 'lightbulb', color: '#f59e0b' }
  ];

  presetIcons = [
    'school', 'terminal', 'code', 'data_object', 'smart_toy', 'psychology', 'shield', 'memory', 'hub', 'rocket_launch'
  ];

  selectCourseTrack(trackId: string): void {
    this.courseForm.track = trackId;
    const match = this.trackOptions.find(t => t.id === trackId);
    if (match && (!this.courseForm.icon || this.courseForm.icon === 'school')) {
      this.courseForm.icon = match.icon;
    }
  }

  selectCourseIcon(icon: string): void {
    this.courseForm.icon = icon;
  }

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
    private apiService: ApiService,
    private currentUserService: CurrentUserService,
    private route: ActivatedRoute,
    private sanitizer: DomSanitizer,
    public cdr: ChangeDetectorRef
  ) {}

  get isStaffReviewer(): boolean {
    const role = (this.currentUserService.profile()?.role || this.activeRoleId).toLowerCase();
    return ['admin', 'super_admin', 'superadmin', 'content_manager', 'reviewer'].includes(role);
  }

  ngOnInit(): void {
    if (this.isAdmin) {
      this.activeTab = 'courses';
    }
    this.route.queryParams.subscribe(params => {
      if (params['tab'] && ['approvals', 'courses', 'modules', 'materials', 'assignments', 'students', 'announcements', 'qa'].includes(params['tab'])) {
        if (params['tab'] === 'approvals' && !this.isStaffReviewer) {
          this.activeTab = 'courses';
        } else {
          this.activeTab = params['tab'];
        }
      }
      if (params['action'] === 'create_course' || params['createCourse'] === 'true') {
        this.activeTab = 'courses';
        this.openCourseModal();
      }
      this.cdr.markForCheck();
    });
    this.currentUserService.ensureLoaded().subscribe(() => {
      this.reload();
      this.cdr.markForCheck();
    });
  }

  /** Reloads everything this page shows from the server. */
  reload(): void {
    this.isLoading = true;
    this.loadError = '';
    this.cdr.markForCheck();

    // Cycles are needed to label and filter courses. A failure here must not
    // take the page down, so it is tolerated.
    this.apiService.getCompetitions().subscribe({
      next: rows => {
        this.competitions = (rows || [])
          .map(c => ({ id: c.id, title: c.title }))
          .sort((a, b) => a.title.localeCompare(b.title));
        this.cdr.markForCheck();
      },
      error: () => {
        this.competitions = [];
        this.cdr.markForCheck();
      }
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
            next: mods => {
              this.serverModules = [...this.serverModules, ...(mods || [])];
              this.cdr.markForCheck();
            },
            error: () => { /* per-course failure is not fatal */ },
          });
          this.apiService.getMaterials(c.id).subscribe({
            next: mats => {
              this.serverMaterials = [...this.serverMaterials, ...(mats || [])];
              this.cdr.markForCheck();
            },
            error: () => { /* per-course failure is not fatal */ },
          });
          this.apiService.getLmsAssignments(c.id).subscribe({
            next: asgns => {
              this.serverAssignments = [...this.serverAssignments, ...(asgns || [])];
              this.cdr.markForCheck();
            },
            error: () => { /* per-course failure is not fatal */ },
          });
        }
        this.cdr.markForCheck();
      },
      error: err => {
        this.isLoading = false;
        this.loadError = err?.status === 403
          ? 'Your account is not permitted to author LMS content.'
          : 'Could not load your courses. Check your connection and try again.';
        this.cdr.markForCheck();
      },
    });

    this.apiService.getGradingQueue().subscribe({
      next: rows => {
        this.gradingQueue = rows || [];
        this.cdr.markForCheck();
      },
      error: () => { /* surfaced by the course load above */ },
    });

    if (this.isStaffReviewer) {
      this.apiService.getModerationQueue().subscribe({
        next: rows => {
          this.moderationQueue = rows || [];
          this.cdr.markForCheck();
        },
        // Instructors are not reviewers, so a 403 here is expected and not an error.
        error: () => {
          this.moderationQueue = [];
          this.cdr.markForCheck();
        },
      });
    } else {
      this.moderationQueue = [];
      if (this.activeTab === 'approvals') {
        this.activeTab = 'courses';
      }
      this.cdr.markForCheck();
    }

    this.loadAnnouncementsForCourse(this.selectedCourseId);
    this.loadQAForCourse(this.selectedCourseId);

    if (this.selectedCourseId && this.selectedCourseId !== 'all') {
      this.loadRoster(this.selectedCourseId);
    }
  }

  serverAnnouncements: LmsAnnouncement[] = [];
  serverQA: LmsQA[] = [];
  isAnnouncementModalOpen = false;
  announcementForm = {
    course_id: '',
    title: '',
    content: '',
    is_urgent: false
  };
  qaReplyDraft: { [qaId: string]: string } = {};
  isPostingReply: { [qaId: string]: boolean } = {};

  onCourseFilterChange(courseId: string): void {
    this.selectedCourseId = courseId;
    this.loadRoster(courseId);
    this.loadQAForCourse(courseId);
    this.loadAnnouncementsForCourse(courseId);
  }

  loadAnnouncementsForCourse(courseId: string = 'all'): void {
    const targetCourse = courseId === 'all' ? undefined : courseId;
    this.apiService.getLmsAnnouncements(targetCourse).subscribe({
      next: rows => {
        this.serverAnnouncements = rows || [];
        this.cdr.markForCheck();
      },
      error: () => {
        this.serverAnnouncements = [];
        this.cdr.markForCheck();
      }
    });
  }

  loadQAForCourse(courseId: string = 'all'): void {
    const targetCourse = courseId === 'all' ? undefined : courseId;
    this.apiService.getLmsQA(targetCourse).subscribe({
      next: rows => {
        this.serverQA = rows || [];
        this.cdr.markForCheck();
      },
      error: () => {
        this.serverQA = [];
        this.cdr.markForCheck();
      }
    });
  }

  openAnnouncementModal(courseId?: string): void {
    const preselected = courseId || (this.selectedCourseId !== 'all' ? this.selectedCourseId : (this.authoredCourses[0]?.id || ''));
    this.announcementForm = {
      course_id: preselected,
      title: '',
      content: '',
      is_urgent: false
    };
    this.isAnnouncementModalOpen = true;
    this.cdr.markForCheck();
  }

  closeAnnouncementModal(): void {
    this.isAnnouncementModalOpen = false;
    this.cdr.markForCheck();
  }

  saveAnnouncement(): void {
    if (!this.announcementForm.title.trim() || !this.announcementForm.content.trim() || !this.announcementForm.course_id || this.isSaving) return;
    this.isSaving = true;
    this.saveError = '';
    this.cdr.markForCheck();
    this.apiService.createLmsAnnouncement(this.announcementForm).subscribe({
      next: ann => {
        this.serverAnnouncements.unshift(ann);
        this.isSaving = false;
        this.closeAnnouncementModal();
        this.cdr.markForCheck();
      },
      error: err => {
        this.isSaving = false;
        this.saveError = this.describeWriteError(err, 'announcement');
        this.cdr.markForCheck();
      }
    });
  }

  deleteAnnouncement(id: string): void {
    this.apiService.deleteLmsAnnouncement(id).subscribe({
      next: () => {
        this.serverAnnouncements = this.serverAnnouncements.filter(a => a.id !== id);
        this.cdr.markForCheck();
      }
    });
  }

  submitQAReply(parentQa: LmsQA): void {
    const text = (this.qaReplyDraft[parentQa.id] || '').trim();
    if (!text) return;
    this.isPostingReply[parentQa.id] = true;
    this.apiService.createLmsQA({
      course_id: parentQa.course_id,
      module_id: parentQa.module_id,
      content: text,
      parent_id: parentQa.id
    }).subscribe({
      next: reply => {
        this.serverQA.push(reply);
        this.qaReplyDraft[parentQa.id] = '';
        this.isPostingReply[parentQa.id] = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isPostingReply[parentQa.id] = false;
        this.cdr.markForCheck();
      }
    });
  }

  deleteQAPost(id: string): void {
    this.apiService.deleteLmsQA(id).subscribe({
      next: () => {
        this.serverQA = this.serverQA.filter(q => q.id !== id && q.parent_id !== id);
        this.cdr.markForCheck();
      }
    });
  }

  getRepliesForQA(parentId: string): LmsQA[] {
    return this.serverQA.filter(q => q.parent_id === parentId);
  }

  getRootQuestions(): LmsQA[] {
    return this.serverQA.filter(q => !q.parent_id);
  }

  getCourseName(courseId: string): string {
    const found = this.authoredCourses.find(c => c.id === courseId);
    return found ? found.title : 'Course';
  }

  filterMentoredOnly: boolean = false;

  /** Loads the enrolled roster for one course or all authored courses. */
  loadRoster(courseId: string = 'all'): void {
    if (!courseId || courseId === 'all') {
      if (!this.authoredCourses.length) {
        this.courseRoster = [];
        this.cdr.markForCheck();
        return;
      }
      const requests = this.authoredCourses.map(c => this.apiService.getCourseStudents(c.id).pipe(catchError(() => of([]))));
      forkJoin(requests).subscribe({
        next: results => {
          const combined: CourseStudent[] = [];
          const seen = new Set<string>();
          results.forEach((rows, idx) => {
            const course = this.authoredCourses[idx];
            (rows || []).forEach(r => {
              const key = `${r.student_id}-${course.id}`;
              if (!seen.has(key)) {
                seen.add(key);
                combined.push({ ...r, course_id: course.id } as any);
              }
            });
          });
          this.courseRoster = combined;
          this.cdr.markForCheck();
        },
        error: () => {
          this.courseRoster = [];
          this.cdr.markForCheck();
        }
      });
      return;
    }
    this.apiService.getCourseStudents(courseId).subscribe({
      next: rows => {
        this.courseRoster = (rows || []).map(r => ({ ...r, course_id: courseId } as any));
        this.cdr.markForCheck();
      },
      error: () => {
        this.courseRoster = [];
        this.cdr.markForCheck();
      },
    });
  }

  exportGradebookCsv(): void {
    const list = this.filteredEnrollments;
    if (!list.length) return;

    const headers = ['Student Name', 'Email', 'Course', 'Progress (%)', 'Status', 'Enrolled Date', 'Last Active', 'Average Score'];
    const rows = list.map(s => [
      `"${(s.studentName || '').replace(/"/g, '""')}"`,
      `"${(s.studentEmail || '').replace(/"/g, '""')}"`,
      `"${(this.getCourseTitle(s.courseId) || '').replace(/"/g, '""')}"`,
      s.progressPct ?? 0,
      `"${(s.status || 'active').replace(/"/g, '""')}"`,
      `"${(s.enrolledAt || '').replace(/"/g, '""')}"`,
      `"${(s.lastActive || '').replace(/"/g, '""')}"`,
      s.averageScore !== null && s.averageScore !== undefined ? s.averageScore : 'N/A',
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `NTIC_Gradebook_Export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  exportGradingQueueCsv(): void {
    const list = this.filteredSubmissions;
    if (!list.length) return;

    const headers = ['Student Name', 'Student Email', 'Assignment', 'Submitted At', 'Status', 'Score', 'Repo URL'];
    const rows = list.map(s => [
      `"${(s.studentName || '').replace(/"/g, '""')}"`,
      `"${(s.studentEmail || '').replace(/"/g, '""')}"`,
      `"${(this.getAssignmentTitle(s.assignmentId) || '').replace(/"/g, '""')}"`,
      `"${(s.submittedAt || '').replace(/"/g, '""')}"`,
      `"${(s.status || 'submitted').replace(/"/g, '""')}"`,
      s.score !== null && s.score !== undefined ? s.score : 'Pending',
      `"${(s.url || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `NTIC_Grading_Queue_Export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
  get coursesList(): any[] {
    return this.authoredCourses.length ? this.authoredCourses : this.contentService.lmsCourses;
  }

  getCourseById(courseId: string): any {
    return this.authoredCourses.find(c => c.id === courseId) || this.contentService.lmsCourses.find((c: any) => c.id === courseId) || { id: courseId, title: 'Course' };
  }

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
      .map(c => {
        const modulesCount = this.getModulesForCourse(c.id).length || 0;
        return {
          ...c,
          modules: modulesCount,
          modulesCount: modulesCount,
          approvalStatus: c.approval_status,
          rejectionReason: c.rejection_reason,
          submittedBy: 'You',
          createdAt: c.created_at,
          enrolled: c.enrolled_count ?? 0,
          // Real figures, straight from the database.
          completion: c.average_progress ?? 0,
          awaitingGrading: c.awaiting_grading ?? 0,
          assignmentCount: c.assignment_count ?? 0,
        };
      });
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

  /** The enrolled roster across selected course or all authored courses. */
  get filteredEnrollments(): any[] {
    const q = this.searchQuery.toLowerCase();
    return this.courseRoster
      .filter(e => {
        const matchCourse = this.selectedCourseId === 'all' || (e as any).course_id === this.selectedCourseId;
        const matchSearch = !q
          || (e.student_name || '').toLowerCase().includes(q)
          || (e.student_email || '').toLowerCase().includes(q);
        return matchCourse && matchSearch;
      })
      .map(e => ({
        ...e,
        studentName: e.student_name || e.student_email || 'Student',
        studentEmail: e.student_email,
        progressPct: e.progress_pct,
        courseId: (e as any).course_id || this.selectedCourseId,
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

  // ── Progressive Step State for Modals (1-2 fields at a time) ──────
  courseStudioStep: number = 1;
  moduleStep: number = 1;
  materialStep: number = 1;
  assignmentStep: number = 1;

  setCourseStudioStep(step: number): void {
    this.courseStudioStep = step;
    this.cdr.markForCheck();
  }

  setModuleStep(step: number): void {
    this.moduleStep = step;
    this.cdr.markForCheck();
  }

  setMaterialStep(step: number): void {
    this.materialStep = step;
    this.cdr.markForCheck();
  }

  setAssignmentStep(step: number): void {
    this.assignmentStep = step;
    this.cdr.markForCheck();
  }

  getAssignmentsForCourse(courseId?: string): any[] {
    if (!courseId) return [];
    return this.serverAssignments.filter(a => a.course_id === courseId);
  }

  getMaterialsForCourse(courseId?: string): ApiLmsMaterial[] {
    if (!courseId) return [];
    return this.serverMaterials.filter(m => m.course_id === courseId);
  }

  getMaterialsForModule(moduleId?: string): ApiLmsMaterial[] {
    if (!moduleId) return [];
    return this.serverMaterials.filter(m => m.module_id === moduleId);
  }

  get filteredRoster(): LmsEnrollment[] {
    return this.filteredEnrollments;
  }

  getStudentsForCourse(courseId?: string): LmsEnrollment[] {
    if (!courseId) return this.filteredEnrollments;
    return this.filteredEnrollments.filter(e => e.courseId === courseId);
  }

  // ── Full-Page Dedicated Workspaces ──────────────────────────
  openCourseConsole(course: any): void {
    this.activeDetailCourse = course;
    this.selectedCourseId = course.id;
    this.currentView = 'course_console';
    this.courseConsoleTab = 'modules';
    this.showCourseInsights = false;
    this.cdr.markForCheck();
  }

  exitCourseConsole(): void {
    this.currentView = 'hub';
    this.activeDetailCourse = null;
    this.selectedCourseId = 'all';
    this.showCourseInsights = false;
    this.cdr.markForCheck();
  }

  openCourseWizard(course?: any): void {
    this.saveError = '';
    this.courseWizardStep = 1;
    if (course) {
      this.formMode = 'edit';
      this.courseForm = { ...course };
    } else {
      this.formMode = 'create';
      this.courseForm = this.emptyCourse();
      if (this.selectedTrack !== 'all') {
        this.selectCourseTrack(this.selectedTrack);
      }
    }
    this.currentView = 'course_wizard';
    this.cdr.markForCheck();
  }

  exitCourseWizard(): void {
    this.currentView = this.activeDetailCourse ? 'course_console' : 'hub';
    this.courseWizardStep = 1;
    this.saveError = '';
    this.cdr.markForCheck();
  }

  nextCourseWizardStep(): void {
    if (this.courseWizardStep === 1 && !this.courseForm.title.trim()) return;
    if (this.courseWizardStep < 4) {
      this.courseWizardStep++;
      this.cdr.markForCheck();
    }
  }

  prevCourseWizardStep(): void {
    if (this.courseWizardStep > 1) {
      this.courseWizardStep--;
      this.cdr.markForCheck();
    }
  }

  saveCourseFromWizard(): void {
    if (this.isSaving) return;
    if (!this.courseForm.title.trim()) return;
    this.isSaving = true;
    this.saveError = '';
    this.cdr.markForCheck();

    const payload = {
      title: this.courseForm.title.trim(),
      track: this.courseForm.track || 'coding',
      icon: this.courseForm.icon || 'school',
      level: this.courseForm.level || 'Beginner',
      description: this.courseForm.description || '',
      modules: Number(this.courseForm.modules) || 0,
      competition_id: (this.selectedCycle !== 'all' ? this.selectedCycle : ''),
    };

    const request = this.formMode === 'create'
      ? this.apiService.createAuthoredCourse(payload)
      : this.apiService.updateAuthoredCourse(this.courseForm.id, payload);

    request.subscribe({
      next: (createdOrUpdated: any) => {
        this.isSaving = false;
        this.reload();
        this.activeDetailCourse = {
          ...this.courseForm,
          id: createdOrUpdated?.id || this.courseForm.id,
          enrolled_count: this.activeDetailCourse?.enrolled_count || 0,
          average_progress: this.activeDetailCourse?.average_progress || 0,
          assignment_count: this.activeDetailCourse?.assignment_count || 0,
          awaiting_grading: this.activeDetailCourse?.awaiting_grading || 0
        };
        this.currentView = 'course_console';
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.saveError = this.describeWriteError(err, 'course');
        this.cdr.markForCheck();
      },
    });
  }

  trackByIndex(index: number, item: any): number {
    return index;
  }

  private parseMaterialToBlock(mat: ApiLmsMaterial): ModuleBlock {
    let rawPayload = mat.description || '';
    let parsed: any = null;

    // Recursively unwrap any previously nested JSON strings
    while (typeof rawPayload === 'string' && rawPayload.trim().startsWith('{')) {
      try {
        const next = JSON.parse(rawPayload);
        parsed = { ...parsed, ...next };
        if (typeof next.instructions === 'string') {
          rawPayload = next.instructions;
        } else if (typeof next.overview === 'string') {
          rawPayload = next.overview;
        } else if (typeof next.caption === 'string') {
          rawPayload = next.caption;
        } else {
          rawPayload = '';
          break;
        }
      } catch {
        break;
      }
    }

    let bType: ModuleBlock['type'] = 'text';
    const declaredType = (mat.type || '').toLowerCase();
    const widgetType = (parsed?.widget || '').toLowerCase();

    if (declaredType === 'guide' || declaredType === 'text' || widgetType === 'text' || widgetType === 'guide') {
      bType = 'text';
    } else if (declaredType === 'video' || widgetType === 'video') {
      bType = 'video';
    } else if (declaredType === 'quiz' || widgetType === 'quiz') {
      bType = 'quiz';
    } else if (declaredType === 'code' || widgetType === 'code') {
      bType = 'code';
    } else if (declaredType === 'image' || widgetType === 'image') {
      bType = 'image';
    } else if (declaredType === 'file' || declaredType === 'document' || widgetType === 'file') {
      bType = 'file';
    } else if (declaredType === 'break' || widgetType === 'break') {
      bType = 'break';
    }

    let contentText = typeof rawPayload === 'string' ? rawPayload : '';
    if (contentText.trim().startsWith('{') && contentText.includes('"widget"')) {
      contentText = '';
    }

    return {
      id: mat.id,
      type: bType,
      title: mat.title || '',
      content: contentText,
      url: mat.url || '',
      fileName: parsed?.fileName || '',
      fileSize: parsed?.fileSize || '',
      mimeType: parsed?.mimeType || '',
      videoDuration: parsed?.durationMinutes || 15,
      videoTakeaway: parsed?.keyTakeaway || '',
      videoSource: parsed?.source || (mat.url?.includes('files/') ? 'upload' : 'url'),
      quizQuestion: parsed?.question || mat.title || '',
      quizOptions: (Array.isArray(parsed?.options) && parsed.options.length) ? parsed.options : ['Option A', 'Option B', 'Option C', 'Option D'],
      quizCorrectIndex: parsed?.correctIndex ?? 0,
      quizExplanation: parsed?.explanation || '',
      codeLanguage: parsed?.language || 'python',
      codeStarter: parsed?.starterCode || '# Starter code\n',
      codeInstructions: parsed?.instructions || contentText,
      breakLabel: parsed?.breakLabel || 'Module Checkpoint'
    };
  }

  // ── Dedicated Module Visual Block Studio ────────────────────
  openModuleStudio(mod?: any): void {
    this.saveError = '';
    this.isCanvasPreviewMode = false;
    if (mod) {
      this.formMode = 'edit';
      this.activeDetailModule = { ...mod };
      this.moduleForm = { ...mod, courseId: mod.course_id || mod.courseId || this.activeDetailCourse?.id };
      
      // Load blocks from materials or description
      const modMats = this.serverMaterials.filter(m => m.module_id === mod.id);
      if (modMats.length > 0) {
        this.moduleBlocks = modMats.map(mat => this.parseMaterialToBlock(mat));
      } else {
        this.moduleBlocks = [
          {
            id: 'blk-' + Math.random().toString(36).slice(2, 7),
            type: 'text',
            title: 'Lesson Overview & Core Principles',
            content: mod.description || 'Welcome to this curriculum module. Outline the key technical concepts here.'
          },
          {
            id: 'blk-' + Math.random().toString(36).slice(2, 7),
            type: 'break',
            breakLabel: 'Reading Checkpoint: Comprehension Check'
          },
          {
            id: 'blk-' + Math.random().toString(36).slice(2, 7),
            type: 'quiz',
            quizQuestion: 'What is the primary algorithmic complexity constraint for this checkpoint?',
            quizOptions: ['O(log N)', 'O(N^2)', 'O(2^N)', 'O(N!)'],
            quizCorrectIndex: 0,
            quizExplanation: 'Logarithmic time complexity is required to avoid race conditions.'
          }
        ];
      }
    } else {
      this.formMode = 'create';
      const cId = this.activeDetailCourse?.id || this.selectedCourseId;
      const existingMods = this.getModulesForCourse(cId);
      const nextOrder = existingMods.length ? Math.max(...existingMods.map(m => m.order_num || 0)) + 1 : 1;
      this.activeDetailModule = {
        id: '',
        course_id: cId,
        title: '',
        description: '',
        order_num: nextOrder,
        icon: 'view_module'
      };
      this.moduleForm = {
        id: '',
        courseId: cId,
        title: '',
        description: '',
        order: nextOrder,
        icon: 'view_module',
        status: 'published',
        approvalStatus: 'approved'
      };
      this.moduleBlocks = [
        {
          id: 'blk-' + Math.random().toString(36).slice(2, 7),
          type: 'text',
          title: 'Section 1: Theoretical Foundation',
          content: 'Introduce the core topic, mathematical formulas, or architecture diagrams here.'
        }
      ];
    }
    this.currentView = 'module_studio';
    this.selectedBlockId = this.moduleBlocks[0]?.id || null;
    this.cdr.markForCheck();
  }

  exitModuleStudio(): void {
    this.currentView = this.activeDetailCourse ? 'course_console' : 'hub';
    this.activeDetailModule = null;
    this.moduleBlocks = [];
    this.cdr.markForCheck();
  }

  setEditingBlock(blockId: string | null): void {
    this.editingBlockId = blockId;
    this.cdr.markForCheck();
  }

  applyFormatting(blk: ModuleBlock, format: string): void {
    if (!blk.content) blk.content = '';
    switch (format) {
      case 'bold':
        blk.content += ' **Bold Text** ';
        break;
      case 'italic':
        blk.content += ' *Italic Text* ';
        break;
      case 'h2':
        blk.content += '\n## Section Heading\n';
        break;
      case 'h3':
        blk.content += '\n### Subsection Title\n';
        break;
      case 'list':
        blk.content += '\n- Item 1\n- Item 2\n- Item 3\n';
        break;
      case 'numlist':
        blk.content += '\n1. First Step\n2. Second Step\n3. Third Step\n';
        break;
      case 'code':
        blk.content += '\n```\n// Code snippet\nconst x = 10;\n```\n';
        break;
      case 'quote':
        blk.content += '\n> Important core takeaway or definition to remember.\n';
        break;
      case 'callout':
        blk.content += '\n> 💡 **Tip / Operational Note**: Add essential technical best practice here.\n';
        break;
    }
    this.cdr.markForCheck();
  }

  onBlockFileUpload(event: Event, blk: ModuleBlock): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    this.isUploadingBlockFile[blk.id] = true;
    this.cdr.markForCheck();

    this.apiService.uploadFileBlob(file).subscribe({
      next: res => {
        blk.url = res.url;
        blk.fileName = file.name;
        blk.fileSize = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
        blk.mimeType = file.type;
        if (!blk.title || blk.title.startsWith('Accompanying') || blk.title.startsWith('Diagram')) {
          blk.title = file.name;
        }
        this.isUploadingBlockFile[blk.id] = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isUploadingBlockFile[blk.id] = false;
        this.cdr.markForCheck();
      }
    });
  }

  addBlock(type: ModuleBlock['type']): void {
    const newBlk: ModuleBlock = {
      id: 'blk-' + Math.random().toString(36).slice(2, 8),
      type,
      title: type === 'video' ? 'Video Lecture' :
             type === 'quiz' ? 'Knowledge Check Question' :
             type === 'code' ? 'Code Challenge' :
             type === 'break' ? 'Section Break' :
             type === 'image' ? 'Diagram / Architecture Figure' :
             type === 'file' ? 'Accompanying Document / PDF' : 'Lesson Guide & Theory',
      content: '',
      quizOptions: type === 'quiz' ? ['Choice A', 'Choice B', 'Choice C', 'Choice D'] : undefined,
      quizCorrectIndex: 0,
      codeLanguage: 'python',
      codeStarter: '# Write solution\ndef solve():\n    pass\n',
      breakLabel: 'Milestone Checkpoint',
      videoSource: 'url'
    };
    this.moduleBlocks.push(newBlk);
    this.selectedBlockId = newBlk.id;
    this.editingBlockId = newBlk.id;
    this.cdr.markForCheck();
  }

  // ── AI Curriculum Copilot ──────────────────────────────────
  isGeneratingAiQuiz: { [blockId: string]: boolean } = {};
  isGeneratingNewAiQuiz = false;

  generateAiQuizForBlock(blk: ModuleBlock): void {
    if (!blk || this.isGeneratingAiQuiz[blk.id]) return;
    this.isGeneratingAiQuiz[blk.id] = true;
    this.cdr.markForCheck();

    let guideContext = blk.content || '';
    if (!guideContext.trim()) {
      const guideBlocks = this.moduleBlocks.filter(b => b.type === 'text' && b.content?.trim());
      guideContext = guideBlocks.map(b => `${b.title}\n${b.content}`).join('\n\n');
    }
    if (!guideContext.trim()) {
      guideContext = this.moduleForm.title + ' ' + (this.moduleForm.description || '');
    }

    const track = this.activeDetailCourse?.track || 'coding';
    const title = blk.title || this.moduleForm.title || 'Technical Unit';

    this.apiService.generateAiQuiz(guideContext, track, title).subscribe({
      next: res => {
        this.isGeneratingAiQuiz[blk.id] = false;
        if (res && res.question) {
          blk.quizQuestion = res.question;
          blk.quizOptions = res.options && res.options.length === 4 ? res.options : ['Option A', 'Option B', 'Option C', 'Option D'];
          blk.quizCorrectIndex = res.correct_index ?? 0;
          blk.quizExplanation = res.explanation || '';
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.isGeneratingAiQuiz[blk.id] = false;
        this.cdr.markForCheck();
      }
    });
  }

  generateAiQuizAsNewBlock(): void {
    if (this.isGeneratingNewAiQuiz) return;
    this.isGeneratingNewAiQuiz = true;
    this.cdr.markForCheck();

    const guideBlocks = this.moduleBlocks.filter(b => b.type === 'text' && b.content?.trim());
    let guideContext = guideBlocks.map(b => `${b.title}\n${b.content}`).join('\n\n');
    if (!guideContext.trim()) {
      guideContext = this.moduleForm.title + ' ' + (this.moduleForm.description || 'Core concepts and algorithmic foundations.');
    }

    const track = this.activeDetailCourse?.track || 'coding';
    const title = this.moduleForm.title || 'Module Checkpoint';

    this.apiService.generateAiQuiz(guideContext, track, title).subscribe({
      next: res => {
        this.isGeneratingNewAiQuiz = false;
        const newBlk: ModuleBlock = {
          id: 'blk-' + Math.random().toString(36).slice(2, 7),
          type: 'quiz',
          title: 'AI Checkpoint: ' + (res?.question?.slice(0, 45) || 'Comprehension Check') + '...',
          quizQuestion: res?.question || 'Which principle best satisfies the algorithmic requirement?',
          quizOptions: res?.options && res.options.length === 4 ? res.options : ['Option A', 'Option B', 'Option C', 'Option D'],
          quizCorrectIndex: res?.correct_index ?? 0,
          quizExplanation: res?.explanation || ''
        };
        this.moduleBlocks.push(newBlk);
        this.selectedBlockId = newBlk.id;
        this.editingBlockId = newBlk.id;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isGeneratingNewAiQuiz = false;
        this.addBlock('quiz');
        this.cdr.markForCheck();
      }
    });
  }

  removeBlock(idx: number): void {
    this.moduleBlocks.splice(idx, 1);
    this.cdr.markForCheck();
  }

  moveBlockUp(idx: number): void {
    if (idx <= 0) return;
    const temp = this.moduleBlocks[idx];
    this.moduleBlocks[idx] = this.moduleBlocks[idx - 1];
    this.moduleBlocks[idx - 1] = temp;
    this.cdr.markForCheck();
  }

  moveBlockDown(idx: number): void {
    if (idx >= this.moduleBlocks.length - 1) return;
    const temp = this.moduleBlocks[idx];
    this.moduleBlocks[idx] = this.moduleBlocks[idx + 1];
    this.moduleBlocks[idx + 1] = temp;
    this.cdr.markForCheck();
  }

  saveModuleStudio(): void {
    if (this.isSaving) return;
    if (!this.moduleForm.title.trim() || !this.moduleForm.courseId) return;
    this.isSaving = true;
    this.saveError = '';
    this.cdr.markForCheck();

    const payload = {
      course_id: this.moduleForm.courseId,
      title: this.moduleForm.title.trim(),
      description: this.moduleBlocks[0]?.content || this.moduleForm.description || '',
      order_num: Number(this.moduleForm.order) || 1,
      icon: this.moduleForm.icon || 'view_module',
    };

    const request = this.formMode === 'create'
      ? this.apiService.createModule(payload)
      : this.apiService.updateModule(this.moduleForm.id, payload);

    request.subscribe({
      next: (modResult: any) => {
        const savedModId = modResult?.id || this.moduleForm.id;
        
        // Persist blocks into materials
        this.persistBlocksForModule(savedModId, this.moduleForm.courseId);
        this.isSaving = false;
        this.reload();
        this.exitModuleStudio();
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.saveError = this.describeWriteError(err, 'module');
        this.cdr.markForCheck();
      }
    });
  }

  private persistBlocksForModule(moduleId: string, courseId: string): void {
    for (let i = 0; i < this.moduleBlocks.length; i++) {
      const blk = this.moduleBlocks[i];
      let cleanContent = (blk.content || '').trim();

      // Unwrap any accidental JSON string in content
      if (cleanContent.startsWith('{') && cleanContent.includes('"widget"')) {
        try {
          const inner = JSON.parse(cleanContent);
          cleanContent = inner.instructions || inner.overview || inner.caption || '';
        } catch {
          cleanContent = '';
        }
      }

      let descPayload = cleanContent;
      if (blk.type === 'quiz') {
        descPayload = JSON.stringify({
          widget: 'quiz',
          question: blk.quizQuestion || blk.title,
          options: blk.quizOptions || ['A', 'B', 'C', 'D'],
          correctIndex: blk.quizCorrectIndex ?? 0,
          explanation: blk.quizExplanation || ''
        });
      } else if (blk.type === 'code') {
        descPayload = JSON.stringify({
          widget: 'code',
          language: blk.codeLanguage || 'python',
          starterCode: blk.codeStarter || '',
          instructions: blk.codeInstructions || cleanContent
        });
      } else if (blk.type === 'video') {
        descPayload = JSON.stringify({
          widget: 'video',
          durationMinutes: blk.videoDuration || 15,
          keyTakeaway: blk.videoTakeaway || '',
          overview: cleanContent,
          source: blk.videoSource || 'url'
        });
      } else if (blk.type === 'image') {
        descPayload = JSON.stringify({
          widget: 'image',
          caption: cleanContent,
          fileName: blk.fileName || ''
        });
      } else if (blk.type === 'file') {
        descPayload = JSON.stringify({
          widget: 'file',
          fileName: blk.fileName || 'Attachment',
          fileSize: blk.fileSize || '',
          instructions: cleanContent
        });
      } else if (blk.type === 'break') {
        descPayload = JSON.stringify({
          widget: 'break',
          breakLabel: blk.breakLabel || 'Checkpoint'
        });
      }

      const matPayload = {
        course_id: courseId,
        module_id: moduleId,
        title: blk.title || (blk.type.toUpperCase() + ' ' + (i + 1)),
        type: (blk.type === 'text' ? 'guide' : blk.type),
        url: blk.url || '',
        description: descPayload
      };

      if (blk.id && !blk.id.startsWith('blk-')) {
        this.apiService.updateMaterial(blk.id, matPayload).subscribe({ error: () => {} });
      } else {
        this.apiService.createMaterial(matPayload).subscribe({ error: () => {} });
      }
    }
  }

  toggleCourseInsights(): void {
    this.showCourseInsights = !this.showCourseInsights;
    this.cdr.markForCheck();
  }

  // ── Course Actions ──────────────────────────────────────────
  openCourseModal(course?: any): void {
    this.saveError = '';
    this.courseStudioStep = 1;
    if (course) {
      this.formMode = 'edit';
      this.courseForm = {
        id: course.id || '',
        title: course.title || '',
        track: course.track || 'coding',
        icon: course.icon || 'school',
        level: course.level || 'Beginner',
        description: course.description || '',
        modules: course.modules ?? 0,
        enrolled: course.enrolled_count ?? course.enrolled ?? 0,
        completion: course.average_progress ?? course.completion ?? 0,
        status: course.status || 'active',
        approvalStatus: course.approval_status || course.approvalStatus || 'approved',
        createdAt: course.created_at || course.createdAt || new Date().toISOString().split('T')[0],
        competitionId: course.competition_id || course.competitionId || ''
      };
    } else {
      this.formMode = 'create';
      this.courseForm = this.emptyCourse();
    }
    this.isCourseModalOpen = true;
    this.cdr.markForCheck();
  }

  closeCourseModal(): void {
    this.isCourseModalOpen = false;
    this.courseStudioStep = 1;
    this.saveError = '';
    this.cdr.markForCheck();
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
    if (this.isSaving) return;
    if (!this.courseForm.title.trim()) return;
    this.isSaving = true;
    this.saveError = '';
    this.cdr.markForCheck();

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
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.saveError = this.describeWriteError(err, 'course');
        this.cdr.markForCheck();
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
        this.cdr.markForCheck();
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
    this.cdr.markForCheck();
  }

  // ── Module Actions ──────────────────────────────────────────
  openModuleModal(mod?: any): void {
    this.saveError = '';
    this.moduleStep = 1;
    if (mod) {
      this.formMode = 'edit';
      this.moduleForm = {
        id: mod.id || '',
        courseId: mod.course_id || mod.courseId || '',
        title: mod.title || '',
        description: mod.description || '',
        order: mod.order_num ?? mod.order ?? 1,
        icon: mod.icon || 'view_module',
        status: mod.status || 'published',
        approvalStatus: mod.approval_status || mod.approvalStatus || 'approved'
      };
    } else {
      this.formMode = 'create';
      this.moduleForm = this.emptyModule();
      if (this.selectedCourseId !== 'all') {
        this.moduleForm.courseId = this.selectedCourseId;
      } else if (this.authoredCourses.length) {
        this.moduleForm.courseId = this.authoredCourses[0].id;
      }
      this.suggestNextModuleOrder();
    }
    this.isModuleModalOpen = true;
    this.cdr.markForCheck();
  }

  suggestNextModuleOrder(): void {
    if (this.formMode !== 'create' || !this.moduleForm.courseId) return;
    const existingMods = this.getModulesForCourse(this.moduleForm.courseId);
    const nextOrder = existingMods.length ? Math.max(...existingMods.map(m => m.order_num || 0)) + 1 : 1;
    this.moduleForm.order = nextOrder;
    this.cdr.markForCheck();
  }

  closeModuleModal(): void {
    this.isModuleModalOpen = false;
    this.moduleStep = 1;
    this.saveError = '';
    this.cdr.markForCheck();
  }

  saveModule(): void {
    if (this.isSaving) return;
    if (!this.moduleForm.title.trim() || !this.moduleForm.courseId) return;
    this.isSaving = true;
    this.saveError = '';
    this.cdr.markForCheck();

    const payload = {
      course_id: this.moduleForm.courseId,
      title: this.moduleForm.title.trim(),
      description: this.moduleForm.description || '',
      order_num: this.moduleForm.order || 1,
      icon: this.moduleForm.icon || 'menu_book',
    };

    const request = this.formMode === 'create'
      ? this.apiService.createModule(payload)
      : this.apiService.updateModule(this.moduleForm.id, payload);

    request.subscribe({
      next: () => {
        this.isSaving = false;
        this.closeModuleModal();
        this.reload();
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.saveError = this.describeWriteError(err, 'module');
        this.cdr.markForCheck();
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
      error: (err: any) => {
        this.saveError = this.describeWriteError(err, 'module');
        this.cdr.markForCheck();
      },
    });
  }

  // ── Rich Widget Form State ─────────────────────────────────────
  quizWidgetForm = {
    question: '',
    optionA: '',
    optionB: '',
    optionC: '',
    optionD: '',
    correctIndex: 0,
    explanation: ''
  };

  codeWidgetForm = {
    language: 'python',
    starterCode: '# Write your solution below\ndef solution():\n    pass\n',
    instructions: ''
  };

  videoWidgetForm = {
    durationMinutes: 15,
    keyTakeaway: ''
  };

  // ── Formatted Description Helper ──────────────────────────────
  getFormattedDescription(desc?: string): string {
    if (!desc) return '';
    const trimmed = desc.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.widget === 'file') {
          const parts = [
            parsed.fileName ? `Document: ${parsed.fileName}` : 'Attached Document',
            parsed.fileSize ? `(${parsed.fileSize})` : '',
            parsed.instructions ? `— ${parsed.instructions}` : ''
          ].filter(Boolean);
          return parts.join(' ');
        }
        if (parsed.widget === 'video') {
          return parsed.keyTakeaway ? `Video Lecture: ${parsed.keyTakeaway}` : (parsed.durationMinutes ? `Video Lecture (${parsed.durationMinutes} mins)` : 'Video Lecture');
        }
        if (parsed.widget === 'quiz') {
          return parsed.question ? `Checkpoint Quiz: ${parsed.question}` : 'Interactive Checkpoint Quiz';
        }
        if (parsed.widget === 'code') {
          return parsed.language ? `Code Challenge (${parsed.language}): ${parsed.instructions || 'Interactive Exercise'}` : 'Interactive Coding Challenge';
        }
        if (parsed.title || parsed.content) {
          return parsed.title || parsed.content;
        }
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }

  // ── Module Bound Asset Redirect Modal ─────────────────────────
  showModuleBoundAssetModal = false;
  boundAssetTarget: any = null;
  boundAssetModule: any = null;

  editModuleFromBoundAsset(): void {
    const mod = this.boundAssetModule;
    this.showModuleBoundAssetModal = false;
    if (mod) {
      if (!this.activeDetailCourse) {
        const cId = mod.course_id || mod.courseId;
        this.activeDetailCourse = this.authoredCourses.find(c => c.id === cId)
          || this.contentService.lmsCourses.find((c: any) => c.id === cId)
          || null;
      }
      this.openModuleStudio(mod);
    }
    this.cdr.markForCheck();
  }

  closeModuleBoundAssetModal(): void {
    this.showModuleBoundAssetModal = false;
    this.boundAssetTarget = null;
    this.boundAssetModule = null;
    this.cdr.markForCheck();
  }

  // ── Material Actions ──────────────────────────────────────────
  openMaterialModal(mat?: any): void {
    this.saveError = '';
    this.materialStep = 1;
    if (mat) {
      const modId = mat.module_id || mat.moduleId;
      if (modId) {
        const parentMod = this.serverModules.find(m => m.id === modId) || this.contentService.lmsModules.find(m => m.id === modId);
        this.boundAssetTarget = mat;
        this.boundAssetModule = parentMod || { id: modId, title: this.getModuleTitle(modId), course_id: mat.course_id || mat.courseId };
        this.showModuleBoundAssetModal = true;
        this.cdr.markForCheck();
        return;
      }

      this.formMode = 'edit';
      this.materialForm = {
        id: mat.id || '',
        courseId: mat.course_id || mat.courseId || '',
        moduleId: mat.module_id || mat.moduleId || '',
        title: mat.title || '',
        type: mat.type || 'guide',
        url: mat.url || '',
        description: mat.description || '',
        approvalStatus: mat.approval_status || mat.approvalStatus || 'approved',
        createdAt: mat.created_at || mat.createdAt || new Date().toISOString().split('T')[0]
      };
      // Hydrate specialized widget forms if description holds JSON
      try {
        if (mat.description && mat.description.startsWith('{')) {
          const parsed = JSON.parse(mat.description);
          if (parsed.widget === 'quiz' || mat.type === 'quiz') {
            this.quizWidgetForm = {
              question: parsed.question || '',
              optionA: parsed.options?.[0] || '',
              optionB: parsed.options?.[1] || '',
              optionC: parsed.options?.[2] || '',
              optionD: parsed.options?.[3] || '',
              correctIndex: parsed.correctIndex ?? 0,
              explanation: parsed.explanation || ''
            };
          } else if (parsed.widget === 'code' || mat.type === 'code') {
            this.codeWidgetForm = {
              language: parsed.language || 'python',
              starterCode: parsed.starterCode || '',
              instructions: parsed.instructions || ''
            };
          } else if (parsed.widget === 'video' || mat.type === 'video') {
            this.videoWidgetForm = {
              durationMinutes: parsed.durationMinutes ?? 15,
              keyTakeaway: parsed.keyTakeaway || ''
            };
          }
        }
      } catch {
        // Plain string description
      }
    } else {
      this.formMode = 'create';
      this.materialForm = this.emptyMaterial();
      this.quizWidgetForm = {
        question: '',
        optionA: '',
        optionB: '',
        optionC: '',
        optionD: '',
        correctIndex: 0,
        explanation: ''
      };
      this.codeWidgetForm = {
        language: 'python',
        starterCode: '# Write your solution below\ndef solution():\n    pass\n',
        instructions: ''
      };
      this.videoWidgetForm = {
        durationMinutes: 15,
        keyTakeaway: ''
      };
      if (this.selectedCourseId !== 'all') {
        this.materialForm.courseId = this.selectedCourseId;
      } else if (this.authoredCourses.length) {
        this.materialForm.courseId = this.authoredCourses[0].id;
      }
    }
    this.isMaterialModalOpen = true;
    this.cdr.markForCheck();
  }

  closeMaterialModal(): void {
    this.isMaterialModalOpen = false;
    this.materialStep = 1;
    this.saveError = '';
    this.cdr.markForCheck();
  }

  saveMaterial(): void {
    if (this.isSaving) return;
    if (!this.materialForm.title.trim() || !this.materialForm.courseId) return;
    this.isSaving = true;
    this.saveError = '';
    this.cdr.markForCheck();

    let descriptionPayload = this.materialForm.description || '';
    if (this.materialForm.type === 'quiz') {
      descriptionPayload = JSON.stringify({
        widget: 'quiz',
        question: this.quizWidgetForm.question.trim(),
        options: [
          this.quizWidgetForm.optionA.trim(),
          this.quizWidgetForm.optionB.trim(),
          this.quizWidgetForm.optionC.trim(),
          this.quizWidgetForm.optionD.trim(),
        ].filter(Boolean),
        correctIndex: this.quizWidgetForm.correctIndex,
        explanation: this.quizWidgetForm.explanation.trim()
      });
    } else if (this.materialForm.type === 'code') {
      descriptionPayload = JSON.stringify({
        widget: 'code',
        language: this.codeWidgetForm.language,
        starterCode: this.codeWidgetForm.starterCode,
        instructions: this.codeWidgetForm.instructions.trim()
      });
    } else if (this.materialForm.type === 'video') {
      descriptionPayload = JSON.stringify({
        widget: 'video',
        durationMinutes: this.videoWidgetForm.durationMinutes,
        keyTakeaway: this.videoWidgetForm.keyTakeaway.trim(),
        overview: this.materialForm.description || ''
      });
    }

    const payload = {
      course_id: this.materialForm.courseId,
      module_id: this.materialForm.moduleId || '',
      title: this.materialForm.title.trim(),
      type: this.materialForm.type || 'guide',
      url: this.materialForm.url || '',
      description: descriptionPayload,
    };

    const request = this.formMode === 'create'
      ? this.apiService.createMaterial(payload)
      : this.apiService.updateMaterial(this.materialForm.id, payload);

    request.subscribe({
      next: () => {
        this.isSaving = false;
        this.closeMaterialModal();
        this.reload();
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.saveError = this.describeWriteError(err, 'material');
        this.cdr.markForCheck();
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
      error: (err: any) => {
        this.saveError = this.describeWriteError(err, 'material');
        this.cdr.markForCheck();
      },
    });
  }

  // ── Assignment Actions ──────────────────────────────────────────
  openAssignmentModal(asgn?: any): void {
    this.saveError = '';
    this.assignmentStep = 1;
    if (asgn) {
      this.formMode = 'edit';
      this.assignmentForm = {
        id: asgn.id || '',
        courseId: asgn.course_id || asgn.courseId || '',
        title: asgn.title || '',
        description: asgn.description || '',
        dueDate: asgn.due_date || asgn.dueDate || new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0],
        maxScore: asgn.max_score ?? asgn.maxScore ?? 100,
        track: asgn.track || 'coding',
        status: asgn.status || 'active',
        approvalStatus: asgn.approval_status || asgn.approvalStatus || 'approved',
        createdAt: asgn.created_at || asgn.createdAt || new Date().toISOString().split('T')[0]
      };
    } else {
      this.formMode = 'create';
      this.assignmentForm = this.emptyAssignment();
      if (this.selectedCourseId !== 'all') {
        this.assignmentForm.courseId = this.selectedCourseId;
      } else if (this.authoredCourses.length) {
        this.assignmentForm.courseId = this.authoredCourses[0].id;
      }
    }
    this.isAssignmentModalOpen = true;
    this.cdr.markForCheck();
  }

  closeAssignmentModal(): void {
    this.isAssignmentModalOpen = false;
    this.assignmentStep = 1;
    this.saveError = '';
    this.cdr.markForCheck();
  }

  saveAssignment(): void {
    if (this.isSaving) return;
    if (!this.assignmentForm.title.trim() || !this.assignmentForm.courseId) return;
    this.isSaving = true;
    this.saveError = '';
    this.cdr.markForCheck();

    const payload = {
      course_id: this.assignmentForm.courseId,
      title: this.assignmentForm.title.trim(),
      description: this.assignmentForm.description || '',
      due_date: this.assignmentForm.dueDate || '',
      max_score: this.assignmentForm.maxScore || 100,
      track: this.assignmentForm.track || '',
    };

    const request = this.formMode === 'create'
      ? this.apiService.createAssignment(payload)
      : this.apiService.updateAssignment(this.assignmentForm.id, payload);

    request.subscribe({
      next: () => {
        this.isSaving = false;
        this.closeAssignmentModal();
        this.reload();
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.saveError = this.describeWriteError(err, 'assignment');
        this.cdr.markForCheck();
      },
    });
  }

  // ── Assignment Attachment Upload & Cloning ──────────────────
  isUploadingAssignmentFile = false;
  isCloningCourse: { [courseId: string]: boolean } = {};

  onAssignmentFileUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    this.isUploadingAssignmentFile = true;
    this.cdr.markForCheck();

    this.apiService.uploadFileBlob(file).subscribe({
      next: res => {
        this.isUploadingAssignmentFile = false;
        if (res && res.url) {
          const sizeMb = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
          const attachHeader = `[Attached Resource: ${file.name} (${sizeMb})](${res.url})`;
          if (!this.assignmentForm.description) {
            this.assignmentForm.description = attachHeader;
          } else if (!this.assignmentForm.description.includes(res.url)) {
            this.assignmentForm.description = this.assignmentForm.description.trim() + '\n\n' + attachHeader;
          }
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.isUploadingAssignmentFile = false;
        this.cdr.markForCheck();
      }
    });
  }

  cloneCourse(sourceCourse: any): void {
    if (!sourceCourse || this.isCloningCourse[sourceCourse.id]) return;
    this.isCloningCourse[sourceCourse.id] = true;
    this.saveError = '';
    this.cdr.markForCheck();

    const coursePayload = {
      title: `${sourceCourse.title} (Draft Copy)`,
      track: sourceCourse.track || 'coding',
      icon: sourceCourse.icon || 'school',
      level: sourceCourse.level || 'Beginner',
      description: sourceCourse.description || '',
      status: 'draft',
      approval_status: 'approved'
    };

    this.apiService.createLmsCourse(coursePayload).subscribe({
      next: (newCourse: any) => {
        const newCourseId = newCourse.id;
        const sourceModules = this.serverModules.filter(m => m.course_id === sourceCourse.id);
        const sourceMaterials = this.serverMaterials.filter(m => m.course_id === sourceCourse.id);
        const sourceAssignments = this.serverAssignments.filter(a => a.course_id === sourceCourse.id);

        if (sourceModules.length === 0 && sourceMaterials.length === 0 && sourceAssignments.length === 0) {
          this.isCloningCourse[sourceCourse.id] = false;
          this.reload();
          this.openCourseConsole(newCourse);
          this.cdr.markForCheck();
          return;
        }

        const cloneModulePromises = sourceModules.map(mod => {
          return this.apiService.createModule({
            course_id: newCourseId,
            title: mod.title,
            description: mod.description || '',
            order_num: mod.order_num || 1,
            icon: mod.icon || 'view_module'
          }).toPromise().then(createdMod => ({ oldId: mod.id, newId: createdMod?.id }));
        });

        Promise.all(cloneModulePromises).then(moduleMappings => {
          const modMap: { [oldId: string]: string } = {};
          moduleMappings.forEach(m => {
            if (m && m.oldId && m.newId) modMap[m.oldId] = m.newId;
          });

          const cloneMatPromises = sourceMaterials.map(mat => {
            const mappedModId = mat.module_id ? (modMap[mat.module_id] || '') : '';
            return this.apiService.createMaterial({
              course_id: newCourseId,
              module_id: mappedModId,
              title: mat.title,
              type: mat.type || 'guide',
              url: mat.url || '',
              description: mat.description || ''
            }).toPromise();
          });

          const cloneAsgnPromises = sourceAssignments.map(asgn => {
            return this.apiService.createAssignment({
              course_id: newCourseId,
              title: asgn.title,
              description: asgn.description || '',
              due_date: asgn.due_date || '',
              max_score: asgn.max_score ?? 100,
              track: asgn.track || newCourse.track
            }).toPromise();
          });

          Promise.all([...cloneMatPromises, ...cloneAsgnPromises]).then(() => {
            this.isCloningCourse[sourceCourse.id] = false;
            this.reload();
            this.openCourseConsole(newCourse);
            this.cdr.markForCheck();
          }).catch(() => {
            this.isCloningCourse[sourceCourse.id] = false;
            this.reload();
            this.openCourseConsole(newCourse);
            this.cdr.markForCheck();
          });
        }).catch(() => {
          this.isCloningCourse[sourceCourse.id] = false;
          this.reload();
          this.cdr.markForCheck();
        });
      },
      error: (err: any) => {
        this.isCloningCourse[sourceCourse.id] = false;
        this.saveError = this.describeWriteError(err, 'course');
        this.cdr.markForCheck();
      }
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
        this.cdr.markForCheck();
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
    this.cdr.markForCheck();
  }

  closeGradingModal(): void {
    this.isGradingModalOpen = false;
    this.activeSubmission = null;
    this.adminRevisionNotes = '';
    this.gradeScore = null;
    this.cdr.markForCheck();
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
    if (this.isSaving) return;
    if (!this.activeSubmission || this.gradeScore === null) return;
    const max = this.activeSubmission.max_score ?? 100;
    if (this.gradeScore < 0 || this.gradeScore > max) {
      this.saveError = `Score must be between 0 and ${max}.`;
      this.cdr.markForCheck();
      return;
    }
    this.isSaving = true;
    this.saveError = '';
    this.cdr.markForCheck();
    this.apiService.gradeLmsSubmission(
      this.activeSubmission.id, this.gradeScore, this.adminRevisionNotes || '',
    ).subscribe({
      next: () => {
        this.isSaving = false;
        this.closeGradingModal();
        this.reload();
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.saveError = err?.status === 403
          ? 'You can only grade work submitted on your own courses.'
          : this.describeWriteError(err, 'grade');
        this.cdr.markForCheck();
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
    if (this.isSaving) return;
    if (!this.activeSubmission || !this.adminRevisionNotes.trim()) {
      this.saveError = 'Explain what needs changing before sending it back.';
      this.cdr.markForCheck();
      return;
    }
    this.isSaving = true;
    this.saveError = '';
    this.cdr.markForCheck();
    this.apiService.returnLmsSubmission(
      this.activeSubmission.id, this.adminRevisionNotes.trim(),
    ).subscribe({
      next: () => {
        this.isSaving = false;
        this.closeGradingModal();
        this.reload();
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.isSaving = false;
        this.saveError = err?.status === 403
          ? 'You can only review work submitted on your own courses.'
          : this.describeWriteError(err, 'revision request');
        this.cdr.markForCheck();
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

  // ── Learner Classroom Simulation State & Handlers ─────────
  simulationAnswers: { [blockId: string]: number } = {};
  simulationSubmitted: { [blockId: string]: boolean } = {};
  simulationCompletedBlocks: Set<string> = new Set<string>();
  simulationCopiedCode: { [blockId: string]: boolean } = {};

  getSafeEmbedUrl(url?: string): SafeResourceUrl {
    if (!url) return this.sanitizer.bypassSecurityTrustResourceUrl('');
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

  isSimCompleted(blockId: string): boolean {
    return this.simulationCompletedBlocks.has(blockId);
  }

  toggleSimComplete(blockId: string): void {
    if (this.simulationCompletedBlocks.has(blockId)) {
      this.simulationCompletedBlocks.delete(blockId);
    } else {
      this.simulationCompletedBlocks.add(blockId);
    }
    this.cdr.markForCheck();
  }

  selectSimOption(blockId: string, optIdx: number): void {
    if (this.simulationSubmitted[blockId]) return;
    this.simulationAnswers[blockId] = optIdx;
    this.cdr.markForCheck();
  }

  submitSimQuiz(blk: ModuleBlock): void {
    if (this.simulationAnswers[blk.id] === undefined) return;
    this.simulationSubmitted[blk.id] = true;
    if (this.simulationAnswers[blk.id] === (blk.quizCorrectIndex ?? 0)) {
      this.simulationCompletedBlocks.add(blk.id);
    }
    this.cdr.markForCheck();
  }

  resetSimQuiz(blockId: string): void {
    delete this.simulationAnswers[blockId];
    this.simulationSubmitted[blockId] = false;
    this.simulationCompletedBlocks.delete(blockId);
    this.cdr.markForCheck();
  }

  copySimCode(blockId: string, code?: string): void {
    if (!code) return;
    navigator.clipboard?.writeText(code).then(() => {
      this.simulationCopiedCode[blockId] = true;
      this.cdr.markForCheck();
      setTimeout(() => {
        this.simulationCopiedCode[blockId] = false;
        this.cdr.markForCheck();
      }, 2000);
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.simulationCopiedCode[blockId] = true;
      this.cdr.markForCheck();
      setTimeout(() => {
        this.simulationCopiedCode[blockId] = false;
        this.cdr.markForCheck();
      }, 2000);
    });
  }

  get simProgressPct(): number {
    if (!this.moduleBlocks.length) return 0;
    return Math.round((this.simulationCompletedBlocks.size / this.moduleBlocks.length) * 100);
  }
}
