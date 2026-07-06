import { Component, OnInit } from '@angular/core';
import { CommonModule, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContentService, Competition } from '../../services/content.service';

@Component({
  selector: 'app-competitions',
  standalone: true,
  imports: [CommonModule, TitleCasePipe, FormsModule],
  templateUrl: './competitions.component.html',
  styleUrl: './competitions.component.scss'
})
export class CompetitionsComponent implements OnInit {
  isCreateModalOpen = false;
  
  // Form State
  formComp: Omit<Competition, 'id' | 'icon' | 'teams'> = {
    title: '',
    track: 'coding',
    category: '',
    deadline: '',
    prize: '₵ 5,000',
    status: 'registration',
    progress: 0
  };

  get competitions(): Competition[] {
    return this.contentService.competitions;
  }

  get isAdmin(): boolean {
    if (typeof window === 'undefined') return false;
    const role = localStorage.getItem('activeRoleId');
    return role === 'super_admin';
  }

  constructor(public contentService: ContentService) {}

  ngOnInit(): void {
    // Competitions list is automatically synced from ContentService
  }

  openCreateModal(): void {
    this.formComp = {
      title: '',
      track: 'coding',
      category: '',
      deadline: new Date().toISOString().split('T')[0],
      prize: '₵ 5,000',
      status: 'registration',
      progress: 0
    };
    this.isCreateModalOpen = true;
  }

  closeCreateModal(): void {
    this.isCreateModalOpen = false;
  }

  submitCreateForm(): void {
    if (!this.formComp.title.trim() || !this.formComp.category.trim()) return;

    // Map track to material icon
    const iconMap: Record<string, string> = {
      'coding': 'code',
      'robotics': 'smart_toy',
      'ai': 'model_training',
      'cyber': 'security',
      'innovation': 'lightbulb'
    };

    // Format deadline date to readable string (e.g. Jun 28, 2026)
    let formattedDeadline = this.formComp.deadline;
    if (formattedDeadline) {
      const dateObj = new Date(formattedDeadline);
      if (!isNaN(dateObj.getTime())) {
        formattedDeadline = dateObj.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
      }
    }

    const newComp: Omit<Competition, 'id'> = {
      title: this.formComp.title.trim(),
      track: this.formComp.track,
      icon: iconMap[this.formComp.track] || 'emoji_events',
      category: this.formComp.category.trim(),
      teams: 0, // start with 0 teams
      deadline: formattedDeadline || 'Jul 15, 2026',
      prize: this.formComp.prize.trim() || '₵ 5,000',
      status: this.formComp.status,
      progress: this.formComp.progress || 0
    };

    this.contentService.addCompetition(newComp);
    this.closeCreateModal();
  }

  deleteCompetition(id: string, event: Event): void {
    event.stopPropagation();
    if (confirm('Are you sure you want to delete this competition?')) {
      this.contentService.removeCompetition(id);
    }
  }

  // Quick stats computed live
  get activeCount(): number {
    return this.competitions.filter(c => c.status === 'active').length;
  }

  get totalTeamsCount(): number {
    // Dynamic sum of teams registered across all comps
    return this.competitions.reduce((sum, c) => sum + (c.teams || 0), 0);
  }

  get pendingJudgingCount(): number {
    // Dynamic value based on pending submissions in ContentService
    return this.contentService.submissions.filter(s => s.status === 'pending').length;
  }

  get finalsThisWeek(): number {
    return this.competitions.filter(c => c.progress > 80 && c.status === 'active').length;
  }
}
