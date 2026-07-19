import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContentService, ApprovalRequest } from '../../services/content.service';
import { ThemeService } from '../../services/theme.service';
import { FileStorageService } from '../../services/file-storage.service';

interface RecordFile {
  name: string;
  type: string;
  size: number;
  url: string;
  uploadedAt: string;
  category: string;
  fileId?: string;
}

interface Record {
  id: string;
  type: 'school' | 'instructor' | 'judge' | 'sponsor' | 'student' | 'team';
  title: string;
  entityName: string;
  entityType: string;
  files: RecordFile[];
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected' | 'draft';
  region?: string;
  district?: string;
  contactEmail?: string;
  contactPhone?: string;
}

@Component({
  selector: 'app-records',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './records.component.html',
  styleUrl: './records.component.scss'
})
export class RecordsComponent implements OnInit {
  records: Record[] = [];
  allRecords: Record[] = [];
  filteredRecords: Record[] = [];
  trashedRecords: Record[] = [];
  permanentlyDeletedIds: Set<string> = new Set();
  deletingIds: Set<string> = new Set();
  activeTab = 'all';
  searchQuery = '';
  selectedRecord: Record | null = null;
  isModalOpen = false;
  isConfirmOpen = false;
  confirmAction: { action: string; record: Record } | null = null;
  sortBy = 'submittedAt';
  sortDir = 'desc';

  get pendingCount(): number {
    return this.allRecords.filter(r => r.status === 'pending').length;
  }

  get rejectedCount(): number {
    return this.allRecords.filter(r => r.status === 'rejected').length;
  }

  tabs = [
    { id: 'all', label: 'All Records', icon: 'folder' },
    { id: 'recent', label: 'Recently Added', icon: 'schedule' },
    { id: 'school', label: 'Schools', icon: 'school' },
    { id: 'instructor', label: 'Instructors', icon: 'person' },
    { id: 'judge', label: 'Judges', icon: 'gavel' },
    { id: 'sponsor', label: 'Sponsors', icon: 'handshake' },
    { id: 'student', label: 'Students', icon: 'person_outline' },
    { id: 'team', label: 'Teams', icon: 'groups' },
    { id: 'trash', label: '', icon: 'delete' }
  ];

  constructor(public contentService: ContentService, public themeService: ThemeService, public fileStorage: FileStorageService) {}

  ngOnInit(): void {
    this.loadTrashState();
    this.loadRecords();
  }

