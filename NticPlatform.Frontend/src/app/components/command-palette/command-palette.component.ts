import { Component, HostListener, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ThemeService } from '../../services/theme.service';
import { getAuthValue } from '../../services/session.util';
import { NotificationService } from '../../services/notification.service';

export interface CommandItem {
  id: string;
  title: string;
  category: 'Navigation' | 'Admin & Audit' | 'Actions' | 'Tools';
  icon: string;
  route?: string;
  queryParams?: Record<string, string>;
  action?: () => void;
  keywords: string[];
  roleRequired?: string[];
}

@Component({
  selector: 'app-command-palette',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './command-palette.component.html',
  styleUrl: './command-palette.component.scss'
})
export class CommandPaletteComponent implements OnInit {
  public isOpen = false;
  public searchQuery = '';
  public selectedIndex = 0;

  private router = inject(Router);
  public themeService = inject(ThemeService);
  private notificationService = inject(NotificationService);

  public commands: CommandItem[] = [];

  ngOnInit(): void {
    this.initCommands();
  }

  private initCommands(): void {
    this.commands = [
      {
        id: 'nav-dashboard',
        title: 'Executive Dashboard & Command Center',
        category: 'Navigation',
        icon: 'dashboard',
        route: '/dashboard',
        keywords: ['overview', 'metrics', 'kpi', 'home', 'stats']
      },
      {
        id: 'nav-admin-control',
        title: 'Administration Center Hub',
        category: 'Admin & Audit',
        icon: 'admin_panel_settings',
        route: '/dashboard',
        queryParams: { tab: 'control' },
        keywords: ['users', 'tokens', 'approvals', 'roles', 'settings']
      },
      {
        id: 'nav-audit-trail',
        title: 'Live Security Audit Trail & Stream',
        category: 'Admin & Audit',
        icon: 'receipt_long',
        route: '/dashboard',
        queryParams: { tab: 'control', subTab: 'audit' },
        keywords: ['logs', 'security', 'events', 'compliance', 'stream', 'telemetry']
      },
      {
        id: 'nav-entity-archive',
        title: 'Document & Entity Records Archive',
        category: 'Admin & Audit',
        icon: 'folder_open',
        route: '/records',
        keywords: ['documents', 'archive', 'records', 'schools', 'submissions', 'certificates']
      },
      {
        id: 'nav-competitions',
        title: 'Championship Competitions & Arenas',
        category: 'Navigation',
        icon: 'emoji_events',
        route: '/competitions',
        keywords: ['tournaments', 'matches', 'tracks', 'teams', 'contests']
      },
      {
        id: 'nav-judge',
        title: 'Judging Arena & Scoring Desk',
        category: 'Navigation',
        icon: 'gavel',
        route: '/judge',
        keywords: ['grading', 'rubric', 'evaluation', 'submissions']
      },
      {
        id: 'nav-instructor',
        title: 'Instructor Portal & Squad Roster',
        category: 'Navigation',
        icon: 'patient_list',
        route: '/instructor',
        keywords: ['teacher', 'students', 'teams', 'class']
      },
      {
        id: 'nav-lms',
        title: 'LMS Learning Platform & Modules',
        category: 'Navigation',
        icon: 'school',
        route: '/lms',
        keywords: ['courses', 'curriculum', 'lessons', 'materials', 'study']
      },
      {
        id: 'nav-lms-manager',
        title: 'LMS Curriculum Manager',
        category: 'Admin & Audit',
        icon: 'menu_book',
        route: '/lms-manager',
        keywords: ['create course', 'manage lessons', 'curriculum admin']
      },
      {
        id: 'nav-leaderboard',
        title: 'National Championship Leaderboard',
        category: 'Navigation',
        icon: 'leaderboard',
        route: '/leaderboard',
        keywords: ['rankings', 'scores', 'podium', 'standings']
      },
      {
        id: 'nav-talent',
        title: 'Talent Discovery & Scouting Matrix',
        category: 'Navigation',
        icon: 'stars',
        route: '/talent',
        keywords: ['scouts', 'top performers', 'recruitment', 'awards']
      },
      {
        id: 'nav-sponsors',
        title: 'Sponsors & Partnership Arena',
        category: 'Navigation',
        icon: 'handshake',
        route: '/sponsors',
        keywords: ['partners', 'donations', 'corporate', 'packages']
      },
      {
        id: 'nav-reports',
        title: 'Platform Analytics & Regional Reports',
        category: 'Navigation',
        icon: 'assessment',
        route: '/reporting',
        keywords: ['charts', 'export', 'regional statistics', 'summary']
      },
      {
        id: 'act-theme-toggle',
        title: 'Toggle Dark / Light Theme Mode',
        category: 'Actions',
        icon: 'brightness_6',
        action: () => {
          this.themeService.toggleTheme();
          this.notificationService.info(`Switched to ${this.themeService.isDarkMode ? 'Dark' : 'Light'} Mode`);
        },
        keywords: ['night', 'dark', 'light', 'contrast', 'color']
      }
    ];
  }

  public get filteredCommands(): CommandItem[] {
    const q = (this.searchQuery || '').trim().toLowerCase();
    if (!q) {
      return this.commands;
    }
    return this.commands.filter(cmd => {
      const matchTitle = cmd.title.toLowerCase().includes(q);
      const matchCategory = cmd.category.toLowerCase().includes(q);
      const matchKeywords = cmd.keywords.some(k => k.toLowerCase().includes(q));
      return matchTitle || matchCategory || matchKeywords;
    });
  }

  @HostListener('window:keydown', ['$event'])
  public handleKeyboardShortcut(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && (event.key === 'k' || event.key === 'K')) {
      event.preventDefault();
      this.togglePalette();
    } else if (event.key === 'Escape' && this.isOpen) {
      this.closePalette();
    } else if (this.isOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const max = this.filteredCommands.length;
        if (max > 0) {
          this.selectedIndex = (this.selectedIndex + 1) % max;
        }
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const max = this.filteredCommands.length;
        if (max > 0) {
          this.selectedIndex = (this.selectedIndex - 1 + max) % max;
        }
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const filtered = this.filteredCommands;
        if (filtered.length > 0 && this.selectedIndex < filtered.length) {
          this.executeCommand(filtered[this.selectedIndex]);
        }
      }
    }
  }

  public togglePalette(): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.searchQuery = '';
      this.selectedIndex = 0;
    }
  }

  public closePalette(): void {
    this.isOpen = false;
  }

  public executeCommand(item: CommandItem): void {
    this.closePalette();
    if (item.action) {
      item.action();
    } else if (item.route) {
      this.router.navigate([item.route], { queryParams: item.queryParams });
    }
  }
}
