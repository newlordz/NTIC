import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-team-detail-view',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './team-detail-view.component.html',
  styleUrls: ['./team-detail-view.component.scss']
})
export class TeamDetailViewComponent {
  @Input() team: any = null;
  @Input() schoolName = '';
  @Input() isTeamInCompetition = false;
  @Input() competitionTitle = '';
  @Input() mentorName = '';
  @Input() rosterMembers: any[] = [];
  @Input() teamSubmissions: any[] = [];
  @Input() averageScore: number | null = null;

  @Output() back = new EventEmitter<void>();
  @Output() editTeam = new EventEmitter<any>();
  @Output() inspectMember = new EventEmitter<any>();

  getInitials(name: string): string {
    if (!name) return '?';
    return name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  }

  onBack(): void {
    this.back.emit();
  }

  onEdit(): void {
    this.editTeam.emit(this.team);
  }

  onInspectMember(member: any): void {
    this.inspectMember.emit(member);
  }
}