  loadRecords(): void {
    const liveRecords: Record[] = [];

    // Pull from pending approvals (school regs, instructor regs)
    this.contentService.pendingApprovals.forEach((a: ApprovalRequest) => {
      const type = a.type === 'School Registration' ? 'school' : a.type === 'Instructor Access' ? 'instructor' : a.type === 'Team Addition' ? 'team' : 'school';
      const detailsAny: any = a.details || {};
      liveRecords.push({
        id: a.id,
        type: type as Record['type'],
        title: a.entity ? `${a.entity} — ${a.type}` : a.type,
        entityName: a.entity || 'Unknown',
        entityType: detailsAny.institution || detailsAny.school || (type === 'school' ? 'School' : type === 'instructor' ? 'Instructor' : 'Team'),
        region: detailsAny.region || '',
        district: detailsAny.district || '',
        contactEmail: a.contact || detailsAny.contactEmail || '',
        contactPhone: detailsAny.phone || '',
        submittedAt: a.submitted === 'Just now' ? new Date().toISOString() : a.submitted || new Date().toISOString(),
        status: 'pending',
        files: (detailsAny.docs || []).map((doc: string, i: number) => {
          const sepIdx = doc.indexOf('::');
          const fileId = sepIdx > -1 ? doc.slice(0, sepIdx) : '';
          const fileName = sepIdx > -1 ? doc.slice(sepIdx + 2) : doc;
          return {
            name: fileName,
            type: fileName.endsWith('.pdf') ? 'application/pdf' : fileName.match(/\.(png|jpg|jpeg)$/i) ? 'image/' + fileName.split('.').pop()!.toLowerCase() : 'application/octet-stream',
            size: 0,
            url: '#',
            fileId: fileId,
            uploadedAt: new Date().toISOString(),
            category: i === 0 ? 'Primary Document' : 'Supporting Document'
          };
        })
      });
    });

    // Pull from users (judges, sponsors, students)
    this.contentService.users.forEach(u => {
      if (u.role === 'judge') {
        liveRecords.push({
          id: u.id,
          type: 'judge',
          title: `${u.fullName} — Judge Application`,
          entityName: u.fullName,
          entityType: 'Judge',
          region: '',
          district: '',
          contactEmail: u.email,
          contactPhone: u.phone,
          submittedAt: u.registeredAt ? new Date(u.registeredAt).toISOString() : new Date().toISOString(),
          status: u.status?.toLowerCase() === 'active' ? 'approved' : 'pending',
          files: []
        });
      } else if (u.role === 'sponsor') {
        liveRecords.push({
          id: u.id,
          type: 'sponsor',
          title: `${u.fullName} — Sponsor Registration`,
          entityName: u.fullName,
          entityType: (u as any).tier ? `${(u as any).tier} Sponsor` : 'Corporate Sponsor',
          region: '',
          district: '',
          contactEmail: u.email,
          contactPhone: u.phone,
          submittedAt: u.registeredAt ? new Date(u.registeredAt).toISOString() : new Date().toISOString(),
          status: u.status?.toLowerCase() === 'active' ? 'approved' : 'pending',
          files: []
        });
      } else if (u.role === 'student') {
        liveRecords.push({
          id: u.id,
          type: 'student',
          title: `${u.fullName} — Student Registration`,
          entityName: u.fullName,
          entityType: 'Student Competitor',
          region: '',
          district: '',
          contactEmail: u.email,
          contactPhone: u.phone,
          submittedAt: u.registeredAt ? new Date(u.registeredAt).toISOString() : new Date().toISOString(),
          status: u.status?.toLowerCase() === 'active' ? 'approved' : 'pending',
          files: []
        });
      }
    });

    // Pull from teams
    this.contentService.teams.forEach(t => {
      const teamId = t.id || `team-${t.name.replace(/\s+/g, '-').toLowerCase()}-${t.track.replace(/\s+/g, '-').toLowerCase()}`;
      liveRecords.push({
        id: teamId,
        type: 'team',
        title: `${t.name} — Team Registration`,
        entityName: t.name,
        entityType: `${t.track || 'Mixed'} Team`,
        region: '',
        district: '',
        contactEmail: '',
        contactPhone: '',
        submittedAt: new Date().toISOString(),
        status: (t as any).status === 'In Competition' ? 'approved' : 'pending',
        files: []
      });
    });

    const seenRecord = new Set<string>();
    const dedupedRecords: any[] = [];
    for (const r of liveRecords) {
      const key = `${r.type}::${(r.title || '').trim()}::${(r.entityName || '').trim()}`.toLowerCase();
      if (!seenRecord.has(key)) {
        seenRecord.add(key);
        dedupedRecords.push(r);
      }
    }

    this.allRecords = dedupedRecords.filter(r => !this.isTrashed(r) && !this.permanentlyDeletedIds.has(r.id));
    this.records = this.allRecords.filter(r => r.status === 'approved');
    this.applyFilters();
  }

