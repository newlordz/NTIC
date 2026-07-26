import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ContentService, LmsCourse, LmsModule, LmsMaterial, LmsAssignment, LmsSubmission, LmsEnrollment } from '../../services/content.service';

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
  styleUrls: ['./lms-manager.component.scss']
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
  activeSubmission: LmsSubmission | null = null;
  gradingScore: number = 0;
  gradingFeedback: string = '';

  activeRejectItem: PendingModerationItem | null = null;
  rejectionReasonInput: string = '';

  constructor(public contentService: ContentService) {}

  ngOnInit(): void {}

  // ── Stats Counters ──────────────────────────────────────────
  get totalCourses(): number {
    return this.contentService.lmsCourses.length;
  }
  get activeCoursesCount(): number {
    return this.contentService.lmsCourses.filter(c => c.status === 'active' && c.approvalStatus === 'approved').length;
  }
  get totalModules(): number {
    return this.contentService.lmsModules.length;
  }
  get totalMaterials(): number {
    return this.contentService.lmsMaterials.length;
  }
  get totalAssignments(): number {
    return this.contentService.lmsAssignments.length;
  }
  get pendingGradingCount(): number {
    return this.contentService.lmsSubmissions.filter(s => s.status === 'submitted').length;
  }
  get totalEnrolledStudents(): number {
    return this.contentService.lmsEnrollments.length;
  }

  // ── Moderation Approvals Queue ──────────────────────────────
  get pendingLmsItems(): PendingModerationItem[] {
    const list: PendingModerationItem[] = [];

    // Pending Courses
    for (const c of this.contentService.lmsCourses) {
      if (c.approvalStatus === 'pending') {
        list.push({
          id: c.id,
          type: 'course',
          typeLabel: 'Course',
          title: c.title,
          description: c.description,
          submittedBy: c.submittedBy || 'Instructor',
          createdAt: c.createdAt,
          rawItem: c
        });
      }
    }

    // Pending Modules
    for (const m of this.contentService.lmsModules) {
      if (m.approvalStatus === 'pending') {
        list.push({
          id: m.id,
          type: 'module',
          typeLabel: 'Curriculum Module',
          title: m.title,
          description: m.description,
          submittedBy: m.submittedBy || 'Instructor',
          createdAt: 'Recently',
          courseTitle: this.getCourseTitle(m.courseId),
          rawItem: m
        });
      }
    }

    // Pending Materials
    for (const mat of this.contentService.lmsMaterials) {
      if (mat.approvalStatus === 'pending') {
        list.push({
          id: mat.id,
          type: 'material',
          typeLabel: 'Learning Asset',
          title: mat.title,
          description: mat.description,
          submittedBy: mat.submittedBy || 'Instructor',
          createdAt: mat.createdAt,
          courseTitle: this.getCourseTitle(mat.courseId),
          rawItem: mat
        });
      }
    }

    // Pending Assignments
    for (const a of this.contentService.lmsAssignments) {
      if (a.approvalStatus === 'pending') {
        list.push({
          id: a.id,
          type: 'assignment',
          typeLabel: 'Assignment',
          title: a.title,
          description: a.description,
          submittedBy: a.submittedBy || 'Instructor',
          createdAt: a.createdAt,
          courseTitle: this.getCourseTitle(a.courseId),
          rawItem: a
        });
      }
    }

    return list;
  }

  get pendingApprovalsCount(): number {
    return this.pendingLmsItems.length;
  }

  // ── Moderation Actions ──────────────────────────────────────────
  approveModerationItem(item: PendingModerationItem): void {
    this.contentService.approveLmsItem(item.type, item.id);
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
    this.contentService.rejectLmsItem(this.activeRejectItem.type, this.activeRejectItem.id, this.rejectionReasonInput);
    this.closeRejectModal();
  }

  // ── Filtered Lists ──────────────────────────────────────────
  get filteredCourses(): LmsCourse[] {
    return this.contentService.lmsCourses.filter(c => {
      const matchTrack = this.selectedTrack === 'all' || c.track === this.selectedTrack;
      const matchStatus = this.selectedStatus === 'all' || c.status === this.selectedStatus;
      const matchLevel = this.selectedLevel === 'all' || c.level === this.selectedLevel;
      const matchApproval = this.selectedApprovalFilter === 'all' || (c.approvalStatus || 'approved') === this.selectedApprovalFilter;
      const matchSearch = !this.searchQuery || 
        c.title.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        c.description.toLowerCase().includes(this.searchQuery.toLowerCase());
      return matchTrack && matchStatus && matchLevel && matchApproval && matchSearch;
    });
  }

  get filteredModules(): LmsModule[] {
    return this.contentService.lmsModules.filter(m => {
      const matchCourse = this.selectedCourseId === 'all' || m.courseId === this.selectedCourseId;
      const matchApproval = this.selectedApprovalFilter === 'all' || (m.approvalStatus || 'approved') === this.selectedApprovalFilter;
      const matchSearch = !this.searchQuery || 
        m.title.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        m.description.toLowerCase().includes(this.searchQuery.toLowerCase());
      return matchCourse && matchApproval && matchSearch;
    });
  }

  get filteredMaterials(): LmsMaterial[] {
    return this.contentService.lmsMaterials.filter(m => {
      const matchCourse = this.selectedCourseId === 'all' || m.courseId === this.selectedCourseId;
      const matchApproval = this.selectedApprovalFilter === 'all' || (m.approvalStatus || 'approved') === this.selectedApprovalFilter;
      const matchSearch = !this.searchQuery || 
        m.title.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        m.description.toLowerCase().includes(this.searchQuery.toLowerCase());
      return matchCourse && matchApproval && matchSearch;
    });
  }

  get filteredAssignments(): LmsAssignment[] {
    return this.contentService.lmsAssignments.filter(a => {
      const matchCourse = this.selectedCourseId === 'all' || a.courseId === this.selectedCourseId;
      const matchTrack = this.selectedTrack === 'all' || a.track === this.selectedTrack;
      const matchApproval = this.selectedApprovalFilter === 'all' || (a.approvalStatus || 'approved') === this.selectedApprovalFilter;
      const matchSearch = !this.searchQuery || 
        a.title.toLowerCase().includes(this.searchQuery.toLowerCase());
      return matchCourse && matchTrack && matchApproval && matchSearch;
    });
  }

  get filteredSubmissions(): LmsSubmission[] {
    return this.contentService.lmsSubmissions.filter(s => {
      const matchCourse = this.selectedCourseId === 'all' || s.courseId === this.selectedCourseId;
      const matchSearch = !this.searchQuery || 
        s.studentName.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        s.studentEmail.toLowerCase().includes(this.searchQuery.toLowerCase());
      return matchCourse && matchSearch;
    });
  }

  get filteredEnrollments(): LmsEnrollment[] {
    return this.contentService.lmsEnrollments.filter(e => {
      const matchCourse = this.selectedCourseId === 'all' || e.courseId === this.selectedCourseId;
      const matchSearch = !this.searchQuery || 
        e.studentName.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        e.studentEmail.toLowerCase().includes(this.searchQuery.toLowerCase());
      return matchCourse && matchSearch;
    });
  }

  // ── Lookup Helpers ──────────────────────────────────────────
  getCourseTitle(courseId: string): string {
    const course = this.contentService.lmsCourses.find(c => c.id === courseId);
    return course ? course.title : 'Unassigned';
  }

  getModuleTitle(moduleId: string): string {
    const mod = this.contentService.lmsModules.find(m => m.id === moduleId);
    return mod ? mod.title : 'General';
  }

  getModulesForCourse(courseId: string): LmsModule[] {
    if (!courseId) return [];
    return this.contentService.lmsModules.filter(m => m.courseId === courseId);
  }

  getAssignmentTitle(assignmentId: string): string {
    const asgn = this.contentService.lmsAssignments.find(a => a.id === assignmentId);
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

  saveCourse(): void {
    if (!this.courseForm.title.trim()) return;
    if (this.formMode === 'create') {
      this.courseForm.id = 'crs-' + Date.now();
      this.courseForm.createdAt = new Date().toISOString().split('T')[0];
      this.courseForm.approvalStatus = 'approved'; // Admin created items are approved by default
      this.courseForm.submittedBy = 'Admin';
    }
    this.contentService.saveLmsCourse(this.courseForm);
    this.closeCourseModal();
  }

  deleteCourse(id: string): void {
    if (confirm('Are you sure you want to delete this course and all associated modules, materials, and assignments?')) {
      this.contentService.removeLmsCourse(id);
    }
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
    if (this.formMode === 'create') {
      this.moduleForm.id = 'mod-' + Date.now();
      this.moduleForm.approvalStatus = 'approved';
      this.moduleForm.submittedBy = 'Admin';
    }
    this.contentService.saveLmsModule(this.moduleForm);
    this.closeModuleModal();
  }

  deleteModule(id: string): void {
    if (confirm('Delete this module? Associated materials will also be removed.')) {
      this.contentService.removeLmsModule(id);
    }
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
    if (this.formMode === 'create') {
      this.materialForm.id = 'mat-' + Date.now();
      this.materialForm.createdAt = new Date().toISOString().split('T')[0];
      this.materialForm.approvalStatus = 'approved';
      this.materialForm.submittedBy = 'Admin';
    }
    this.contentService.saveLmsMaterial(this.materialForm);
    this.closeMaterialModal();
  }

  deleteMaterial(id: string): void {
    if (confirm('Delete this learning material?')) {
      this.contentService.removeLmsMaterial(id);
    }
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
    if (this.formMode === 'create') {
      this.assignmentForm.id = 'asgn-' + Date.now();
      this.assignmentForm.createdAt = new Date().toISOString().split('T')[0];
      this.assignmentForm.approvalStatus = 'approved';
      this.assignmentForm.submittedBy = 'Admin';
    }
    this.contentService.saveLmsAssignment(this.assignmentForm);
    this.closeAssignmentModal();
  }

  deleteAssignment(id: string): void {
    if (confirm('Delete this assignment?')) {
      this.contentService.removeLmsAssignment(id);
    }
  }

  adminRevisionNotes = '';

  // ── Submission Audit & Instructor Revision Desk ─────────────────────────
  openGradingModal(submission: LmsSubmission): void {
    this.activeSubmission = submission;
    this.adminRevisionNotes = '';
    this.isGradingModalOpen = true;
  }

  closeGradingModal(): void {
    this.isGradingModalOpen = false;
    this.activeSubmission = null;
    this.adminRevisionNotes = '';
  }

  submitInstructorRegradeRequest(): void {
    if (!this.activeSubmission || !this.adminRevisionNotes.trim()) return;
    this.contentService.requestSubmissionRevision(this.activeSubmission.id, this.adminRevisionNotes);
    this.closeGradingModal();
  }

  rejectSubmissionToStudent(): void {
    if (!this.activeSubmission || !this.adminRevisionNotes.trim()) return;
    this.contentService.rejectLmsSubmission(this.activeSubmission.id, this.adminRevisionNotes);
    this.closeGradingModal();
  }

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
      createdAt: new Date().toISOString().split('T')[0]
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
