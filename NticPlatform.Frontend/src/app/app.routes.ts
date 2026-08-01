import { Routes } from '@angular/router';
import { LandingComponent } from './pages/landing/landing.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { RegistrationComponent } from './pages/registration/registration.component';
import { ProfileCompletionComponent } from './pages/profile-completion/profile-completion.component';
import { LmsComponent } from './pages/lms/lms.component';
import { InstructorComponent } from './pages/instructor/instructor.component';
import { JudgeComponent } from './pages/judge/judge.component';
import { CompetitionsComponent } from './pages/competitions/competitions.component';
import { LeaderboardComponent } from './pages/leaderboard/leaderboard.component';
import { TalentComponent } from './pages/talent/talent.component';
import { SponsorsComponent } from './pages/sponsors/sponsors.component';
import { ReportingComponent } from './pages/reporting/reporting.component';
import { RecordsComponent } from './pages/records/records.component';
import { UserManagementComponent } from './pages/user-management/user-management.component';
import { NewsComponent } from './pages/news/news.component';
import { LmsManagerComponent } from './pages/lms-manager/lms-manager.component';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '',             component: LandingComponent, pathMatch: 'full' },
  { path: 'news',         component: NewsComponent },
  { path: 'registration', component: RegistrationComponent },
  { path: 'competitions', component: CompetitionsComponent },
  { path: 'leaderboard',  component: LeaderboardComponent },
  { path: 'talent',       component: TalentComponent },
  { path: 'dashboard',    component: DashboardComponent,         canActivate: [authGuard] },
  { path: 'profile-completion', component: ProfileCompletionComponent, canActivate: [authGuard] },
  { path: 'lms',          component: LmsComponent,              canActivate: [authGuard] },
  { path: 'lms-manager',  component: LmsManagerComponent,       canActivate: [authGuard] },
  { path: 'instructor',   component: InstructorComponent,        canActivate: [authGuard] },
  { path: 'judge',        component: JudgeComponent,             canActivate: [authGuard] },
  { path: 'sponsors',     component: SponsorsComponent,          canActivate: [authGuard] },
  { path: 'reporting',    component: ReportingComponent,         canActivate: [authGuard] },
  { path: 'records',      component: RecordsComponent,           canActivate: [authGuard] },
  { path: 'database',     redirectTo: 'records' },
  { path: 'user-management', component: UserManagementComponent,  canActivate: [authGuard] },
  { path: '**',           redirectTo: '' }
];
