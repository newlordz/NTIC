import { getAuthValue } from '../../services/session.util';
import { Component, OnInit } from '@angular/core';
import { CommonModule, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContentService, LmsSubmission } from '../../services/content.service';
import { FileStorageService } from '../../services/file-storage.service';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-lms',
  standalone: true,
  imports: [CommonModule, TitleCasePipe, FormsModule],
  templateUrl: './lms.component.html',
  styleUrl: './lms.component.scss'
})
export class LmsComponent implements OnInit {
  selectedUploadFiles: { id: string; name: string }[] = [];

  constructor(public contentService: ContentService, public fileStorage: FileStorageService, private apiService: ApiService) {}

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
  get studentProfile() {
    const activeEmail = this.currentUserEmail;
    const activeUser = this.contentService.users.find(u => 
      (u.email && u.email.trim().toLowerCase() === activeEmail) ||
      (u.ticket && u.ticket.trim().toLowerCase() === activeEmail) ||
      (u.id && u.id.trim().toLowerCase() === activeEmail) ||
      (u.fullName && u.fullName.trim().toLowerCase() === activeEmail)
    );

    if (activeUser) {
      const tId = (activeUser.track || '').toLowerCase();
      const resolvedTrackId = tId.includes('robot') ? 'robotics' :
                              tId.includes('ai') || tId.includes('data') ? 'ai' :
                              tId.includes('cyber') || tId.includes('security') ? 'cyber' :
                              tId.includes('innovat') ? 'innovation' : 'coding';

      return {
        name: activeUser.fullName,
        id: activeUser.ticket || activeUser.id || 'NTIC-STU-8263',
        school: activeUser.organization || 'Independent Competitor',
        track: activeUser.track || 'Coding & Algorithms',
        trackId: resolvedTrackId,
        avatar: (activeUser.fullName || 'CS').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase(),
        email: activeUser.email || activeEmail,
        mentor: '',
        mentorAvatar: '',
        mentorEmail: ''
      };
    }

    if (activeEmail) {
      const cleanName = activeEmail.includes('@')
        ? activeEmail.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        : activeEmail.toUpperCase();
      return {
        name: cleanName || 'Registered Student',
        id: activeEmail.startsWith('NTIC-') ? activeEmail.toUpperCase() : 'NTIC-STU-' + Math.floor(1000 + Math.random() * 9000),
        school: 'Registered Competitor Institution',
        track: 'Coding & Algorithms',
        trackId: 'coding',
        avatar: (cleanName || 'ST').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase(),
        email: activeEmail,
        mentor: 'Efua Mensah',
        mentorAvatar: 'EM',
        mentorEmail: 'e.mensah@ntic.gov.gh'
      };
    }

    return {
      name: 'Kwame Asante',
      id: 'NTIC-STU-0012',
      school: 'Achimota School',
      track: 'Coding & Algorithms',
      trackId: 'coding',
      avatar: 'KA',
      email: 'kwame.asante@student.ntic.gov.gh',
      mentor: 'Efua Mensah',
      mentorAvatar: 'EM',
      mentorEmail: 'e.mensah@achimota.edu.gh'
    };
  }

  getCourseProgress(courseTitle: string): number {
    const key = `ntic_progress_${this.studentProfile.id}_${courseTitle}`;
    const saved = localStorage.getItem(key);
    if (saved !== null) {
      return parseInt(saved, 10) || 0;
    }
    return 0;
  }

  get studentCourses() {
    return this.contentService.lmsCourses.map((c: any) => {
      const progress = this.getCourseProgress(c.title);
      return {
        title: c.title,
        track: c.track,
        icon: c.icon,
        totalModules: c.modules || 0,
        color: 'primary',
        progress,
        module: c.description || '',
        lastActive: 'Recently Active',
        badgeText: progress >= 100 ? 'Completed' : 'In Progress',
        buttonText: progress === 0 ? 'START COURSE →' : 'RESUME COURSE'
      };
    });
  }

  get primaryCourseTitle(): string {
    const courses = this.studentCourses;
    return courses && courses.length > 0 ? courses[0].title : 'Enrolled Course Track';
  }

