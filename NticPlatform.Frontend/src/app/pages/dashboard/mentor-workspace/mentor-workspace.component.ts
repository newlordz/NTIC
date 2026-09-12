import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-mentor-workspace',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mentor-workspace.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MentorWorkspaceComponent {
  @Input() pendingRequests: any[] = [];
  @Input() mentoredTeams: any[] = [];
  @Input() isResponding: boolean = false;

  @Output() respond = new EventEmitter<{ team: any; action: 'accept' | 'decline' }>();
}
