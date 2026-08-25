import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ContentService } from '../../../services/content.service';
import { FileStorageService } from '../../../services/file-storage.service';

/**
 * Application preview modal (school / team / instructor / student).
 *
 * Extracted from the dashboard's monolithic template to keep the compiled
 * template under the Angular compiler's control-flow-analysis size limit
 * (the NG3 error). It renders a read-only preview of a pending approval and
 * reports actions (close / approve / reject) back up to the parent.
 */
@Component({
  selector: 'app-application-preview-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './application-preview-modal.component.html',
  styleUrl: './application-preview-modal.component.scss',
})
export class ApplicationPreviewModalComponent {
  @Input() request: any = null;
  /** fileId -> resolved URL, maintained by the parent and passed down. */
  @Input() logoUrls: Record<string, string> = {};

  @Output() close = new EventEmitter<void>();
  @Output() approve = new EventEmitter<any>();
  @Output() reject = new EventEmitter<void>();

  constructor(
    private contentService: ContentService,
    private fileStorage: FileStorageService
  ) {}

  getLogoUrl(details: any): string {
    const fileId = details?.logoFileId || details?.photoFileId;
    if (fileId && this.logoUrls[fileId]) return this.logoUrls[fileId];
    return '';
  }

  getSchoolStudentCount(details: any): number {
    if (!details) return 0;
    const soloCount = Array.isArray(details.students)
      ? details.students.length
      : (details.studentCount && !details.teamsList?.length ? details.studentCount : 0);
    const teams = Array.isArray(details.teamsList) ? details.teamsList : [];
    const teamMembersCount = teams.reduce((sum: number, t: any) => {
      const roster = this.getTeamMembers(t);
      return sum + (roster.length > 0 ? roster.length : 1);
    }, 0);
    const total = soloCount + teamMembersCount;
    return Math.max(total, details.studentCount || 0);
  }

  getTeamMembers(team: any): string[] {
    if (!team) return [];
    if (Array.isArray(team.rosterList) && team.rosterList.length > 0) return team.rosterList;
    if (Array.isArray(team.members) && team.members.length > 0) return team.members;
    const directNames = [team.leadName, team.member2Name, team.member3Name, team.member4Name, team.member5Name]
      .filter(Boolean)
      .map(n => String(n).trim())
      .filter(n => n.length > 0);
    if (directNames.length > 0) return directNames;

    // Cross-reference from pending / approved registrations
    const teamName = (team.name || '').trim().toLowerCase();
    if (teamName) {
      const allReqs = [...this.contentService.pendingApprovals, ...this.contentService.approvedApprovals];
      for (const req of allReqs) {
        if (req.details?.teamsList && Array.isArray(req.details.teamsList)) {
          const match = req.details.teamsList.find((t: any) => (t.name || '').trim().toLowerCase() === teamName);
          if (match) {
            const matchNames = [match.leadName, match.member2Name, match.member3Name, match.member4Name, match.member5Name]
              .filter(Boolean)
              .map(n => String(n).trim())
              .filter(n => n.length > 0);
            if (matchNames.length > 0) return matchNames;
          }
        }
      }
    }

    if (team.lead && typeof team.lead === 'string' && team.lead.trim()) {
      return [team.lead.trim()];
    }
    return [];
  }

  async viewDocument(docName: string, schoolName: string): Promise<void> {
    const fileId = docName.includes('::') ? docName.split('::')[0] : null;
    if (fileId) {
      const url = await this.fileStorage.getUrl(fileId);
      if (url) window.open(url, '_blank');
    }
  }
}
