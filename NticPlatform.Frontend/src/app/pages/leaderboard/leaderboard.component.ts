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
  }>> = {};

  get filteredCourseStandings() {
    return this.courseStudentRankings[this.selectedCourseTrack] || [];
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
