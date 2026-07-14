import { Component, OnInit } from '@angular/core';
import { CommonModule, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContentService } from '../../services/content.service';
import { FileStorageService } from '../../services/file-storage.service';

@Component({
  selector: 'app-lms',
  standalone: true,
  imports: [CommonModule, TitleCasePipe, FormsModule],
  templateUrl: './lms.component.html',
  styleUrl: './lms.component.scss'
})
export class LmsComponent implements OnInit {
  selectedUploadFileId = '';
  selectedUploadFileName = '';

  constructor(public contentService: ContentService, public fileStorage: FileStorageService) {}

  activeRoleId = 'student';
  activeTab = 'courses'; // default tab for instructors

  // Student specific active tab
  studentActiveTab = 'courses'; // 'courses', 'assignments', 'badge'

  courses = [
    { title: 'Python Data Structures', track: 'coding', icon: 'data_object', level: 'Intermediate', enrolled: 320, completion: 68, modules: 8, status: 'active' },
    { title: 'Arduino Robotics Base', track: 'robotics', icon: 'memory', level: 'Beginner', enrolled: 180, completion: 42, modules: 6, status: 'active' },
    { title: 'Intro to Neural Networks', track: 'ai', icon: 'model_training', level: 'Advanced', enrolled: 85, completion: 0, modules: 7, status: 'planning' },
    { title: 'Ethical Hacking 101', track: 'cyber', icon: 'security', level: 'Intermediate', enrolled: 140, completion: 22, modules: 5, status: 'active' },
    { title: 'Design Thinking Sprint', track: 'innovation', icon: 'tips_and_updates', level: 'Beginner', enrolled: 210, completion: 55, modules: 4, status: 'active' },
    { title: 'Web Dev Bootcamp', track: 'coding', icon: 'code', level: 'Beginner', enrolled: 290, completion: 61, modules: 10, status: 'active' },
    { title: 'Computer Vision Basics', track: 'ai', icon: 'visibility', level: 'Advanced', enrolled: 60, completion: 33, modules: 6, status: 'active' },
    { title: 'Sensor Integration Lab', track: 'robotics', icon: 'sensors', level: 'Intermediate', enrolled: 95, completion: 50, modules: 5, status: 'active' },
    { title: 'Digital Safety & CTF', track: 'cyber', icon: 'security', level: 'Beginner', enrolled: 175, completion: 80, modules: 4, status: 'active' }
  ];
  
  get submissions(): any[] {
    return this.contentService.submissions.map(s => ({
      student: s.student,
      school: s.school,
      assignment: s.assignment,
      track: s.track.toLowerCase(),
      file: s.file,
      score: s.score,
      status: s.status,
      time: s.time
    }));
  }

  submissionError = '';

  // Student Portal Data
  get studentProfile() {
    const activeEmail = (localStorage.getItem('activeUserEmail') || '').trim();
    const activeUser = this.contentService.users.find(u => 
      (u.email && u.email.trim().toLowerCase() === activeEmail.toLowerCase()) ||
      (u.ticket && u.ticket.trim().toLowerCase() === activeEmail.toLowerCase()) ||
      (u.id && u.id.trim().toLowerCase() === activeEmail.toLowerCase()) ||
      (u.fullName && u.fullName.trim().toLowerCase() === activeEmail.toLowerCase())
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

  activeLessonCourse: any = null;
  lessonSuccessMessage = '';

  getCourseProgress(courseTitle: string): number {
    const key = `ntic_progress_${this.studentProfile.id}_${courseTitle}`;
    const saved = localStorage.getItem(key);
    if (saved !== null) {
      return parseInt(saved, 10) || 0;
    }
    // Only pre-seeded demo student NTIC-STU-0012 has default sample progress; all new registrations start at 0%
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
    const file = event.target.files?.[0];
    if (file) {
      const id = this.fileStorage.generateId();
      await this.fileStorage.store(id, file);
      this.selectedUploadFileId = id;
      this.selectedUploadFileName = file.name;
      this.newSubmission.fileName = file.name;
    }
  }

  ngOnInit(): void {
    this.activeRoleId = localStorage.getItem('activeRoleId') || 'student';
    // If student, change the active tab to courses
    if (this.activeRoleId === 'student') {
      this.studentActiveTab = 'courses';
    } else {
      this.activeTab = 'courses';
    }
  }

  submitAssignment(): void {
    if (!this.newSubmission.assignmentName || !this.newSubmission.fileName) {
      this.submissionError = 'Please enter assignment name and upload or select a file.';
      return;
    }
    this.submissionError = '';

    const currentSubmissions = [...this.contentService.submissions];
    const newSub = {
      id: 'sub-' + Date.now(),
      student: this.studentProfile.name,
      school: this.studentProfile.school,
      assignment: this.newSubmission.assignmentName,
      track: this.studentProfile.track,
      file: this.selectedUploadFileId ? `${this.selectedUploadFileId}::${this.selectedUploadFileName}` : this.newSubmission.fileName,
      score: null,
      status: 'pending' as const,
      time: 'Just now',
      feedback: 'Submitted successfully. Awaiting mentor evaluation.'
    };
    currentSubmissions.unshift(newSub);
    this.contentService.saveSubmissions(currentSubmissions);

    const currentAudit = [...this.contentService.auditLogs];
    currentAudit.unshift({
      action: `New submission by ${this.studentProfile.name}: "${this.newSubmission.assignmentName}" — ${this.newSubmission.fileName}`,
      user: this.studentProfile.email || this.studentProfile.name,
      time: 'Just now',
      type: 'approval'
    });
    this.contentService.saveAuditLogs(currentAudit);

    this.showUploadSuccess = true;
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
