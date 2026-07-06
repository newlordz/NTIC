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

  ngOnInit(): void {}

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
