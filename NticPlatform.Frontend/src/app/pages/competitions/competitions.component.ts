import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContentService, Competition, CompetitionPhase } from '../../services/content.service';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-competitions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './competitions.component.html',
  styleUrl: './competitions.component.scss'
})
export class CompetitionsComponent implements OnInit {
  competitions: Competition[] = [];
  filteredCompetitions: Competition[] = [];
  activeTab = 'all';
  searchQuery = '';
  isFormModalOpen = false;
  isDetailModalOpen = false;
  isDeleteConfirmOpen = false;
  isPhaseModalOpen = false;
  editingCompetition: Competition | null = null;
  selectedCompetition: Competition | null = null;
  deletingCompetition: Competition | null = null;
  editingPhase: CompetitionPhase | null = null;
  editingPhaseIndex = -1;

  formModel: any = {};
  phaseModel: any = {};

  tabs = [
    { id: 'all', label: 'All Cycles', icon: 'emoji_events' },
    { id: 'active', label: 'Active', icon: 'play_circle' },
    { id: 'registration', label: 'Registration Open', icon: 'how_to_reg' },
    { id: 'draft', label: 'Drafts', icon: 'edit_note' },
    { id: 'completed', label: 'Completed', icon: 'check_circle' }
  ];

  cycleTypes = ['qualifier', 'quarter-final', 'semi-final', 'final', 'championship'];
  tracks = ['all', 'coding', 'robotics', 'ai', 'cyber', 'innovation'];
  statuses: Competition['status'][] = ['draft', 'registration', 'active', 'completed', 'archived'];
  phaseTypes: CompetitionPhase['type'][] = ['registration', 'submission', 'judging', 'results', 'break'];
  studentRegisteredMap: Record<string, boolean> = {};

  get activeRoleId(): string {
    return (typeof localStorage !== 'undefined' && localStorage.getItem('activeRoleId')) || 'student';
  }

  get isStudent(): boolean {
    return this.activeRoleId === 'student';
  }

  get canManageCompetitions(): boolean {
    return ['super_admin', 'school_admin', 'instructor', 'competition_manager'].includes(this.activeRoleId);
  }

  get totalCycles(): number { return this.competitions.length; }
  get liveCycles(): number { return this.competitions.filter(c => c.status === 'active').length; }
  get openRegistrationCycles(): number { return this.competitions.filter(c => c.status === 'registration').length; }

  get displayTabs() {
    if (this.isStudent) {
      return this.tabs.filter(t => t.id !== 'draft');
    }
    return this.tabs;
  }

  registerStudentForCycle(comp: Competition): void {
    this.studentRegisteredMap[comp.id] = true;
  }

  constructor(public contentService: ContentService, public themeService: ThemeService) {}

  ngOnInit(): void {
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

    if (this.isStudent) {
      filtered = filtered.filter(c => c.status !== 'draft');
    }

    if (this.activeTab !== 'all') {
      filtered = filtered.filter(c => c.status === this.activeTab);
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

  openCreateModal(): void {
    this.editingCompetition = null;
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
  }

  closeFormModal(): void {
    this.isFormModalOpen = false;
    this.editingCompetition = null;
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

  openDetailModal(comp: Competition): void {
    this.selectedCompetition = comp;
    this.isDetailModalOpen = true;
  }

  closeDetailModal(): void {
    this.isDetailModalOpen = false;
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
      this.closeDetailModal();
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
    this.contentService.updateCompetition({ ...comp, status: newStatus });
    this.loadCompetitions();
  }

  getNextStatus(current: Competition['status']): Competition['status'] {
    const flow: Competition['status'][] = ['draft', 'registration', 'active', 'completed'];
    const idx = flow.indexOf(current);
    return idx > -1 && idx < flow.length - 1 ? flow[idx + 1] : current;
  }

  /* Phase management */
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
    const target = this.editingCompetition || this.selectedCompetition;
    if (!target) return;

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
    } else if (this.isDetailModalOpen && this.selectedCompetition) {
      const updated = { ...this.selectedCompetition, phases };
      this.contentService.updateCompetition(updated);
      this.selectedCompetition = updated;
    }

    this.closePhaseModal();
  }

  removePhase(index: number): void {
    const target = this.editingCompetition || this.selectedCompetition;
    if (!target) return;

    const phases = [...(this.formModel.phases || this.selectedCompetition?.phases || [])];
    phases.splice(index, 1);

    if (this.isFormModalOpen) {
      this.formModel.phases = phases;
    } else if (this.isDetailModalOpen && this.selectedCompetition) {
      const updated = { ...this.selectedCompetition, phases };
      this.contentService.updateCompetition(updated);
      this.selectedCompetition = updated;
    }
  }

  /* Helpers */
  getTypeLabel(type: string): string {
    return type.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  getStatusClass(status: string): string {
    return `status-${status}`;
  }

  getPhaseTypeClass(type: string): string {
    return `phase-${type}`;
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '—';
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
      coding: 'code',
      robotics: 'memory',
      ai: 'model_training',
      cyber: 'security',
      innovation: 'tips_and_updates',
      all: 'emoji_events'
    };
  }

  get typeIcons(): { [key: string]: string } {
    return {
      'qualifier': 'filter_1',
      'quarter-final': 'filter_2',
      'semi-final': 'filter_3',
      'final': 'workspace_premium',
      'championship': 'military_tech'
    };
  }

  get phaseIcons(): { [key: string]: string } {
    return {
      registration: 'how_to_reg',
      submission: 'upload_file',
      judging: 'rate_review',
      results: 'leaderboard',
      break: 'coffee'
    };
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
      'quarter-final': 'linear-gradient(135deg, #006a60, #007166)',
      'semi-final': 'linear-gradient(135deg, #f59e0b, #f97316)',
      final: 'linear-gradient(135deg, #ef4444, #ec4899)',
      championship: 'linear-gradient(135deg, #f59e0b, #ef4444)'
    };
  }

  get statusColors(): { [key: string]: string } {
    return {
      draft: '#94a3b8',
      registration: '#f59e0b',
      active: '#003f87',
      completed: '#10b981',
      archived: '#ef4444'
    };
  }

  get phaseColors(): { [key: string]: string } {
    return {
      registration: '#003f87',
      submission: '#f59e0b',
      judging: '#8b5cf6',
      results: '#10b981',
      break: '#94a3b8'
    };
  }

  progressColor(pct: number): string {
    if (pct >= 75) return '#10b981';
    if (pct >= 40) return '#f59e0b';
    return '#003f87';
  }
}
