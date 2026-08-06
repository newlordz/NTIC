import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ThemeService } from '../../services/theme.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-public-nav',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <nav class="pub-topnav">
      <div class="pub-topnav-inner">
        <a routerLink="/" class="pub-brand">
          <span class="material-symbols-outlined fill">rocket_launch</span>
          <span>NTIC</span>
        </a>
        <div class="pub-nav-links">
          <a routerLink="/">Home</a>
          <a routerLink="/competitions" [class.active]="activePage === 'competitions'">Competitions</a>
          <a routerLink="/news" [class.active]="activePage === 'news'">News</a>
          <a routerLink="/leaderboard" [class.active]="activePage === 'leaderboard'">Leaderboard</a>
        </div>
        <div class="pub-nav-actions">
          <a routerLink="/" class="pub-home-btn">
            <span class="material-symbols-outlined">home</span>
            <span>Homepage</span>
          </a>
          <a routerLink="/" [fragment]="'news'" class="pub-back-btn">
            <span class="material-symbols-outlined">arrow_back</span>
            <span>News &amp; Events</span>
          </a>
          <button class="theme-toggle-btn" (click)="toggleTheme()" [title]="isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'">
            <span class="material-symbols-outlined">{{ isDark ? 'light_mode' : 'dark_mode' }}</span>
          </button>
        </div>
      </div>
    </nav>
  `,
  styles: [`
    .pub-topnav {
      background: var(--bg-white, #fff);
      border-bottom: 1px solid var(--border-color, #e2e8f0);
      position: sticky;
      top: 0;
      z-index: 9999;
    }
    .pub-topnav-inner {
      max-width: 1240px;
      margin: 0 auto;
      padding: 0 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 56px;
    }
    .pub-brand {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      font-weight: 800;
      font-size: 16px;
      color: var(--primary, #003f87);
    }
    .pub-brand .material-symbols-outlined {
      font-size: 22px;
      background: var(--primary, #003f87);
      color: #fff;
      width: 34px;
      height: 34px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .pub-nav-links {
      display: flex;
      gap: 4px;
    }
    .pub-nav-links a {
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      color: var(--slate, #64748b);
      text-decoration: none;
      transition: all 0.2s;
    }
    .pub-nav-links a:hover {
      color: var(--primary, #003f87);
      background: rgba(0, 63, 135, 0.05);
    }
    .pub-nav-links a.active {
      color: var(--primary, #003f87);
      background: rgba(0, 63, 135, 0.08);
    }
.pub-nav-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .pub-home-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      color: #fff;
      background: var(--primary, #003f87);
      text-decoration: none;
      transition: all 0.2s;
      box-shadow: 0 2px 6px rgba(0, 63, 135, 0.2);
    }
    .pub-home-btn .material-symbols-outlined { font-size: 17px; }
    .pub-home-btn:hover {
      background: var(--primary, #003f87);
      filter: brightness(1.1);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 63, 135, 0.3);
    }
.pub-back-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      color: var(--primary, #003f87);
      background: rgba(0, 63, 135, 0.06);
      border: 1px solid rgba(0, 63, 135, 0.18);
      text-decoration: none;
      transition: all 0.2s;
    }
    .pub-back-btn .material-symbols-outlined { font-size: 17px; }
    .pub-back-btn:hover {
      background: rgba(0, 63, 135, 0.12);
      border-color: rgba(0, 63, 135, 0.3);
      transform: translateY(-1px);
    }
    .pub-back-btn.active {
      background: rgba(0, 63, 135, 0.1);
      border-color: rgba(0, 63, 135, 0.3);
    }
    .theme-toggle-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 10px;
      border: 1px solid var(--border-color, #e2e8f0);
      background: var(--bg-ivory, #f5f8fc);
      color: var(--slate, #64748b);
      cursor: pointer;
      transition: all 0.25s;
    }
    .theme-toggle-btn .material-symbols-outlined {
      font-size: 19px;
      transition: transform 0.3s;
    }
    .theme-toggle-btn:hover {
      color: var(--primary, #003f87);
      border-color: rgba(0, 63, 135, 0.25);
      background: rgba(0, 63, 135, 0.06);
    }
    .theme-toggle-btn:hover .material-symbols-outlined {
      transform: rotate(20deg);
    }
    :host-context(body.dark-theme) .pub-topnav {
      background: #0b1329;
      border-bottom-color: rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(12px);
    }
    :host-context(body.dark-theme) .pub-brand { color: #38bdf8; }
    :host-context(body.dark-theme) .pub-brand .material-symbols-outlined { background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff; }
    :host-context(body.dark-theme) .pub-nav-links a { color: #94a3b8; }
    :host-context(body.dark-theme) .pub-nav-links a:hover { color: #f8fafc; background: rgba(255, 255, 255, 0.08); }
    :host-context(body.dark-theme) .pub-nav-links a.active { color: #38bdf8; background: rgba(56, 189, 248, 0.16); font-weight: 700; border: 1px solid rgba(56, 189, 248, 0.25); }
    :host-context(body.dark-theme) .theme-toggle-btn {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.12);
      color: #f1f5f9;
    }
    :host-context(body.dark-theme) .theme-toggle-btn:hover {
      color: #38bdf8;
      border-color: rgba(56, 189, 248, 0.4);
      background: rgba(56, 189, 248, 0.12);
    }
    :host-context(body.dark-theme) .pub-home-btn {
      background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
    }
    :host-context(body.dark-theme) .pub-home-btn:hover {
      background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
    }
    :host-context(body.dark-theme) .pub-back-btn {
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.08);
      border-color: rgba(56, 189, 248, 0.2);
    }
    :host-context(body.dark-theme) .pub-back-btn:hover,
    :host-context(body.dark-theme) .pub-back-btn.active {
      color: #7dd3fc;
      background: rgba(56, 189, 248, 0.14);
      border-color: rgba(56, 189, 248, 0.4);
    }
  `]
})
export class PublicNavComponent implements OnInit, OnDestroy {
  @Input() activePage = '';
  isDark = false;
  private sub?: Subscription;

  constructor(public themeService: ThemeService) {}

  ngOnInit(): void {
    this.isDark = this.themeService.isDarkMode;
    this.sub = this.themeService.isDarkMode$.subscribe(isDark => {
      this.isDark = isDark;
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }
}
