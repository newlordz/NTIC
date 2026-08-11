import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '',             loadComponent: () => import('./pages/landing/landing.component').then(m => m.LandingComponent), pathMatch: 'full' },
  { path: 'news',         loadComponent: () => import('./pages/news/news.component').then(m => m.NewsComponent) },
  { path: 'registration', loadComponent: () => import('./pages/registration/registration.component').then(m => m.RegistrationComponent) },
  { path: 'competitions', loadComponent: () => import('./pages/competitions/competitions.component').then(m => m.CompetitionsComponent) },
  { path: 'admin/competitions', loadComponent: () => import('./pages/admin-competitions/admin-competitions.component').then(m => m.AdminCompetitionsComponent), canActivate: [authGuard] },
  { path: 'leaderboard',  loadComponent: () => import('./pages/leaderboard/leaderboard.component').then(m => m.LeaderboardComponent) },
  { path: 'talent',       loadComponent: () => import('./pages/talent/talent.component').then(m => m.TalentComponent) },
  { path: 'dashboard',    loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent), canActivate: [authGuard] },
  { path: 'profile-completion', loadComponent: () => import('./pages/profile-completion/profile-completion.component').then(m => m.ProfileCompletionComponent), canActivate: [authGuard] },
  { path: 'lms',          loadComponent: () => import('./pages/lms/lms.component').then(m => m.LmsComponent), canActivate: [authGuard] },
  { path: 'lms-manager',  loadComponent: () => import('./pages/lms-manager/lms-manager.component').then(m => m.LmsManagerComponent), canActivate: [authGuard] },
  { path: 'instructor',   loadComponent: () => import('./pages/instructor/instructor.component').then(m => m.InstructorComponent), canActivate: [authGuard] },
  { path: 'judge',        loadComponent: () => import('./pages/judge/judge.component').then(m => m.JudgeComponent), canActivate: [authGuard] },
  { path: 'sponsors',     loadComponent: () => import('./pages/sponsors/sponsors.component').then(m => m.SponsorsComponent), canActivate: [authGuard] },
  { path: 'reporting',    loadComponent: () => import('./pages/reporting/reporting.component').then(m => m.ReportingComponent), canActivate: [authGuard] },
  { path: 'records',      loadComponent: () => import('./pages/records/records.component').then(m => m.RecordsComponent), canActivate: [authGuard] },
  { path: 'database',     redirectTo: 'records' },
  { path: 'user-management', loadComponent: () => import('./pages/user-management/user-management.component').then(m => m.UserManagementComponent), canActivate: [authGuard] },
  { path: '**',           redirectTo: '' }
];
