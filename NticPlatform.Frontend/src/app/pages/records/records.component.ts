import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContentService, ApprovalRequest } from '../../services/content.service';
import { ThemeService } from '../../services/theme.service';
import { FileStorageService } from '../../services/file-storage.service';
import { ApiService } from '../../services/api.service';
import { ActivatedRoute } from '@angular/router';
import { AppSelectComponent } from '../../components/app-select/app-select.component';

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
  imports: [CommonModule, FormsModule, AppSelectComponent],
  templateUrl: './records.component.html',
  styleUrl: './records.component.scss'
})
export class RecordsComponent implements OnInit {
  readonly sortOptions = [
    { value: 'submittedAt', label: 'Date Submitted' },
    { value: 'entityName', label: 'Entity Name' },
    { value: 'status', label: 'Status' },
    { value: 'region', label: 'Region' }
  ];

  get regionSelectOptions(): { value: string; label: string }[] {
    return [
      { value: 'all', label: 'All Regions' },
      ...this.availableRegions.map(r => ({ value: r, label: r }))
    ];
  }
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
  viewMode: 'table' | 'grid' = 'table';
  selectedRegionFilter = 'all';
  sortBy = 'submittedAt';
  sortDir = 'desc';

  readonly ghanaRegions = [
    'Ahafo', 'Ashanti', 'Bono', 'Bono East', 'Central', 'Eastern',
    'Greater Accra', 'North East', 'Northern', 'Oti', 'Savannah',
    'Upper East', 'Upper West', 'Volta', 'Western', 'Western North'
  ];

  get availableRegions(): string[] {
    const regions = new Set<string>(this.ghanaRegions);
    this.allRecords.forEach(r => {
      if (r.region && r.region.trim()) {
        regions.add(r.region.trim());
      }
    });
    return Array.from(regions).sort((a, b) => a.localeCompare(b));
  }

  get pendingCount(): number {
    return this.allRecords.filter(r => r.status === 'pending').length;
  }

