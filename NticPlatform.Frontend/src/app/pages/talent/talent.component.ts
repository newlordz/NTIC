import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ContentService } from '../../services/content.service';

@Component({
  selector: 'app-talent',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './talent.component.html',
  styleUrl: './talent.component.scss'
})
export class TalentComponent {
  constructor(public contentService: ContentService) {}

  isGroupEntry(h: any): boolean {
    if (!h) return false;
    if (h.type === 'group') return true;
    if (h.members && Array.isArray(h.members) && h.members.length > 0) return true;
    if (h.badge && (h.badge.includes('Squad') || h.badge.includes('Team') || h.badge.includes('SQUAD') || h.badge.includes('TEAM'))) return true;
    return false;
  }

  getMembers(h: any): string[] {
    if (!h) return [];
    if (Array.isArray(h.members) && h.members.length > 0) return h.members;
    if (this.isGroupEntry(h)) {
      if (h.name && h.name.toLowerCase().includes('gsts')) {
        return ['Kofi Boateng', 'Yaw Appiah', 'Seth Addo', 'Emmanuel Quaye'];
      }
      return ['Kwame Asante', 'Abena Mensah', 'Kofi Nyarko', 'Efua Donkor'];
    }
    return [];
  }
}
