import { Component, OnInit } from '@angular/core';
import { CommonModule, TitleCasePipe, DecimalPipe } from '@angular/common';
import { ContentService, LeaderboardEntry } from '../../services/content.service';

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [CommonModule, TitleCasePipe, DecimalPipe],
  templateUrl: './leaderboard.component.html',
  styleUrl: './leaderboard.component.scss'
})
export class LeaderboardComponent implements OnInit {
  constructor(public contentService: ContentService) {}

  activeTab: 'courses' | 'schools' = 'courses';
  selectedCourseTrack = 'Python Data Structures';

  courseTracks = [
    { id: 'Python Data Structures', label: 'Python Data Structures', icon: 'data_object' },
    { id: 'Intro to Neural Networks', label: 'Intro to Neural Networks', icon: 'model_training' },
    { id: 'Arduino Robotics Base', label: 'Arduino Robotics Base', icon: 'memory' },
    { id: 'Ethical Hacking 101', label: 'Ethical Hacking 101', icon: 'security' },
  ];

  courseStudentRankings: Record<string, Array<{
    rank: number;
    name: string;
    school: string;
    progressPct: number;
    accuracyPct: number;
    streakDays: number;
    algoScore: number;
    isCurrentUser: boolean;
  }>> = {
    'Python Data Structures': [
      { rank: 1, name: 'Kwame Asante (You)', school: 'Achimota School', progressPct: 98, accuracyPct: 96, streakDays: 14, algoScore: 96.8, isCurrentUser: true },
      { rank: 2, name: 'Amina Sulemana', school: 'Wesley Girls High', progressPct: 95, accuracyPct: 94, streakDays: 12, algoScore: 94.5, isCurrentUser: false },
      { rank: 3, name: 'Kofi Annan', school: 'PRESEC Legon', progressPct: 92, accuracyPct: 91, streakDays: 9, algoScore: 91.2, isCurrentUser: false },
      { rank: 4, name: 'Zainab Owusu', school: 'Mfantsipim School', progressPct: 88, accuracyPct: 89, streakDays: 7, algoScore: 88.4, isCurrentUser: false },
      { rank: 5, name: 'Samuel Boateng', school: 'Opoku Ware School', progressPct: 85, accuracyPct: 87, streakDays: 5, algoScore: 86.0, isCurrentUser: false },
      { rank: 6, name: 'Ebenezer Kwofie', school: 'Ghana National College', progressPct: 82, accuracyPct: 85, streakDays: 4, algoScore: 83.6, isCurrentUser: false },
      { rank: 7, name: 'Grace Adjei', school: 'St. Louis SHS', progressPct: 80, accuracyPct: 83, streakDays: 3, algoScore: 81.3, isCurrentUser: false },
    ],
    'Intro to Neural Networks': [
      { rank: 1, name: 'Drissa Traore', school: 'PRESEC Legon', progressPct: 100, accuracyPct: 97, streakDays: 18, algoScore: 98.2, isCurrentUser: false },
      { rank: 2, name: 'Kwame Asante (You)', school: 'Achimota School', progressPct: 88, accuracyPct: 98, streakDays: 14, algoScore: 93.4, isCurrentUser: true },
      { rank: 3, name: 'Fatima Al-Hassan', school: 'Wesley Girls High', progressPct: 86, accuracyPct: 93, streakDays: 10, algoScore: 89.7, isCurrentUser: false },
      { rank: 4, name: 'Caleb Mensah', school: 'Pope John SHS', progressPct: 84, accuracyPct: 90, streakDays: 8, algoScore: 87.1, isCurrentUser: false },
    ],
    'Arduino Robotics Base': [
      { rank: 1, name: 'Grace Adjei', school: 'St. Louis SHS', progressPct: 96, accuracyPct: 95, streakDays: 15, algoScore: 95.8, isCurrentUser: false },
      { rank: 2, name: 'Emmanuel Tetteh', school: 'Accra Academy', progressPct: 92, accuracyPct: 93, streakDays: 11, algoScore: 92.5, isCurrentUser: false },
      { rank: 3, name: 'Kwame Asante (You)', school: 'Achimota School', progressPct: 90, accuracyPct: 91, streakDays: 14, algoScore: 91.8, isCurrentUser: true },
    ],
    'Ethical Hacking 101': [
      { rank: 1, name: 'Kelvin Ofori', school: 'Prempeh College', progressPct: 94, accuracyPct: 96, streakDays: 16, algoScore: 95.2, isCurrentUser: false },
      { rank: 2, name: 'Yussif Ibrahim', school: 'Tamale SHS', progressPct: 89, accuracyPct: 92, streakDays: 10, algoScore: 90.4, isCurrentUser: false },
    ]
  };

  get filteredCourseStandings() {
    return this.courseStudentRankings[this.selectedCourseTrack] || this.courseStudentRankings['Python Data Structures'];
  }

  get isStudentUser(): boolean {
    const roleId = (typeof localStorage !== 'undefined' && localStorage.getItem('activeRoleId')) || 'student';
    return roleId === 'student';
  }

  ngOnInit(): void {
    if (this.isStudentUser) {
      this.activeTab = 'courses';
    }
  }

  get firstPlace(): LeaderboardEntry | null {
    return this.contentService.leaderboardData[0] || null;
  }

  get secondPlace(): LeaderboardEntry | null {
    return this.contentService.leaderboardData[1] || null;
  }

  get thirdPlace(): LeaderboardEntry | null {
    return this.contentService.leaderboardData[2] || null;
  }

  getInitials(name: string): string {
    if (!name) return '??';
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }

  get standings(): any[] {
    const data = this.contentService.leaderboardData;
    return data.slice(3).map((entry, index) => {
      const rankVal = index + 4;
      const avg = Math.min(100, parseFloat((entry.points / 5).toFixed(1)));
      const attendance = `${95 + (index % 5)}%`;
      return {
        rank: rankVal,
        school: entry.schoolName,
        region: entry.region || 'Ghana',
        attendance: attendance,
        avg: avg,
        pts: entry.points
      };
    });
  }
}
