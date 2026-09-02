import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-mentor-picker-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mentor-picker-modal.component.html',
  styleUrl: './mentor-picker-modal.component.scss',
})
export class MentorPickerModalComponent {
  @Input() team: any = null;
  @Input() instructors: any[] = [];

  @Output() close = new EventEmitter<void>();
  @Output() select = new EventEmitter<{ teamId: string; mentorId: string }>();

  searchQuery = '';

  isTrackMatch(teamTrack: string | null | undefined, instructorTrack: string | null | undefined): boolean {
    if (!teamTrack || !instructorTrack) return false;
    const tt = teamTrack.toLowerCase().trim();
    const it = instructorTrack.toLowerCase().trim();
    return tt.includes(it) || it.includes(tt) || (tt === 'ai' && it.includes('ai')) || (tt === 'coding' && it.includes('code'));
  }

  getFilteredInstructors(teamTrack?: string): any[] {
    let list = this.instructors || [];
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      list = list.filter((i: any) =>
        (i.name && i.name.toLowerCase().includes(q)) ||
        (i.track && i.track.toLowerCase().includes(q)) ||
        (i.email && i.email.toLowerCase().includes(q))
      );
    }
    if (teamTrack) {
      list = [...list].sort((a: any, b: any) => {
        const matchA = this.isTrackMatch(teamTrack, a.track) ? 1 : 0;
        const matchB = this.isTrackMatch(teamTrack, b.track) ? 1 : 0;
        return matchB - matchA;
      });
    }
    return list;
  }

  getInitials(fullName: string): string {
    if (!fullName) return '?';
    return fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  }

  onClose(): void {
    this.searchQuery = '';
    this.close.emit();
  }

  onSelectInstructor(instId: string): void {
    if (!this.team) return;
    this.select.emit({ teamId: this.team.id, mentorId: instId });
  }

  onRemoveAssignment(): void {
    if (!this.team) return;
    this.select.emit({ teamId: this.team.id, mentorId: '' });
  }
}