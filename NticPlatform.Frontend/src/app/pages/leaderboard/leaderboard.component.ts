import { Component, ChangeDetectionStrategy, OnInit , ChangeDetectorRef } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ContentService, LeaderboardEntry } from '../../services/content.service';
import { PublicNavComponent } from '../../components/public-nav/public-nav.component';
import { getAuthValue } from '../../services/session.util';

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [CommonModule, DecimalPipe, RouterModule, FormsModule, PublicNavComponent],
  templateUrl: './leaderboard.component.html',
  styleUrl: './leaderboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeaderboardComponent implements OnInit {
  isLoggedIn = false;
  isAdmin = false;
  showAddForm = false;
  editId: string | null = null;
  formError = '';

  lbForm: any = {
    schoolName: '',
    location: '',
    region: '',
    trackPoints: { all: 0, coding: 0, robotics: 0, ai: 0, cyber: 0 }
  };

  constructor(public contentService: ContentService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    const role = getAuthValue('activeRoleId');
    this.isLoggedIn = !!role;
    this.isAdmin = role === 'super_admin' || role === 'admin';
    this.cdr.markForCheck();
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

  get restStandings(): any[] {
    const data = this.contentService.leaderboardData;
    return data.slice(3).map((entry, index) => ({
      rank: index + 4,
      school: entry.schoolName,
      region: entry.region || 'Ghana',
      pts: entry.points
    }));
  }

  trackBySchool(index: number, item: any): string {
    return item.school || String(index);
  }

  openAddForm(): void {
    this.editId = null;
    this.lbForm = { schoolName: '', location: '', region: '', trackPoints: { all: 0, coding: 0, robotics: 0, ai: 0, cyber: 0 } };
    this.showAddForm = true;
    this.formError = '';
  }

  editEntry(entry: LeaderboardEntry): void {
    this.editId = entry.id;
    this.lbForm = {
      schoolName: entry.schoolName,
      location: entry.location,
      region: entry.region,
      trackPoints: { ...entry.trackPoints }
    };
    this.showAddForm = true;
    this.formError = '';
  }

  closeForm(): void {
    this.showAddForm = false;
    this.editId = null;
  }

  onTrackChange(): void {
    const tp = this.lbForm.trackPoints;
    tp.all = (tp.coding || 0) + (tp.robotics || 0) + (tp.ai || 0) + (tp.cyber || 0);
  }

  submitForm(): void {
    if (!this.lbForm.schoolName?.trim()) {
      this.formError = 'School name is required.';
      return;
    }
    if (!this.lbForm.location?.trim()) {
      this.formError = 'Location is required.';
      return;
    }
    const entry: any = {
      schoolName: this.lbForm.schoolName.trim(),
      location: this.lbForm.location.trim(),
      region: this.lbForm.region?.trim() || '',
      points: this.lbForm.trackPoints.all,
      trackPoints: { ...this.lbForm.trackPoints },
      rank: '99'
    };

    if (this.editId) {
      this.contentService.updateLeaderboardEntry(this.editId, entry);
    } else {
      this.contentService.addLeaderboardEntry(entry);
    }
    this.closeForm();
  }

  removeEntry(id: string): void {
    if (confirm('Remove this school from the leaderboard?')) {
      this.contentService.removeLeaderboardEntry(id);
    }
  }

  exportCSV(): void {
    const data = this.contentService.leaderboardData;
    const header = 'Rank,School,Region,Coding,Robotics,AI,Cyber,Total';
    const rows = data.map((e, i) =>
      `${i + 1},"${e.schoolName}","${e.region || ''}",${e.trackPoints.coding},${e.trackPoints.robotics},${e.trackPoints.ai},${e.trackPoints.cyber},${e.points}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ntic-leaderboard.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
}
