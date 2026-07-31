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

      const mentorsMap: Record<string, { name: string; email: string }> = {
        robotics: { name: 'Ing. Kofi Amponsah', email: 'k.amponsah@ntic.gov.gh' },
        ai: { name: 'Dr. Abena Owusu', email: 'a.owusu@ntic.gov.gh' },
        cyber: { name: 'Cpt. Kwame Mensah', email: 'k.mensah@ntic.gov.gh' },
        innovation: { name: 'Akua Addo, MBA', email: 'a.addo@ntic.gov.gh' },
        coding: { name: 'Efua Mensah', email: 'e.mensah@ntic.gov.gh' }
      };

      const mentorInfo = mentorsMap[resolvedTrackId] || mentorsMap['coding'];

      return {
        name: activeUser.fullName,
        id: activeUser.ticket || activeUser.id || 'NTIC-STU-8263',
        school: activeUser.organization || 'Independent Competitor',
        track: activeUser.track || 'Coding & Algorithms',
        trackId: resolvedTrackId,
        avatar: (activeUser.fullName || 'CS').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase(),
        email: activeUser.email || activeEmail,
        mentor: mentorInfo.name,
        mentorAvatar: mentorInfo.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase(),
        mentorEmail: mentorInfo.email
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
    if (this.studentProfile.id === 'NTIC-STU-0012') {
      return courseTitle.includes('Python') || courseTitle.includes('Arduino') || courseTitle.includes('Ethical') ? 42 : 15;
    }
    return 0;
  }

  get studentCourses() {
    const track = (this.studentProfile.trackId || 'coding').toLowerCase();
    let rawCourses = [];

    if (track === 'robotics') {
      rawCourses = [
        { title: 'Arduino Robotics Base', track: 'robotics', icon: 'memory', totalModules: 6, color: 'primary' },
        { title: 'Sensor Integration Lab', track: 'robotics', icon: 'sensors', totalModules: 5, color: 'secondary' }
      ];
    } else if (track === 'ai') {
      rawCourses = [
        { title: 'Intro to Neural Networks', track: 'ai', icon: 'model_training', totalModules: 7, color: 'primary' },
        { title: 'Computer Vision Basics', track: 'ai', icon: 'visibility', totalModules: 6, color: 'secondary' }
      ];
    } else if (track === 'cyber') {
      rawCourses = [
        { title: 'Ethical Hacking 101', track: 'cyber', icon: 'security', totalModules: 5, color: 'primary' },
        { title: 'Digital Safety & CTF Lab', track: 'cyber', icon: 'security', totalModules: 4, color: 'secondary' }
      ];
    } else if (track === 'innovation') {
      rawCourses = [
        { title: 'Design Thinking Sprint', track: 'innovation', icon: 'tips_and_updates', totalModules: 4, color: 'primary' },
        { title: 'Product Prototyping Lab', track: 'innovation', icon: 'rocket_launch', totalModules: 4, color: 'secondary' }
      ];
    } else {
      rawCourses = [
        { title: 'Python Data Structures', track: 'coding', icon: 'data_object', totalModules: 8, color: 'primary' },
        { title: 'Web Dev Bootcamp', track: 'coding', icon: 'code', totalModules: 10, color: 'secondary' }
      ];
    }

    return rawCourses.map(c => {
      const progress = this.getCourseProgress(c.title);
      const modIndex = progress === 0 ? 1 : Math.min(c.totalModules, Math.ceil((progress / 100) * c.totalModules) + 1);
      return {
        ...c,
        progress,
        module: progress === 0 ? `Module 1 of ${c.totalModules}: Core Fundamentals & Setup` : `Module ${modIndex} of ${c.totalModules}: Active Lesson Sprint`,
        lastActive: progress === 0 ? 'Ready to Start' : 'Recently Active',
        badgeText: progress === 0 ? 'Not Started' : progress >= 100 ? 'Completed' : 'In Progress',
        buttonText: progress === 0 ? 'START COURSE →' : 'RESUME COURSE'
      };
    });
  }

  get primaryCourseTitle(): string {
    const courses = this.studentCourses;
    return courses && courses.length > 0 ? courses[0].title : 'Enrolled Course Track';
  }

  getCourseModules(courseTitle: string) {
    const title = (courseTitle || '').toLowerCase();
    const progress = this.getCourseProgress(courseTitle || '');

    let modulesList = [];
    if (title.includes('robot') || title.includes('sensor')) {
      modulesList = [
        { id: '1', title: 'Module 1: Microcontroller GPIO & Digital Logic', desc: 'Working with Arduino Uno pins, voltages, and pull-up resistors.' },
        { id: '2', title: 'Module 2: PWM & DC/Servo Motor Drive Systems', desc: 'Controlling speed, torque, and directional H-bridge drivers.' },
        { id: '3', title: 'Module 3: Ultrasonic & Infrared Obstacle Detection', desc: 'Sensor telemetry calibration and autonomous collision avoidance.' },
        { id: '4', title: 'Module 4: PID Line Tracking & Feedback Loops', desc: 'Fine-tuning proportional-integral-derivative algorithms.' },
        { id: '5', title: 'Module 5: Championship Arena Challenge Sprint', desc: 'Final autonomous navigation mission and hardware testing.' }
      ];
    } else if (title.includes('neural') || title.includes('vision') || title.includes('ai')) {
      modulesList = [
        { id: '1', title: 'Module 1: Linear Algebra & Matrix Operations', desc: 'Vector tensors, dot products, and NumPy calculations.' },
        { id: '2', title: 'Module 2: Perceptrons & Activation Functions', desc: 'Sigmoid, ReLU, Softmax and forward propagation basics.' },
        { id: '3', title: 'Module 3: Backpropagation & Loss Optimization', desc: 'Gradient descent optimization and preventing overfitting.' },
        { id: '4', title: 'Module 4: Convolutional Neural Networks (CNNs)', desc: 'Image feature extraction, pooling, and classification kernels.' },
        { id: '5', title: 'Module 5: Championship AI Model Deployment', desc: 'Exporting lightweight models for embedded competition hardware.' }
      ];
    } else if (title.includes('hack') || title.includes('cyber') || title.includes('safety')) {
      modulesList = [
        { id: '1', title: 'Module 1: Network Protocols & Packet Analysis', desc: 'Inspecting TCP/IP, DNS, and HTTP traffic with Wireshark.' },
        { id: '2', title: 'Module 2: Web Application Vulnerabilities (OWASP)', desc: 'Identifying SQL injections, XSS, and CSRF attack vectors.' },
        { id: '3', title: 'Module 3: Cryptography & Key Exchange Protocols', desc: 'Symmetric encryption, RSA handshakes, and hashing integrity.' },
        { id: '4', title: 'Module 4: Digital Forensics & Capture The Flag (CTF)', desc: 'Reverse engineering binaries and analyzing memory dumps.' },
        { id: '5', title: 'Module 5: Live Defense & Hardening Sprint', desc: 'Securing server configurations for the championship finals.' }
      ];
    } else {
      modulesList = [
        { id: '1', title: 'Module 1: Big O & Complexity Sprints', desc: 'Analyzing execution steps, auxiliary memory, and run-time optimization.' },
        { id: '2', title: 'Module 2: Custom List & Stack Engines', desc: 'Designing linear nodes, stacks, and double-ended queues from scratch.' },
        { id: '3', title: 'Module 3: Binary Tree Rotations & AVL', desc: 'Implementing height balance, search traversals, and dynamic index trees.' },
        { id: '4', title: 'Module 4: Dijkstra & Graph Pathfinders', desc: 'Coding shortest paths, adjacency weights, and priority heap routers.' },
        { id: '5', title: 'Module 5: Dynamic Programming Sprints', desc: 'Memoization, tabulation, knapsack solver, and substring scoring.' }
      ];
    }

    return modulesList.map((mod, idx) => {
      const completedThreshold = (idx + 1) * 20;
      let status = 'pending';
      if (progress === 0) {
        status = idx === 0 ? 'active' : 'pending';
      } else if (progress >= completedThreshold) {
        status = 'completed';
      } else if (progress >= completedThreshold - 20) {
        status = 'active';
      }
      return { ...mod, status };
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
          next: (res) => console.log('Successfully saved submission to PostgreSQL DB:', res),
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
      feedback: 'Submitted successfully. Awaiting mentor evaluation.'
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
      action: `New submission by ${this.studentProfile.name}: "${this.newSubmission.assignmentName}" — ${this.newSubmission.fileName}`,
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