  getCourseModules(courseTitle: string) {
    const course = this.contentService.lmsCourses.find((c: any) => c.title === courseTitle);
    if (!course) return [];
    const progress = this.getCourseProgress(courseTitle || '');
    const totalModules = course.modules || 0;
    return Array.from({ length: totalModules }, (_, i) => {
      const completedThreshold = (i + 1) * (100 / totalModules);
      return {
        id: String(i + 1),
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

  completeActiveLesson(): void {
    if (!this.activeLessonCourse) return;
    const current = this.getCourseProgress(this.activeLessonCourse.title);
    const updated = Math.min(100, current + 25);
    const key = `ntic_progress_${this.studentProfile.id}_${this.activeLessonCourse.title}`;
    localStorage.setItem(key, updated.toString());
    this.apiService.saveLmsProgress({ student_id: this.studentProfile.id, course_title: this.activeLessonCourse.title, progress_pct: updated, completed_modules: Math.floor(updated / 25) }).subscribe();
    this.lessonSuccessMessage = `Module completed successfully! Course progress increased to ${updated}%.`;
    setTimeout(() => {
      this.activeLessonCourse = null;
      this.lessonSuccessMessage = '';
    }, 1800);
  }

  closeLessonModal(): void {
    this.activeLessonCourse = null;
  }

  get studentSubmissions(): any[] {
    return this.contentService.submissions
      .filter(s => s.student === this.studentProfile.name)
      .map(s => ({
        assignment: s.assignment,
        file: s.file,
        date: s.time,
        status: s.status,
        feedback: s.feedback || (s.status === 'pending' ? 'Awaiting mentor evaluation' : ''),
        grade: s.score
      }));
  }

  newSubmission = {
    courseTitle: '',
    assignmentName: '',
    fileName: '',
    notes: ''
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
    this.newSubmission.fileName = file.name;
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
  }

  submitAssignment(): void {
    if (!this.newSubmission.assignmentName || !this.selectedUploadFiles.length) {
      this.submissionError = 'Please enter assignment name and upload or select a file.';
      return;
    }
    this.submissionError = '';

    const subId = 'sub-' + Date.now();

      // --- INTEGRATION: POSTGRESQL BACKEND ---
      try {
        this.apiService.createSubmission({
          student_id: this.studentProfile.id || 'stu-test',
          source_code_path: this.newSubmission.fileName,
          video_url: ''
        }).subscribe({
          next: (res) => {
            console.log('Successfully saved submission to PostgreSQL DB:', res);
            const currentSubs = [...this.contentService.submissions];
            const idx = currentSubs.findIndex(s => s.id === subId);
            if (idx !== -1 && res && res.id) {
              currentSubs[idx] = { ...currentSubs[idx], backendId: res.id };
              this.contentService.saveSubmissions(currentSubs);
            }
          },
          error: (err) => console.error('Failed to save submission to PostgreSQL:', err)
        });
      } catch(e) {}
      // ---------------------------------------

    const currentSubmissions = [...this.contentService.submissions];
    const newSub = {
      id: subId,
      student: this.studentProfile.name,
      school: this.studentProfile.school,
      assignment: this.newSubmission.assignmentName,
      track: this.studentProfile.track,
      file: this.selectedUploadFiles.length
        ? this.selectedUploadFiles.map(f => `${f.id}::${f.name}`).join('||')
        : this.newSubmission.fileName,
      score: null,
      status: 'pending' as const,
      time: new Date().toISOString(),
      feedback: 'Submitted successfully. Awaiting mentor evaluation.',
      backendId: ''
    };
    currentSubmissions.unshift(newSub);
    this.contentService.saveSubmissions(currentSubmissions);

    const matchedAssignment = this.contentService.lmsAssignments.find(a =>
      a.title.toLowerCase().includes(this.newSubmission.assignmentName.toLowerCase()) ||
      this.newSubmission.assignmentName.toLowerCase().includes(a.title.toLowerCase())
    );
    const matchedCourse = this.contentService.lmsCourses.find(c =>
      c.title === this.newSubmission.courseTitle
    );
    const currentLms = [...this.contentService.lmsSubmissions];
    currentLms.unshift({
      id: 'lms-' + subId,
      assignmentId: matchedAssignment?.id || 'asgn-unknown',
      courseId: matchedCourse?.id || matchedAssignment?.courseId || 'crs-unknown',
      studentId: this.studentProfile.id,
      studentName: this.studentProfile.name,
      studentEmail: this.studentProfile.email,
      submittedAt: new Date().toISOString(),
      content: this.newSubmission.notes || `Submitted assignment: ${this.newSubmission.assignmentName}`,
      url: '',
      status: 'submitted',
    });
    this.contentService.saveLmsSubmissions(currentLms);

    const currentAudit = [...this.contentService.auditLogs];
    currentAudit.unshift({
      action: `New submission by ${this.studentProfile.name}: "${this.newSubmission.assignmentName}" -- ${this.newSubmission.fileName}`,
      user: this.studentProfile.email || this.studentProfile.name,
      time: new Date().toISOString(),
      type: 'approval'
    });
    this.contentService.saveAuditLogs(currentAudit);

    this.showUploadSuccess = true;
    this.selectedUploadFiles = [];
    this.newSubmission = {
      courseTitle: this.studentCourses[0]?.title || '',
      assignmentName: '',
      fileName: '',
      notes: ''
    };

    setTimeout(() => {
      this.showUploadSuccess = false;
    }, 4000);
  }
}
