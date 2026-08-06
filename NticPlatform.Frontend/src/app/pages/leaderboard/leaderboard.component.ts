import { Component, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ContentService, LeaderboardEntry } from '../../services/content.service';

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [CommonModule, DecimalPipe, RouterModule],
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

  get restStandings(): any[] {
    const data = this.contentService.leaderboardData;
    return data.slice(3).map((entry, index) => ({
      rank: index + 4,
      school: entry.schoolName,
      region: entry.region || 'Ghana',
      pts: entry.points
    }));
  }
}
