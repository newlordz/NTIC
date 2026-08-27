import { getAuthValue } from '../../services/session.util';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { ContentService, Competition, CompetitionPhase } from '../../services/content.service';
import { ThemeService } from '../../services/theme.service';
import { CYCLE_STATUSES, advanceLabel, advanceIcon } from '../../services/competition-lifecycle';

@Component({
  selector: 'app-admin-competitions',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './admin-competitions.component.html',
  styleUrl: './admin-competitions.component.scss'
})
export class AdminCompetitionsComponent implements OnInit {
  competitions: Competition[] = [];
  filteredCompetitions: Competition[] = [];
  activeTab = 'all';
  searchQuery = '';
  isFormModalOpen = false;
  isDetailPanelOpen = false;
  isDeleteConfirmOpen = false;
  isPhaseModalOpen = false;
  editingCompetition: Competition | null = null;
  selectedCompetition: Competition | null = null;
  deletingCompetition: Competition | null = null;
  editingPhase: CompetitionPhase | null = null;
  editingPhaseIndex = -1;

  viewMode: 'grid' | 'board' = 'grid';
  formStep = 1;
  activeTrackFilter = 'all';
  activeTypeFilter = 'all';

  formModel: any = {};
  phaseModel: any = {};

  tabs = [
    { id: 'all', label: 'All Cycles', icon: 'emoji_events' },
    { id: 'active', label: 'Active', icon: 'play_circle' },
    { id: 'registration', label: 'Registration Open', icon: 'how_to_reg' },
    { id: 'draft', label: 'Drafts', icon: 'edit_note' },
    { id: 'completed', label: 'Completed', icon: 'check_circle' }
  ];

  cycleTypes = ['qualifier', 'quarter-finals', 'finals'];
  tracks = ['all', 'coding', 'robotics', 'ai', 'cyber', 'innovation'];
  statuses: readonly Competition['status'][] = CYCLE_STATUSES;
  phaseTypes: CompetitionPhase['type'][] = ['registration', 'submission', 'judging', 'results', 'break'];

  boardColumns = [
    { id: 'draft', label: 'Drafts', icon: 'edit_note', color: '#94a3b8' },
    { id: 'registration', label: 'Registration', icon: 'how_to_reg', color: '#f59e0b' },
    { id: 'active', label: 'Active', icon: 'play_circle', color: '#003f87' },
    { id: 'completed', label: 'Completed', icon: 'check_circle', color: '#10b981' }
  ];

  phaseTemplates = [
    {
      id: 'standard',
      label: 'Standard',
      icon: 'view_timeline',
      phases: [
        { name: 'Registration Window', type: 'registration', status: 'pending', description: 'Teams sign up and confirm eligibility.' },
        { name: 'Project Submission', type: 'submission', status: 'pending', description: 'Teams upload their solutions and presentations.' },
        { name: 'Judging & Evaluation', type: 'judging', status: 'pending', description: 'Panel reviews and scores all submissions.' },
        { name: 'Results Announcement', type: 'results', status: 'pending', description: 'Winners revealed and prizes awarded.' }
      ]
    },
    {
      id: 'speed',
      label: 'Speed Round',
      icon: 'bolt',
      phases: [
        { name: 'Submission Sprint', type: 'submission', status: 'pending', description: 'Quick-fire submission window.' },
        { name: 'Results', type: 'results', status: 'pending', description: 'Instant leaderboard reveal.' }
      ]
    },
    {
      id: 'full',
      label: 'Full Cycle',
      icon: 'all_inclusive',
      phases: [
        { name: 'Registration Window', type: 'registration', status: 'pending', description: 'Teams sign up.' },
        { name: 'Project Submission', type: 'submission', status: 'pending', description: 'Teams submit their work.' },
        { name: 'Judging & Evaluation', type: 'judging', status: 'pending', description: 'Evaluation by the panel.' },
        { name: 'Break & Deliberation', type: 'break', status: 'pending', description: 'Judges deliberate on final scores.' },
        { name: 'Results Ceremony', type: 'results', status: 'pending', description: 'Grand reveal and prize ceremony.' }
      ]
    }
  ];

  get activeRoleId(): string {
    // Default to no role. Defaulting to 'super_admin' meant a visitor with
    // empty storage was treated as an administrator by the UI.
    return (typeof localStorage !== 'undefined' && getAuthValue('activeRoleId')) || '';
  }

