import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ContentService } from '../../services/content.service';

@Component({
  selector: 'app-sponsors',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sponsors.component.html',
  styleUrl: './sponsors.component.scss'
})
export class SponsorsComponent implements OnInit {
  constructor(public contentService: ContentService) {}

  ngOnInit(): void {}

  get activeSponsors(): any[] {
    const sponsors = this.contentService.users.filter(u => u.role === 'sponsor');
    return sponsors.map(s => {
      const tier = s.tier || 'Gold';
      const committed = s.tier === 'Platinum' ? '₵ 100,000' : s.tier === 'Gold' ? '₵ 55,000' : '₵ 30,000';
      const schools = s.tier === 'Platinum' ? 47 : s.tier === 'Gold' ? 32 : 15;
      const students = s.tier === 'Platinum' ? 1248 : s.tier === 'Gold' ? 850 : 380;
      const hours = s.tier === 'Platinum' ? 2400 : s.tier === 'Gold' ? 1800 : 720;
      return {
        name: s.organization || s.fullName,
        tier,
        committed,
        schools,
        students,
        hours,
        logo: (s.organization || s.fullName).charAt(0),
        color: s.tier === 'Platinum' ? '#FFCB05' : s.tier === 'Gold' ? '#E60000' : '#006a60'
      };
    });
  }

  get totalCommitted(): string {
    const sponsors = this.contentService.users.filter(u => u.role === 'sponsor');
    const total = sponsors.reduce((acc, s) => acc + (s.tier === 'Platinum' ? 100 : s.tier === 'Gold' ? 55 : 30), 0);
    return `₵${total}k`;
  }
}
