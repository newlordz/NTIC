import { Routes } from '@angular/router';
import { LandingComponent } from './pages/landing/landing.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { RegistrationComponent } from './pages/registration/registration.component';
import { LmsComponent } from './pages/lms/lms.component';
import { InstructorComponent } from './pages/instructor/instructor.component';
import { JudgeComponent } from './pages/judge/judge.component';
import { CompetitionsComponent } from './pages/competitions/competitions.component';
import { LeaderboardComponent } from './pages/leaderboard/leaderboard.component';
import { TalentComponent } from './pages/talent/talent.component';
import { SponsorsComponent } from './pages/sponsors/sponsors.component';
import { ReportingComponent } from './pages/reporting/reporting.component';
import { RecordsComponent } from './pages/records/records.component';

export const routes: Routes = [
  { path: '',             component: LandingComponent, pathMatch: 'full' },
  { path: 'dashboard',    component: DashboardComponent },
  { path: 'registration', component: RegistrationComponent },
  { path: 'lms',          component: LmsComponent },
  { path: 'instructor',   component: InstructorComponent },
  { path: 'judge',        component: JudgeComponent },
  { path: 'competitions', component: CompetitionsComponent },
  { path: 'leaderboard',  component: LeaderboardComponent },
  { path: 'talent',       component: TalentComponent },
  { path: 'sponsors',     component: SponsorsComponent },
  { path: 'reporting',    component: ReportingComponent },
  { path: 'records',      component: RecordsComponent },
  { path: '**',           redirectTo: '' }
];