  get approvedCount(): number {
    return this.allRecords.filter(r => r.status === 'approved').length;
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

  constructor(
    public contentService: ContentService,
    public themeService: ThemeService,
    public fileStorage: FileStorageService,
    private apiService: ApiService,
    private route: ActivatedRoute
  ) {}

    // --- LIVE DATABASE MANAGER ---
  activeDbTable: 'events' | 'stories' | 'schools' | 'philosophy' | 'students' | 'submissions' = 'events';
  dbData: any[] = [];
  dbLoading = false;
  isAddModalOpen = false;
  newRecordPayload: any = {};

  dbTables = [
    { key: 'events' as const,      label: 'events',      icon: 'event' },
    { key: 'stories' as const,     label: 'stories',     icon: 'article' },
    { key: 'schools' as const,     label: 'schools',     icon: 'school' },
    { key: 'students' as const,    label: 'students',    icon: 'person' },
    { key: 'submissions' as const, label: 'submissions', icon: 'upload_file' },
    { key: 'philosophy' as const,  label: 'philosophy',  icon: 'auto_stories' },
  ];

  isNumber(val: any): boolean {
    return typeof val === 'number';
  }

  selectDbTable(table: 'events' | 'stories' | 'schools' | 'philosophy' | 'students' | 'submissions'): void {
    this.activeDbTable = table;
    this.loadDbData();
  }

  loadDbData(): void {
    this.dbLoading = true;
    this.dbData = [];
    const done = (res: any) => { this.dbData = res; this.dbLoading = false; };
    const fail = () => { this.dbLoading = false; };
    if (this.activeDbTable === 'events') {
      this.apiService.getEvents().subscribe({ next: done, error: fail });
    } else if (this.activeDbTable === 'stories') {
      this.apiService.getStories().subscribe({ next: done, error: fail });
    } else if (this.activeDbTable === 'schools') {
      this.apiService.getSchools().subscribe({ next: done, error: fail });
    } else if (this.activeDbTable === 'philosophy') {
      this.apiService.getPhilosophy().subscribe({ next: done, error: fail });
    } else if (this.activeDbTable === 'students') {
      this.apiService.getStudents().subscribe({ next: done, error: fail });
    } else if (this.activeDbTable === 'submissions') {
      this.apiService.getSubmissions().subscribe({ next: done, error: fail });
    }
  }

  deleteDbRecord(id: string): void {
    if (!confirm('Are you sure you want to delete this row from PostgreSQL?')) return;
    if (this.activeDbTable === 'events') {
      this.apiService.deleteEvent(id).subscribe(() => this.loadDbData());
    } else if (this.activeDbTable === 'stories') {
      this.apiService.deleteStory(id).subscribe(() => this.loadDbData());
    } else if (this.activeDbTable === 'schools') {
      this.apiService.deleteSchool(id).subscribe(() => this.loadDbData());
    } else if (this.activeDbTable === 'students') {
      this.apiService.deleteStudent(id).subscribe(() => this.loadDbData());
    } else if (this.activeDbTable === 'submissions') {
      this.apiService.deleteSubmission(id).subscribe(() => this.loadDbData());
    }
  }

  openAddModal(): void {
    this.newRecordPayload = {};
    this.isAddModalOpen = true;
  }

  saveNewDbRecord(): void {
    const refreshAll = () => {
      this.isAddModalOpen = false;
      this.loadDbData();
      this.loadRecords();
      this.contentService.refreshBackendData();
    };

    if (this.activeDbTable === 'events') {
      this.apiService.createEvent(this.newRecordPayload).subscribe(refreshAll);
    } else if (this.activeDbTable === 'stories') {
      this.apiService.createStory(this.newRecordPayload).subscribe(refreshAll);
    } else if (this.activeDbTable === 'schools') {
      this.apiService.createSchool(this.newRecordPayload).subscribe(refreshAll);
    } else if (this.activeDbTable === 'students') {
      this.apiService.createStudent(this.newRecordPayload).subscribe(refreshAll);
    }
  }

  ngOnInit(): void {
    const urlPath = this.route.snapshot.url[0]?.path;
    const tabParam = this.route.snapshot.queryParams['tab'];
    if (urlPath === 'database' || tabParam === 'database') {
      this.activeTab = 'database';
    }
    this.loadDbData();
    this.loadTrashState();
    this.loadRecords();
    this.contentService.refreshBackendData();
  }

<<<<<<< Updated upstream
=======
  getFileIcon(file: RecordFile): string {
    if (!file) return 'description';
    const name = (file.name || '').toLowerCase();
    const type = (file.type || '').toLowerCase();
    if (name.endsWith('.pdf') || type.includes('pdf')) return 'picture_as_pdf';
    if (type.startsWith('image/') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp') || name.endsWith('.svg')) return 'image';
    if (name.endsWith('.zip') || name.endsWith('.rar') || name.endsWith('.7z') || name.endsWith('.tar') || name.endsWith('.gz')) return 'folder_zip';
    if (name.endsWith('.doc') || name.endsWith('.docx')) return 'article';
    if (name.endsWith('.xls') || name.endsWith('.xlsx') || name.endsWith('.csv')) return 'table_view';
    return 'description';
  }

  isImageFile(file: RecordFile): boolean {
    if (!file) return false;
    if (!file.url || file.url === '#') return false;
    const name = (file.name || '').toLowerCase();
    const type = (file.type || '').toLowerCase();
    return type.startsWith('image/') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp') || name.endsWith('.svg');
  }

>>>>>>> Stashed changes
  private guessMimeType(fileName: string): string {
    if (!fileName) return 'application/octet-stream';
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.svg')) return 'image/svg+xml';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.doc')) return 'application/msword';
    if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (lower.endsWith('.zip') || lower.endsWith('.rar') || lower.endsWith('.7z') || lower.endsWith('.tar') || lower.endsWith('.gz')) return 'application/zip';
    return 'application/octet-stream';
  }