  applyFilters(): void {
    if (this.activeTab === 'trash') {
      this.filteredRecords = [...this.trashedRecords];
      return;
    }

    let filtered = [...this.records];

    if (this.activeTab !== 'all' && this.activeTab !== 'recent') {
      filtered = filtered.filter(r => r.type === this.activeTab);
    }

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        r.entityName.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.contactEmail?.toLowerCase().includes(q) ||
        r.region?.toLowerCase().includes(q)
      );
    }

    if (this.activeTab === 'recent') {
      filtered.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    } else {
      filtered.sort((a, b) => {
        const aVal = a[this.sortBy as keyof Record] as string | number | undefined;
        const bVal = b[this.sortBy as keyof Record] as string | number | undefined;
        const dir = this.sortDir === 'asc' ? 1 : -1;
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1 * dir;
        if (bVal == null) return -1 * dir;
        if (aVal < bVal) return -1 * dir;
        if (aVal > bVal) return 1 * dir;
        return 0;
      });
    }

    this.filteredRecords = filtered;
  }

  setTab(tabId: string): void {
    this.activeTab = tabId;
    this.applyFilters();
  }

  setSort(field: string): void {
    if (this.sortBy === field) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = field;
      this.sortDir = 'asc';
    }
    this.applyFilters();
  }

  async openRecord(record: Record): Promise<void> {
    this.selectedRecord = record;
    this.isModalOpen = true;

    for (const file of record.files) {
      if (file.fileId) {
        const url = await this.fileStorage.getUrl(file.fileId);
        if (url) file.url = url;
      }
    }
  }

  closeModal(): void {
    if (this.selectedRecord) {
      for (const file of this.selectedRecord.files) {
        if (file.url && file.url !== '#') this.fileStorage.revokeUrl(file.url);
      }
    }
    this.isModalOpen = false;
    this.selectedRecord = null;
  }

  downloadFile(file: RecordFile): void {
    if (file.url === '#') return;
    const link = document.createElement('a');
    link.href = file.url;
    link.download = file.name;
    link.click();
  }

  previewFile(file: RecordFile): void {
    if (file.url === '#') return;
    window.open(file.url, '_blank');
  }

  downloadAllFiles(record: Record): void {
    record.files.forEach(f => this.downloadFile(f));
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  getStatusClass(status: string): string {
    return `status-${status}`;
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'approved': return 'check_circle';
      case 'pending': return 'schedule';
      case 'rejected': return 'cancel';
      case 'draft': return 'edit';
      default: return 'help';
    }
  }

  getTypeIcon(type: string): string {
    const icons: { [key: string]: string } = {
      school: 'school',
      instructor: 'person',
      judge: 'gavel',
      sponsor: 'handshake',
      student: 'person_outline',
      team: 'groups'
    };
    return icons[type] || 'folder';
  }

  getFileIcon(type: string): string {
    if (type.startsWith('image/')) return 'image';
    if (type === 'application/pdf') return 'picture_as_pdf';
    if (type.includes('word') || type.includes('document')) return 'description';
    if (type.includes('zip') || type.includes('compressed')) return 'archive';
    return 'insert_drive_file';
  }

  getTabCount(tabId: string): number {
    if (tabId === 'trash') return this.trashedRecords.length;
    if (tabId === 'all') return this.records.length;
    return this.records.filter(r => r.type === tabId).length;
  }

  getTabLabel(tabId: string): string {
    const tab = this.tabs.find(t => t.id === tabId);
    return tab ? tab.label : '';
  }

  isTrashed(record: Record): boolean {
    return this.trashedRecords.some(r => r.id === record.id);
  }

  deleteRecord(record: Record): void {
    if (!this.isTrashed(record)) {
      this.deletingIds.add(record.id);
      setTimeout(() => {
        this.deletingIds.delete(record.id);
        this.trashedRecords.unshift({ ...record, deletedAt: new Date().toISOString() } as any);
        this.saveTrashState();
        this.loadRecords();
      }, 300);
    }
  }

  restoreRecord(record: Record): void {
    this.trashedRecords = this.trashedRecords.filter(r => r.id !== record.id);
    this.saveTrashState();
    this.loadRecords();
  }

  permanentlyDeleteRecord(record: Record): void {
    this.confirmAction = { action: 'permanentDelete', record };
    this.isConfirmOpen = true;
  }

  confirmPermanentDelete(): void {
    if (this.confirmAction?.record) {
      this.permanentlyDeletedIds.add(this.confirmAction.record.id);
      this.trashedRecords = this.trashedRecords.filter(r => r.id !== this.confirmAction!.record.id);
      this.saveTrashState();
      this.savePermanentlyDeleted();
      this.loadRecords();
    }
    this.isConfirmOpen = false;
    this.confirmAction = null;
  }

  emptyTrash(): void {
    this.isConfirmOpen = true;
    this.confirmAction = { action: 'emptyTrash', record: null as any };
  }

  confirmEmptyTrash(): void {
    this.trashedRecords.forEach(r => this.permanentlyDeletedIds.add(r.id));
    this.trashedRecords = [];
    this.saveTrashState();
    this.savePermanentlyDeleted();
    this.loadRecords();
    this.isConfirmOpen = false;
    this.confirmAction = null;
  }

  cancelConfirm(): void {
    this.isConfirmOpen = false;
    this.confirmAction = null;
  }

  private saveTrashState(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('trashedRecords', JSON.stringify(this.trashedRecords));
    }
  }

  private loadTrashState(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('trashedRecords');
      if (saved) {
        try {
          this.trashedRecords = JSON.parse(saved);
        } catch {}
      }
      const deleted = localStorage.getItem('permanentlyDeletedIds');
      if (deleted) {
        try {
          this.permanentlyDeletedIds = new Set(JSON.parse(deleted));
        } catch {}
      }
    }
  }

  private savePermanentlyDeleted(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('permanentlyDeletedIds', JSON.stringify([...this.permanentlyDeletedIds]));
    }
  }

  exportAllRecords(): void {
    const csvHeader = ['ID', 'Type', 'Title', 'Entity Name', 'Entity Type', 'Region', 'District', 'Email', 'Phone', 'Status', 'Submitted At', 'File Count'];
    const csvRows = this.records.map(r => [
      r.id,
      r.type,
      `"${r.title}"`,
      `"${r.entityName}"`,
      `"${r.entityType}"`,
      r.region || '',
      r.district || '',
      r.contactEmail || '',
      r.contactPhone || '',
      r.status,
      r.submittedAt,
      r.files.length
    ].join(','));
    const csv = [csvHeader.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ntic-records-export-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  }
}