  get canManageCompetitions(): boolean {
    return ['super_admin', 'admin', 'support_admin', 'school_admin', 'instructor', 'competition_manager', 'content_manager'].includes(this.activeRoleId);
  }

  get totalCycles(): number { return this.competitions.length; }
  get liveCycles(): number { return this.competitions.filter(c => c.status === 'active').length; }
  get openRegistrationCycles(): number { return this.competitions.filter(c => c.status === 'registration').length; }

  getColumnCycles(statusId: string): Competition[] {
    return this.competitions.filter(c => c.status === statusId);
  }

  getCountdown(dateStr: string): string {
    if (!dateStr) return '';
    const ts = new Date(dateStr).getTime();
    if (isNaN(ts)) return '';
    const diff = ts - Date.now();
    if (diff <= 0) return 'Overdue';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      return hours <= 0 ? 'Due soon' : `${hours}h left`;
    }
    return `${days}d left`;
  }

  countdownClass(dateStr: string): string {
    if (!dateStr) return '';
    const ts = new Date(dateStr).getTime();
    if (isNaN(ts)) return '';
    const diff = ts - Date.now();
    if (diff <= 0) return 'overdue';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days <= 2) return 'urgent';
    if (days <= 7) return 'warning';
    return 'normal';
  }

  showCountdown(comp: Competition): boolean {
    return !!comp.deadline && (comp.status === 'active' || comp.status === 'registration');
  }

  constructor(public contentService: ContentService, public themeService: ThemeService, private router: Router) {}

  ngOnInit(): void {
    const role = getAuthValue('activeRoleId') || '';
    if (!['super_admin', 'admin', 'support_admin', 'competition_manager', 'content_manager', 'school_admin', 'instructor'].includes(role)) {
      this.router.navigate(['/dashboard']);
      return;
    }
    this.loadCompetitions();
  }

  loadCompetitions(): void {
    this.competitions = [...this.contentService.competitions].sort((a, b) => {
      const aDate = a.createdAt || a.startDate || a.deadline;
      const bDate = b.createdAt || b.startDate || b.deadline;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
    this.applyFilters();
  }

  applyFilters(): void {
    let filtered = [...this.competitions];

    if (this.activeTab !== 'all') {
      filtered = filtered.filter(c => c.status === this.activeTab);
    }

    if (this.activeTrackFilter !== 'all') {
      filtered = filtered.filter(c => c.track === this.activeTrackFilter);
    }

    if (this.activeTypeFilter !== 'all') {
      filtered = filtered.filter(c => c.type === this.activeTypeFilter);
    }

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.track.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
      );
    }

    this.filteredCompetitions = filtered;
  }

  setTab(tabId: string): void {
    this.activeTab = tabId;
    this.applyFilters();
  }

  setTrackFilter(track: string): void {
    this.activeTrackFilter = track;
    this.applyFilters();
  }

  setTypeFilter(type: string): void {
    this.activeTypeFilter = type;
    this.applyFilters();
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.activeTrackFilter = 'all';
    this.activeTypeFilter = 'all';
    this.applyFilters();
  }

  get hasActiveFilters(): boolean {
    return this.searchQuery.trim().length > 0 ||
      this.activeTrackFilter !== 'all' ||
      this.activeTypeFilter !== 'all';
  }

  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'grid' ? 'board' : 'grid';
  }

  openCreateModal(): void {
    this.editingCompetition = null;
    this.formStep = 1;
    this.formModel = {
      title: '',
      description: '',
      type: 'qualifier',
      track: 'all',
      category: 'General',
      teams: 0,
      maxTeams: 50,
      deadline: '',
      startDate: '',
      endDate: '',
      prize: '',
      icon: 'emoji_events',
      status: 'draft',
      progress: 0,
      rules: '',
      criteria: '',
      phases: []
    };
    this.isFormModalOpen = true;
  }

  openEditModal(comp: Competition): void {
    this.editingCompetition = comp;
    this.formStep = 1;
    this.formModel = {
      title: comp.title,
      description: comp.description || '',
      type: comp.type || 'qualifier',
      track: comp.track,
      category: comp.category,
      teams: comp.teams,
      maxTeams: comp.maxTeams || 50,
      deadline: comp.deadline,
      startDate: comp.startDate || '',
      endDate: comp.endDate || '',
      prize: comp.prize,
      icon: comp.icon,
      status: comp.status,
      progress: comp.progress,
      rules: comp.rules || '',
      criteria: comp.criteria || '',
      phases: comp.phases || []
    };
    this.isFormModalOpen = true;
    if (this.isDetailPanelOpen) this.closeDetailPanel();
  }

  closeFormModal(): void {
    this.isFormModalOpen = false;
    this.editingCompetition = null;
    this.formStep = 1;
  }

  canAdvanceStep(): boolean {
    if (this.formStep === 1) return !!this.formModel.title?.trim();
    if (this.formStep === 2) return true;
    return true;
  }

  nextStep(): void {
    if (this.canAdvanceStep() && this.formStep < 3) this.formStep++;
  }

  prevStep(): void {
    if (this.formStep > 1) this.formStep--;
  }

  saveCompetition(): void {
    const now = new Date().toISOString();
    const data: Partial<Competition> = {
      ...this.formModel,
      description: this.formModel.description || `${this.formModel.type} round for ${this.formModel.track} track`,
      phases: this.formModel.phases || [],
      createdAt: this.editingCompetition?.createdAt || now
    };

    if (this.editingCompetition) {
      this.contentService.updateCompetition({ id: this.editingCompetition.id, ...data } as Competition);
    } else {
      this.contentService.addCompetition(data as Omit<Competition, 'id'>);
    }

    this.closeFormModal();
    this.loadCompetitions();
  }

  applyPhaseTemplate(templateId: string): void {
    const tpl = this.phaseTemplates.find(t => t.id === templateId);
    if (!tpl) return;
    this.formModel.phases = tpl.phases.map((p, i) => ({
      ...p,
      id: `phase-${Date.now()}-${i}`,
      startDate: '',
      endDate: ''
    }));
  }

  openDetailPanel(comp: Competition): void {
    this.selectedCompetition = comp;
    this.isDetailPanelOpen = true;
  }

  closeDetailPanel(): void {
    this.isDetailPanelOpen = false;
    this.selectedCompetition = null;
  }

  confirmDelete(comp: Competition): void {
    this.deletingCompetition = comp;
    this.isDeleteConfirmOpen = true;
  }

  deleteCompetition(): void {
    if (this.deletingCompetition) {
      this.contentService.removeCompetition(this.deletingCompetition.id);
      this.deletingCompetition = null;
      this.isDeleteConfirmOpen = false;
      this.closeDetailPanel();
      this.loadCompetitions();
    }
  }

  cancelDelete(): void {
    this.isDeleteConfirmOpen = false;
    this.deletingCompetition = null;
  }

  duplicateCompetition(comp: Competition): void {
    const { id, createdAt, ...rest } = comp;
    this.contentService.addCompetition({
      ...rest,
      title: comp.title + ' (Copy)',
      status: 'draft',
      teams: 0,
      progress: 0
    } as any);
    this.loadCompetitions();
  }

  updateStatus(comp: Competition, newStatus: Competition['status']): void {
    // ContentService owns the transition rules; it refuses illegal moves and
    // returns null so the detail panel does not show a state the API rejected.
    const updated = this.contentService.setCompetitionStatus(comp, newStatus);
    if (!updated) return;
    if (this.selectedCompetition?.id === comp.id) {
      this.selectedCompetition = updated;
    }
    this.loadCompetitions();
  }

  quickAdvanceStatus(comp: Competition, event: Event): void {
    event.stopPropagation();
    const updated = this.contentService.advanceCompetitionStatus(comp);
    if (!updated) return;
    if (this.selectedCompetition?.id === comp.id) {
      this.selectedCompetition = updated;
    }
    this.loadCompetitions();
  }

  quickLabel(status: Competition['status']): string {
    return advanceLabel(status);
  }

  quickIcon(status: Competition['status']): string {
    return advanceIcon(status);
  }


  openPhaseModal(phase?: CompetitionPhase, index?: number): void {
    if (phase && index !== undefined) {
      this.editingPhase = phase;
      this.editingPhaseIndex = index;
      this.phaseModel = { ...phase };
    } else {
      this.editingPhase = null;
      this.editingPhaseIndex = -1;
      this.phaseModel = {
        id: '',
        name: '',
        description: '',
        startDate: '',
        endDate: '',
        type: 'submission',
        status: 'pending'
      };
    }
    this.isPhaseModalOpen = true;
  }

  closePhaseModal(): void {
    this.isPhaseModalOpen = false;
    this.editingPhase = null;
    this.editingPhaseIndex = -1;
  }

  savePhase(): void {
    const phases = [...(this.formModel.phases || this.selectedCompetition?.phases || [])];
    const phaseData: CompetitionPhase = {
      ...this.phaseModel,
      id: this.editingPhase?.id || `phase-${Date.now()}`
    };

    if (this.editingPhaseIndex > -1) {
      phases[this.editingPhaseIndex] = phaseData;
    } else {
      phases.push(phaseData);
    }

    if (this.isFormModalOpen) {
      this.formModel.phases = phases;
    } else if (this.isDetailPanelOpen && this.selectedCompetition) {
      const updated = { ...this.selectedCompetition, phases };
      this.contentService.updateCompetition(updated);
      this.selectedCompetition = updated;
    }

    this.closePhaseModal();
  }

  removePhase(index: number): void {
    const phases = [...(this.formModel.phases || this.selectedCompetition?.phases || [])];
    phases.splice(index, 1);

    if (this.isFormModalOpen) {
      this.formModel.phases = phases;
    } else if (this.isDetailPanelOpen && this.selectedCompetition) {
      const updated = { ...this.selectedCompetition, phases };
      this.contentService.updateCompetition(updated);
      this.selectedCompetition = updated;
    }
  }

  getTypeLabel(type: string): string {
    if (type === 'finals') return 'Finals (Championship)';
    return type.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  }

  getTabCount(tabId: string): number {
    if (tabId === 'all') return this.competitions.length;
    return this.competitions.filter(c => c.status === tabId).length;
  }

  get trackIcons(): { [key: string]: string } {
    return {
      coding: 'code', robotics: 'memory', ai: 'model_training',
      cyber: 'security', innovation: 'tips_and_updates', all: 'emoji_events'
    };
  }

  get typeIcons(): { [key: string]: string } {
    return { 'qualifier': 'filter_1', 'quarter-finals': 'filter_2', 'finals': 'workspace_premium' };
  }

  get phaseIcons(): { [key: string]: string } {
    return { registration: 'how_to_reg', submission: 'upload_file', judging: 'rate_review', results: 'leaderboard', break: 'coffee' };
  }

  get trackGradients(): { [key: string]: string } {
    return {
      coding: 'linear-gradient(135deg, #003f87, #0056b3)',
      robotics: 'linear-gradient(135deg, #f59e0b, #ef4444)',
      ai: 'linear-gradient(135deg, #006a60, #007166)',
      cyber: 'linear-gradient(135deg, #10b981, #059669)',
      innovation: 'linear-gradient(135deg, #ec4899, #f97316)',
      all: 'linear-gradient(135deg, #003f87, #006a60)'
    };
  }

  get typeGradients(): { [key: string]: string } {
    return {
      qualifier: 'linear-gradient(135deg, #003f87, #0056b3)',
      'quarter-finals': 'linear-gradient(135deg, #006a60, #007166)',
      'finals': 'linear-gradient(135deg, #f59e0b, #ef4444)',
      'quarter-final': 'linear-gradient(135deg, #006a60, #007166)',
      'semi-final': 'linear-gradient(135deg, #f59e0b, #f97316)',
      'final': 'linear-gradient(135deg, #ef4444, #ec4899)',
      'championship': 'linear-gradient(135deg, #f59e0b, #ef4444)'
    };
  }

  get statusColors(): { [key: string]: string } {
    return { draft: '#94a3b8', registration: '#f59e0b', active: '#003f87', completed: '#10b981', archived: '#ef4444' };
  }

  get phaseColors(): { [key: string]: string } {
    return { registration: '#003f87', submission: '#f59e0b', judging: '#8b5cf6', results: '#10b981', break: '#94a3b8' };
  }

  progressColor(pct: number): string {
    if (pct >= 75) return '#10b981';
    if (pct >= 40) return '#f59e0b';
    return '#003f87';
  }
}