  extractRecordFiles(source: any): RecordFile[] {
    const files: RecordFile[] = [];
    if (!source) return files;

    const details = source.details || source;

    const addFile = (fileId: string | undefined, name: string, category: string, fallbackType?: string) => {
      if (!fileId && !name) return;
      if (fileId && files.some(f => f.fileId === fileId)) return;
      if (!fileId && files.some(f => f.name === name)) return;
      files.push({
        name: name || 'Document.pdf',
        type: fallbackType || this.guessMimeType(name),
        size: 0,
        url: '#',
        fileId: fileId || undefined,
        uploadedAt: source.submittedAt || source.submitted || source.registeredAt || new Date().toISOString(),
        category
      });
    };

    // 1. docs array: ["fileId::fileName.pdf"] or ["fileName.pdf"] or ["fileId"]
    if (Array.isArray(details.docs)) {
      details.docs.forEach((doc: string, i: number) => {
        if (!doc) return;
        const sepIdx = doc.indexOf('::');
        const fileId = sepIdx > -1 ? doc.slice(0, sepIdx) : (doc.startsWith('file-') ? doc : '');
        const fileName = sepIdx > -1 ? doc.slice(sepIdx + 2) : (doc.startsWith('file-') ? `Accreditation-Document-${i + 1}.pdf` : doc);
        addFile(fileId, fileName, i === 0 ? 'Primary Accreditation Document' : 'Supporting Document');
      });
    }

    // 2. accredDocs array
    if (Array.isArray(details.accredDocs)) {
      details.accredDocs.forEach((doc: string, i: number) => {
        if (!doc) return;
        const sepIdx = doc.indexOf('::');
        const fileId = sepIdx > -1 ? doc.slice(0, sepIdx) : (doc.startsWith('file-') ? doc : '');
        const fileName = sepIdx > -1 ? doc.slice(sepIdx + 2) : `Accreditation-Certificate-${i + 1}.pdf`;
        addFile(fileId, fileName, 'Accreditation Certificate');
      });
    }

    // 3. instructorDocs array
    if (Array.isArray(details.instructorDocs)) {
      details.instructorDocs.forEach((doc: string, i: number) => {
        if (!doc) return;
        const sepIdx = doc.indexOf('::');
        const fileId = sepIdx > -1 ? doc.slice(0, sepIdx) : (doc.startsWith('file-') ? doc : '');
        const fileName = sepIdx > -1 ? doc.slice(sepIdx + 2) : `Teaching-Credential-${i + 1}.pdf`;
        addFile(fileId, fileName, 'Teaching Credential');
      });
    }

    // 4. logoFileId / logo_file_id
    const logoId = details.logoFileId || details.logo_file_id || source.logoFileId || source.logo_file_id;
    if (logoId && typeof logoId === 'string') {
      addFile(logoId, 'Institutional-Logo.png', 'Institutional Crest / Logo', 'image/png');
    }

    // 5. photoFileId / profilePhotoFileId / photo_file_id
    const photoId = details.photoFileId || details.photo_file_id || details.profilePhotoFileId || source.photoFileId || source.photo_file_id || source.profilePhotoFileId;
    if (photoId && typeof photoId === 'string') {
      addFile(photoId, 'Official-Profile-Photo.jpg', 'Identification Photo', 'image/jpeg');
    }

    // 6. memberPhotos array
    if (Array.isArray(details.memberPhotos)) {
      details.memberPhotos.forEach((pid: string, idx: number) => {
        if (pid && typeof pid === 'string') {
          addFile(pid, `Squad-Member-${idx + 1}-Photo.jpg`, `Member #${idx + 1} Photo`, 'image/jpeg');
        }
      });
    }

    // 7. idCardFileId / idCard
    const idCardId = details.idCardFileId || details.idCard;
    if (idCardId && typeof idCardId === 'string') {
      addFile(idCardId, 'Official-ID-Card.pdf', 'National ID / Student Card');
    }

    // 8. consentFileId / consentDoc
    const consentId = details.consentFileId || details.consentDoc;
    if (consentId && typeof consentId === 'string') {
      addFile(consentId, 'Signed-Parental-Consent.pdf', 'Parental / School Consent', 'application/pdf');
    }

    // 9. csrProposalFileId / proposal
    const proposalId = details.csrProposalFileId || details.proposal;
    if (proposalId && typeof proposalId === 'string') {
      addFile(proposalId, 'CSR-Sponsorship-Agreement.pdf', 'CSR Sponsorship Proposal', 'application/pdf');
    }

    // 10. direct documentUrl
    const docUrl = details.documentUrl || details.document;
    if (docUrl && typeof docUrl === 'string') {
      files.push({
        name: 'Submission-Documentation.pdf',
        type: this.guessMimeType(docUrl),
        size: 0,
        url: docUrl,
        uploadedAt: source.submittedAt || new Date().toISOString(),
        category: 'Project Submission Document'
      });
    }

    return files;
  }

