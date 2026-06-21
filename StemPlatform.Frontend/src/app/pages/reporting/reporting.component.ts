import { Component } from '@angular/core';
import { CommonModule, TitleCasePipe } from '@angular/common';

@Component({ selector: 'app-reporting', standalone: true, imports: [CommonModule, TitleCasePipe],
  templateUrl: './reporting.component.html', styleUrl: './reporting.component.scss' })
export class ReportingComponent {
  activeTab = 'overview';
  reports = [
    { title: 'School Performance Report', type: 'School', date: '2026-06-17', size: '2.4 MB', status: 'ready', icon: 'account_balance' },
    { title: 'Student Progress Report — Q2', type: 'Student', date: '2026-06-15', size: '5.1 MB', status: 'ready', icon: 'person' },
    { title: 'Instructor Effectiveness Report', type: 'Instructor', date: '2026-06-10', size: '1.8 MB', status: 'ready', icon: 'badge' },
    { title: 'Sponsor Impact Report — MTN', type: 'Sponsor', date: '2026-06-08', size: '3.2 MB', status: 'ready', icon: 'handshake' },
    { title: 'Competition Results — Round 2', type: 'Competition', date: '2026-06-05', size: '4.4 MB', status: 'ready', icon: 'emoji_events' },
    { title: 'Executive Summary — June 2026', type: 'Executive', date: '2026-06-01', size: '1.2 MB', status: 'generating', icon: 'summarize' },
  ];
}
