import { Component, OnInit } from '@angular/core';
import { CommonModule, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContentService } from '../../services/content.service';

@Component({
  selector: 'app-lms',
  standalone: true,
  imports: [CommonModule, TitleCasePipe, FormsModule],
  templateUrl: './lms.component.html',
  styleUrl: './lms.component.scss'
})
export class LmsComponent implements OnInit {
  constructor(public contentService: ContentService) {}

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

  // Student Portal Data
  get studentProfile() {
    const activeEmail = localStorage.getItem('activeUserEmail') || '';
    const activeUser = this.contentService.users.find(u => 
      u.email?.trim().toLowerCase() === activeEmail.toLowerCase() ||
      u.ticket?.trim().toUpperCase() === activeEmail.toUpperCase()
    );
    if (activeUser) {
      return {
        name: activeUser.fullName,
        id: activeUser.id || 'STU-0012',
        school: activeUser.organization || 'Partner School',
        track: activeUser.track || 'Coding & Algorithms',
        trackId: activeUser.track?.toLowerCase().includes('robot') ? 'robotics' : 'coding',
        avatar: activeUser.fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase(),
        email: activeUser.email,
        mentor: 'Efua Mensah',
        mentorEmail: 'e.mensah@achimota.edu.gh'
      };
    }
    return {
      name: 'Kwame Asante',
      id: 'STU-0012',
      school: 'Achimota School',
      track: 'Coding & Algorithms',
      trackId: 'coding',
      avatar: 'KA',
      email: 'kwame.asante@student.ntic.gov.gh',
      mentor: 'Efua Mensah',
      mentorEmail: 'e.mensah@achimota.edu.gh'
    };
  }

  studentCourses = [
    { title: 'Python Data Structures', track: 'coding', icon: 'data_object', progress: 68, module: 'Module 4 of 8', lastActive: '2 days ago', color: 'primary' },
    { title: 'Web Dev Bootcamp', track: 'coding', icon: 'code', progress: 61, module: 'Module 6 of 10', lastActive: '3 days ago', color: 'secondary' }
  ];

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
    courseTitle: 'Python Data Structures',
    assignmentName: '',
    fileName: '',
    notes: ''
  };

  showUploadSuccess = false;

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
      alert('Please enter assignment name and file name.');
      return;
    }

    const currentSubmissions = [...this.contentService.submissions];
    const newSub = {
      id: 'sub-' + Date.now(),
      student: this.studentProfile.name,
      school: this.studentProfile.school,
      assignment: this.newSubmission.assignmentName,
      track: this.studentProfile.trackId === 'coding' ? 'Coding' : 'Robotics', // fallback
      file: this.newSubmission.fileName,
      score: null,
      status: 'pending' as const,
      time: 'Just now',
      feedback: 'Submitted successfully. Awaiting mentor evaluation.'
    };
    currentSubmissions.unshift(newSub);
    this.contentService.saveSubmissions(currentSubmissions);

    this.showUploadSuccess = true;
    this.newSubmission = {
      courseTitle: 'Python Data Structures',
      assignmentName: '',
      fileName: '',
      notes: ''
    };

    setTimeout(() => {
      this.showUploadSuccess = false;
    }, 4000);
  }
}