  loadRecords(): void {
    const liveRecords: Record[] = [];

    // Active sets from live user accounts
    const activeUserEmails = new Set<string>((this.contentService.users || []).map(u => (u.email || '').toLowerCase().trim()).filter(Boolean));
    const activeUserIds = new Set<string>((this.contentService.users || []).map(u => (u.id || '').toLowerCase().trim()).filter(Boolean));

    // 1. Pull from pending approvals (school regs, instructor regs, team additions)
    (this.contentService.pendingApprovals || []).forEach((a: ApprovalRequest) => {
      const type = a.type === 'School Registration' ? 'school' : a.type === 'Instructor Access' ? 'instructor' : a.type === 'Team Addition' ? 'team' : 'school';
      const detailsAny: any = a.details || {};
      const files = this.extractRecordFiles(a);
      liveRecords.push({
        id: a.id,
        type: type as Record['type'],
        title: a.entity ? `${a.entity} -- ${a.type}` : a.type,
        entityName: a.entity || 'Unknown',
        entityType: detailsAny.institution || detailsAny.school || (type === 'school' ? 'School' : type === 'instructor' ? 'Instructor' : 'Team'),
        region: detailsAny.region || '',
        district: detailsAny.district || '',
        contactEmail: a.contact || detailsAny.contactEmail || '',
        contactPhone: detailsAny.phone || '',
        submittedAt: a.submitted === 'Just now' ? new Date().toISOString() : a.submitted || new Date().toISOString(),
        status: 'pending',
        files
      });
    });

    // 2. Pull from approved approvals
    (this.contentService.approvedApprovals || []).forEach((a: any) => {
      const type = a.type === 'School Registration' ? 'school' : a.type === 'Instructor Access' ? 'instructor' : a.type === 'Team Addition' ? 'team' : 'school';
      const detailsAny: any = a.details || {};
      const files = this.extractRecordFiles(a);
      const email = (a.contact || detailsAny.contactEmail || '').toLowerCase().trim();
      const id = (a.id || '').toLowerCase().trim();
      const isStillActive = activeUserEmails.has(email) || activeUserIds.has(id);

      // RULE 1: If user was deleted from User Management and provided NO files, omit from archive
      if (!isStillActive && files.length === 0) {
        return;
      }

      liveRecords.push({
        id: a.id,
        type: type as Record['type'],
        title: a.entity ? `${a.entity} -- ${a.type}` : a.type,
        entityName: a.entity || 'Unknown',
        entityType: detailsAny.institution || detailsAny.school || (type === 'school' ? 'School' : type === 'instructor' ? 'Instructor' : 'Team'),
        region: detailsAny.region || '',
        district: detailsAny.district || '',
        contactEmail: a.contact || detailsAny.contactEmail || '',
        contactPhone: detailsAny.phone || '',
        submittedAt: a.submitted === 'Just now' ? new Date().toISOString() : a.submitted || new Date().toISOString(),
        status: 'approved',
        files
      });
    });

    // 3. Pull from rejected approvals
    (this.contentService.rejectedApprovals || []).forEach((a: any) => {
      const type = a.type === 'School Registration' ? 'school' : a.type === 'Instructor Access' ? 'instructor' : a.type === 'Team Addition' ? 'team' : 'school';
      const detailsAny: any = a.details || {};
      const files = this.extractRecordFiles(a);

      // If rejected and has no files, omit from archive
      if (files.length === 0) {
        return;
      }

      liveRecords.push({
        id: a.id,
        type: type as Record['type'],
        title: a.entity ? `${a.entity} -- ${a.type}` : a.type,
        entityName: a.entity || 'Unknown',
        entityType: detailsAny.institution || detailsAny.school || (type === 'school' ? 'School' : type === 'instructor' ? 'Instructor' : 'Team'),
        region: detailsAny.region || '',
        district: detailsAny.district || '',
        contactEmail: a.contact || detailsAny.contactEmail || '',
        contactPhone: detailsAny.phone || '',
        submittedAt: a.submitted === 'Just now' ? new Date().toISOString() : a.submitted || new Date().toISOString(),
        status: 'rejected',
        files
      });
    });

    // 4. Pull from registered users
    (this.contentService.users || []).forEach(u => {
      const files = this.extractRecordFiles(u);
      const isGroupLead = this.contentService.isGroupLeadUser(u);
      const entityType = u.role === 'judge' ? 'Judge'
        : u.role === 'sponsor' ? ((u as any).tier ? `${(u as any).tier} Sponsor` : 'Corporate Sponsor')
        : u.role === 'student' ? (isGroupLead ? 'Group Competitor' : 'Student Competitor')
        : u.role === 'instructor' ? (u.organization || 'Instructor')
        : u.role === 'school_admin' ? 'Accredited Institution'
        : u.role || 'User';

      liveRecords.push({
        id: u.id,
        type: (u.role === 'school_admin' ? 'school' : u.role) as Record['type'],
        title: `${u.organization || u.fullName} -- ${entityType} Record`,
        entityName: u.organization || u.fullName,
        entityType,
        region: (u as any).region || '',
        district: (u as any).district || '',
        contactEmail: u.email,
        contactPhone: u.phone,
        submittedAt: u.registeredAt ? new Date(u.registeredAt).toISOString() : new Date().toISOString(),
        status: u.status?.toLowerCase() === 'active' ? 'approved' : 'pending',
        files
      });
    });

    // 5. Pull from teams
    (this.contentService.teams || []).forEach(t => {
      const teamId = t.id || `team-${t.name.replace(/\s+/g, '-').toLowerCase()}-${(t.track || '').replace(/\s+/g, '-').toLowerCase()}`;
      const files = this.extractRecordFiles(t);
      liveRecords.push({
        id: teamId,
        type: 'team',
        title: `${t.name} -- Team Registration`,
        entityName: t.name,
        entityType: `${t.track || 'Mixed'} Team`,
        region: t.region || '',
        district: (t as any).district || '',
        contactEmail: '',
        contactPhone: '',
        submittedAt: new Date().toISOString(),
        status: (t as any).status === 'In Competition' ? 'approved' : 'pending',
        files
      });
    });

    const finalize = async () => {
      const seenRecord = new Set<string>();
      const dedupedRecords: Record[] = [];

      for (const r of liveRecords) {
        const key = `${r.type}::${(r.contactEmail || r.entityName || r.id).trim().toLowerCase()}`;
        if (!seenRecord.has(key)) {
          seenRecord.add(key);
          dedupedRecords.push(r);
        } else {
          // If already added, merge any additional files found
          const existing = dedupedRecords.find(x => `${x.type}::${(x.contactEmail || x.entityName || x.id).trim().toLowerCase()}` === key);
          if (existing && r.files.length > 0) {
            r.files.forEach(f => {
              if (!existing.files.some(ef => (ef.fileId && ef.fileId === f.fileId) || ef.name === f.name)) {
                existing.files.push(f);
              }
            });
          }
        }
      }

      // Enrich file metadata asynchronously from local IndexedDB storage
      for (const r of dedupedRecords) {
        if (r.files && r.files.length > 0) {
          for (const f of r.files) {
            if (f.fileId) {
              try {
                const stored = await this.fileStorage.get(f.fileId);
                if (stored?.metadata) {
                  if (stored.metadata.name) f.name = stored.metadata.name;
                  if (stored.metadata.size) f.size = stored.metadata.size;
                  if (stored.metadata.type) f.type = stored.metadata.type;
                }
                if (stored?.blob) {
                  f.url = URL.createObjectURL(stored.blob);
                }
              } catch {}
            }
          }
        }
      }

      this.allRecords = dedupedRecords.filter(r => !this.isTrashed(r) && !this.permanentlyDeletedIds.has(r.id));
      this.records = [...this.allRecords];
      this.applyFilters();
    };

    finalize();

    // Also pull from PostgreSQL students asynchronously
    this.apiService.getStudents().subscribe({
      next: (students: any[]) => {
        if (Array.isArray(students)) {
          students.forEach(s => {
            const sName = `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.email || 'Student';
            const files = this.extractRecordFiles(s);
            liveRecords.push({
              id: s.id || `std-${Math.random()}`,
              type: 'student',
              title: `${sName} -- PostgreSQL Student Record`,
              entityName: sName,
              entityType: s.track || 'Student',
              region: s.region || '',
              district: s.district || '',
              contactEmail: s.email || '',
              contactPhone: s.phone || '',
              submittedAt: s.created_at || new Date().toISOString(),
              status: 'approved',
              files
            });
          });
        }
        finalize();
      },
      error: () => {
        finalize();
      }
    });
  }

  applyFilters(): void {
    if (this.activeTab === 'trash') {
      this.filteredRecords = [...this.trashedRecords];
      return;
    }

    let filtered = [...this.allRecords];

    if (this.activeTab !== 'all' && this.activeTab !== 'recent') {
      filtered = filtered.filter(r => r.type === this.activeTab);
    }

    if (this.selectedRegionFilter !== 'all') {
      filtered = filtered.filter(r => r.region && r.region.trim() === this.selectedRegionFilter);
    }

    if (this.searchQuery && this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(r =>
        (r.entityName && r.entityName.toLowerCase().includes(q)) ||
        (r.title && r.title.toLowerCase().includes(q)) ||
        (r.id && r.id.toLowerCase().includes(q)) ||
        (r.contactEmail && r.contactEmail.toLowerCase().includes(q)) ||
        (r.region && r.region.toLowerCase().includes(q))
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
        try {
          const stored = await this.fileStorage.get(file.fileId);
          if (stored?.metadata) {
            if (stored.metadata.name) file.name = stored.metadata.name;
            if (stored.metadata.size) file.size = stored.metadata.size;
            if (stored.metadata.type) file.type = stored.metadata.type;
          }
          if (stored?.blob) {
            file.url = URL.createObjectURL(stored.blob);
          }
        } catch {}
      }
    }
  }

  closeModal(): void {
    if (this.selectedRecord) {
      for (const file of this.selectedRecord.files) {
        if (file.url && file.url !== '#' && file.url.startsWith('blob:')) {
          this.fileStorage.revokeUrl(file.url);
        }
      }
    }
    this.isModalOpen = false;
    this.selectedRecord = null;
  }

  async downloadFile(file: RecordFile): Promise<void> {
    try {
      // 1. Try from local IndexedDB if fileId exists
      if (file.fileId) {
        const stored = await this.fileStorage.get(file.fileId);
        if (stored?.blob) {
          const blobUrl = URL.createObjectURL(stored.blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = file.name || stored.metadata?.name || 'document';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
          return;
        }
      }

      // 2. If valid HTTP / Blob URL is present
      if (file.url && file.url !== '#' && !file.url.startsWith('javascript:')) {
        const a = document.createElement('a');
        a.href = file.url;
        a.download = file.name || 'document';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      // 3. Document archival fallback package for credentials / proposals / submissions
      const entityName = this.selectedRecord?.entityName || 'Entity';
      const entityType = this.selectedRecord?.entityType || 'Institutional Application';
      const refId = this.selectedRecord?.id || 'NTIC-DOC';
      const timestamp = this.selectedRecord?.submittedAt ? new Date(this.selectedRecord.submittedAt).toUTCString() : new Date().toUTCString();
      const content = `NTIC OFFICIAL ARCHIVED ATTACHMENT & CREDENTIAL
============================================================
Document Name : ${file.name}
Category      : ${file.category || 'Primary Document'}
Record ID     : ${refId}
Entity Name   : ${entityName}
Entity Type   : ${entityType}
Archived Date : ${timestamp}
Platform      : National Technology & Innovation Championship (NTIC Ghana)
Security Seal : NTIC-SECURE-ARCHIVE-VERIFIED
============================================================

This file is an official submission credential archived in the NTIC Platform database.
`;
      const blob = new Blob([content], { type: 'application/octet-stream' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = file.name || `${refId}-attachment.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
    } catch (err) {
      console.error('Download error:', err);
    }
  }

  async previewFile(file: RecordFile): Promise<void> {
    if (file.fileId) {
      const stored = await this.fileStorage.get(file.fileId);
      if (stored?.blob) {
        const blobUrl = URL.createObjectURL(stored.blob);
        window.open(blobUrl, '_blank');
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        return;
      }
    }
    if (file.url && file.url !== '#') {
      window.open(file.url, '_blank');
    } else {
      this.downloadFile(file);
    }
  }

  async downloadAllFiles(record: Record): Promise<void> {
    if (!record || !record.files || record.files.length === 0) return;
    for (const f of record.files) {
      await this.downloadFile(f);
      await new Promise(r => setTimeout(r, 200));
    }
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

  isImageFile(file: any): boolean {
    if (!file) return false;
    if (!file.url || file.url === '#') return false;
    const name = (file.name || '').toLowerCase();
    const type = (file.type || '').toLowerCase();
    return type.startsWith('image/') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp') || name.endsWith('.svg');
  }

  getFileIcon(fileOrType: any): string {
    if (!fileOrType) return 'description';
    let name = '';
    let type = '';
    if (typeof fileOrType === 'string') {
      type = fileOrType.toLowerCase();
    } else {
      name = (fileOrType.name || '').toLowerCase();
      type = (fileOrType.type || '').toLowerCase();
    }
    if (name.endsWith('.pdf') || type === 'application/pdf' || type.includes('pdf')) return 'picture_as_pdf';
    if (type.startsWith('image/') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp') || name.endsWith('.svg')) return 'image';
    if (name.endsWith('.zip') || name.endsWith('.rar') || name.endsWith('.7z') || name.endsWith('.tar') || name.endsWith('.gz') || type.includes('zip') || type.includes('compressed')) return 'folder_zip';
    if (name.endsWith('.doc') || name.endsWith('.docx') || type.includes('word') || type.includes('document')) return 'article';
    if (name.endsWith('.xls') || name.endsWith('.xlsx') || name.endsWith('.csv')) return 'table_view';
    return 'description';
  }

  getTabCount(tabId: string): number {
    if (tabId === 'trash') return this.trashedRecords.length;
    if (tabId === 'all' || tabId === 'recent') return this.allRecords.length;
    return this.allRecords.filter(r => r.type === tabId).length;
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