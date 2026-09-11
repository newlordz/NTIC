import {
  Component, ChangeDetectionStrategy, Input, Output, EventEmitter,
  OnInit, OnChanges, OnDestroy, SimpleChanges, ChangeDetectorRef, HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QuillEditorComponent } from 'ngx-quill';
import { DialogService } from '../../../../services/dialog.service';
import { ApiService } from '../../../../services/api.service';

export interface QuizQuestionItem {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface StudioDraft {
  courseId: string;
  courseTitle?: string;
  moduleId?: string;
  title: string;
  order: number;
  description: string;
  blocks: ModuleBlock[];
  savedAt: string;
  savedAtLabel: string;
  blockCount: number;
}

export interface ModuleBlock {
  id: string;
  type: 'text' | 'video' | 'quiz' | 'code' | 'break' | 'resource' | 'image' | 'file' | 'callout' | 'table';
  title?: string;
  content?: string;
  url?: string;
  fileName?: string;
  fileSize?: string;
  mimeType?: string;
  videoDuration?: number;
  videoTakeaway?: string;
  videoSource?: 'url' | 'upload';
  quizQuestion?: string;
  quizOptions?: string[];
  quizCorrectIndex?: number;
  quizExplanation?: string;
  quizQuestions?: QuizQuestionItem[];
  activeQuestionIdx?: number;
  codeLanguage?: string;
  customCodeLanguage?: string;
  codeStarter?: string;
  codeInstructions?: string;
  breakLabel?: string;
  breakRequirement?: 'read' | 'pass_quiz' | 'none';
  // Advanced Image Settings
  imageWidth?: '25%' | '33%' | '50%' | '75%' | '100%';
  imageAlign?: 'center' | 'left' | 'right' | 'float-left' | 'float-right' | 'beside-text';
  besideText?: string;
  imageBorder?: boolean;
  imageShadow?: boolean;
  imageRounded?: boolean;
  imageCaption?: string;
  // Callout block settings
  calloutType?: 'note' | 'tip' | 'warning' | 'danger' | 'key_takeaway';
  // Table Widget Settings
  tableTitle?: string;
  tableCaption?: string;
  tableHeaders?: string[];
  tableRows?: string[][];
  tableTheme?: 'primary' | 'dark' | 'emerald' | 'amber' | 'minimal';
  tableStriped?: boolean;
  tableBordered?: boolean;
  tableHoverable?: boolean;
  tableCompact?: boolean;
  tableHighlightFirstColumn?: boolean;
  tableSearchable?: boolean;
  tableSortable?: boolean;
  tableAlignment?: 'left' | 'center' | 'right';
  tableFooterNotes?: string;
  isEditing?: boolean;
  isCollapsed?: boolean;
}

@Component({
  selector: 'app-module-studio',
  standalone: true,
  imports: [CommonModule, FormsModule, QuillEditorComponent],
  templateUrl: './module-studio.component.html',
  styleUrls: ['./module-studio.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModuleStudioComponent implements OnInit, OnChanges, OnDestroy {
  @Input() course: any = null;
  @Input() module: any = null;
  @Input() initialBlocks: ModuleBlock[] = [];
  @Input() isSaving = false;
  @Input() saveError = '';
  @Input() isReadOnly = false;

  @Output() exit = new EventEmitter<void>();
  @Output() save = new EventEmitter<{ moduleForm: any; blocks: ModuleBlock[] }>();
  @Output() triggerAiQuiz = new EventEmitter<{ block?: ModuleBlock; isNew?: boolean }>();
  @Output() uploadFile = new EventEmitter<{ file: File; block: ModuleBlock }>();

  moduleForm: { id?: string; courseId?: string; title: string; order: number; description: string } = {
    title: '',
    order: 1,
    description: ''
  };

  moduleBlocks: ModuleBlock[] = [];
  selectedBlockId: string | null = null;
  editingBlockId: string | null = null;
  isCanvasPreviewMode = false;
  isPaletteCollapsed = false;
  isGeneratingAiQuiz: Record<string, boolean> = {};
  isUploadingBlockFile: Record<string, boolean> = {};

  // ── Auto-Save & Draft Recovery State ────────────────────────
  autoSaveStatus: 'idle' | 'unsaved' | 'saving' | 'saved' = 'idle';
  lastAutoSavedTime = '';
  hasUnsavedChanges = false;
  hasRecoverableDraft = false;
  isDraftAutoRestored = false;
  pendingDraft: StudioDraft | null = null;
  pendingDraftTimeAgo = '';
  private autoSaveTimer: any = null;

  // Drag & Drop State
  draggedIndex: number | null = null;
  dragOverIndex: number | null = null;
  draggedPaletteType: ModuleBlock['type'] | null = null;
  isDragOverBottomPrompt = false;
  dragInsertSlot: number | null = null;

  // In-between insert popup slot
  activeInsertSlotIndex: number | null = null;

  quillConfig = {
    toolbar: [
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'header': [1, 2, 3, false] }],
      [{ 'list': 'ordered' }, { 'list': 'bullet' }],
      [{ 'color': [] }, { 'background': [] }],
      ['link', 'blockquote', 'code-block'],
      ['clean']
    ]
  };

  // ── AI Question Builder Modal State ──────────────────────────
  isAiQuestionBuilderOpen = false;
  targetAiQuizBlock: ModuleBlock | null = null;
  aiBuilderTab: 'paste' | 'documents' = 'paste';

  aiQuestionSettings = {
    questionType: 'multiple_choice' as 'multiple_choice' | 'true_false' | 'scenario',
    difficulty: 'intermediate' as 'beginner' | 'intermediate' | 'championship',
    count: 1,
    includeLessonGuides: true
  };

  rawPastedQuizText = '';
  uploadedSlideDocName = '';
  uploadedSlideDocText = '';
  isUploadingSlideDoc = false;
  isProcessingAiQuestions = false;
  aiBuilderError = '';

  previewQuestions: QuizQuestionItem[] = [];
  previewActiveIdx = 0;

  constructor(
    private dialogService: DialogService,
    private apiService: ApiService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initModuleData();
    if (this.isReadOnly) {
      this.isCanvasPreviewMode = true;
      this.isPaletteCollapsed = true;
    } else {
      this.checkForSavedDraft();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['module'] || changes['initialBlocks']) {
      this.initModuleData();
      if (!this.isReadOnly) {
        this.checkForSavedDraft();
      }
    }
    if (changes['isReadOnly'] && this.isReadOnly) {
      this.isCanvasPreviewMode = true;
      this.isPaletteCollapsed = true;
    }
  }

  ngOnDestroy(): void {
    if (this.hasUnsavedChanges && !this.isReadOnly) {
      this.performAutoSave();
    }
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  // ── Auto-Save Event Interceptors ────────────────────────────
  @HostListener('input')
  onHostInput(): void {
    if (this.isReadOnly) return;
    this.scheduleAutoSave(false);
  }

  @HostListener('change')
  onHostChange(): void {
    if (this.isReadOnly) return;
    this.scheduleAutoSave(false);
  }

  @HostListener('window:beforeunload')
  onWindowBeforeUnload(): void {
    if (this.isReadOnly) return;
    this.performAutoSave();
  }

  get autoSaveLabel(): string {
    if (this.autoSaveStatus === 'saving') return 'Autosaving...';
    if (this.autoSaveStatus === 'saved') {
      return this.lastAutoSavedTime ? `Autosaved ${this.lastAutoSavedTime}` : 'Autosaved';
    }
    if (this.autoSaveStatus === 'unsaved') return 'Unsaved changes';
    return 'Draft ready';
  }

  get autoSaveTooltip(): string {
    return this.lastAutoSavedTime
      ? `Auto-saved locally at ${this.lastAutoSavedTime}. Drafts persist automatically if you close or exit.`
      : 'Changes are automatically saved to local browser storage.';
  }

  getDraftStorageKey(): string {
    const courseId = this.moduleForm.courseId || this.course?.id || 'general';
    const moduleId = this.moduleForm.id || this.module?.id;
    if (moduleId && !String(moduleId).startsWith('mod-temp-') && !String(moduleId).startsWith('blk-')) {
      return `ntic_studio_draft_${courseId}_${moduleId}`;
    }
    const order = this.moduleForm.order || 1;
    return `ntic_studio_draft_${courseId}_new_${order}`;
  }

  scheduleAutoSave(immediate = false): void {
    if (this.isReadOnly) return;
    this.hasUnsavedChanges = true;
    this.autoSaveStatus = 'unsaved';
    this.cdr.markForCheck();

    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    if (immediate) {
      this.performAutoSave();
    } else {
      this.autoSaveTimer = setTimeout(() => {
        this.performAutoSave();
      }, 800);
    }
  }

  performAutoSave(): void {
    if (this.isReadOnly) return;
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    // Skip if completely empty canvas and blank title
    if (this.moduleBlocks.length === 0 && !this.moduleForm.title.trim()) {
      return;
    }

    this.autoSaveStatus = 'saving';
    this.cdr.markForCheck();

    try {
      const key = this.getDraftStorageKey();
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const draft: StudioDraft = {
        courseId: this.moduleForm.courseId || this.course?.id || '',
        courseTitle: this.course?.title || '',
        moduleId: this.moduleForm.id || this.module?.id,
        title: this.moduleForm.title || 'Untitled Module',
        order: this.moduleForm.order || 1,
        description: this.moduleForm.description || '',
        blocks: this.moduleBlocks,
        savedAt: now.toISOString(),
        savedAtLabel: timeStr,
        blockCount: this.moduleBlocks.length
      };

      localStorage.setItem(key, JSON.stringify(draft));

      // Also maintain latest new draft pointer for fallback
      if (!draft.moduleId || String(draft.moduleId).startsWith('mod-temp-') || String(draft.moduleId).startsWith('blk-')) {
        const latestKey = `ntic_studio_draft_${draft.courseId || 'general'}_latest_new`;
        localStorage.setItem(latestKey, JSON.stringify(draft));
      }

      this.lastAutoSavedTime = timeStr;
      this.autoSaveStatus = 'saved';
      this.hasUnsavedChanges = false;
    } catch (err) {
      console.error('Failed to auto-save module draft', err);
      this.autoSaveStatus = 'unsaved';
    }
    this.cdr.markForCheck();
  }

  manualSaveDraft(): void {
    this.performAutoSave();
    const timeLabel = this.lastAutoSavedTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    this.dialogService.toast(`Draft preserved in browser cache (${timeLabel})!`, 'success');
  }

  checkForSavedDraft(): void {
    try {
      const key = this.getDraftStorageKey();
      let raw = localStorage.getItem(key);

      // Fallback check for new modules if exact order key was not found
      if (!raw && (!this.moduleForm.id || !this.module?.id)) {
        const courseId = this.moduleForm.courseId || this.course?.id || 'general';
        raw = localStorage.getItem(`ntic_studio_draft_${courseId}_latest_new`);
      }

      if (!raw) {
        this.hasRecoverableDraft = false;
        this.pendingDraft = null;
        return;
      }

      const draft: StudioDraft = JSON.parse(raw);
      if (!draft || !draft.blocks || draft.blocks.length === 0) {
        this.hasRecoverableDraft = false;
        this.pendingDraft = null;
        return;
      }

      const draftAgeMs = Date.now() - new Date(draft.savedAt).getTime();
      // Ignore drafts older than 14 days
      if (draftAgeMs > 14 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(key);
        this.hasRecoverableDraft = false;
        this.pendingDraft = null;
        return;
      }

      this.pendingDraft = draft;
      this.pendingDraftTimeAgo = this.formatTimeAgo(draft.savedAt);

      // If current canvas is empty (0 blocks), automatically restore the draft
      // so the author doesn't see a blank canvas after returning!
      if (this.moduleBlocks.length === 0) {
        this.restoreDraft(false);
        this.isDraftAutoRestored = true;
        this.hasRecoverableDraft = true;
      } else {
        // Current canvas already has blocks (e.g. from backend materials)
        // Show prompt banner if the local draft has distinct or newer content
        if (JSON.stringify(draft.blocks) !== JSON.stringify(this.moduleBlocks) || (draft.title && draft.title !== this.moduleForm.title)) {
          this.hasRecoverableDraft = true;
          this.isDraftAutoRestored = false;
        }
      }
    } catch (err) {
      console.error('Failed to parse module draft from localStorage', err);
    }
  }

  restoreDraft(notify = true): void {
    if (!this.pendingDraft) return;

    if (this.pendingDraft.title && (!this.moduleForm.title || this.moduleForm.title.startsWith('Module '))) {
      this.moduleForm.title = this.pendingDraft.title;
    }
    if (this.pendingDraft.order) {
      this.moduleForm.order = this.pendingDraft.order;
    }
    if (this.pendingDraft.description) {
      this.moduleForm.description = this.pendingDraft.description;
    }

    if (this.pendingDraft.blocks && this.pendingDraft.blocks.length > 0) {
      this.moduleBlocks = this.pendingDraft.blocks.map(b => ({
        ...b,
        imageWidth: b.imageWidth || '100%',
        imageAlign: b.imageAlign || 'center',
        imageRounded: b.imageRounded ?? true,
        imageShadow: b.imageShadow ?? false,
        imageBorder: b.imageBorder ?? true,
        calloutType: b.calloutType || 'tip',
        isCollapsed: b.isCollapsed ?? false
      }));
      this.selectedBlockId = this.moduleBlocks[0]?.id || null;
    }

    this.hasRecoverableDraft = false;
    this.isDraftAutoRestored = true;
    this.autoSaveStatus = 'saved';
    this.lastAutoSavedTime = this.pendingDraft.savedAtLabel || 'earlier';
    this.hasUnsavedChanges = false;

    if (notify) {
      this.dialogService.toast(`Restored draft with ${this.moduleBlocks.length} block(s)!`, 'success');
    }
    this.cdr.markForCheck();
  }

  discardDraft(): void {
    const key = this.getDraftStorageKey();
    try {
      localStorage.removeItem(key);
      const courseId = this.moduleForm.courseId || this.course?.id || 'general';
      localStorage.removeItem(`ntic_studio_draft_${courseId}_latest_new`);
    } catch (e) {}

    this.hasRecoverableDraft = false;
    this.isDraftAutoRestored = false;
    this.pendingDraft = null;

    if (this.initialBlocks && this.initialBlocks.length > 0) {
      this.moduleBlocks = this.initialBlocks.map(b => ({ ...b }));
      this.selectedBlockId = this.moduleBlocks[0]?.id || null;
    } else {
      this.moduleBlocks = [];
      this.selectedBlockId = null;
    }

    this.autoSaveStatus = 'idle';
    this.dialogService.toast('Draft discarded. Reset to clean state.', 'info');
    this.cdr.markForCheck();
  }

  dismissDraftBanner(): void {
    this.isDraftAutoRestored = false;
    this.hasRecoverableDraft = false;
    this.cdr.markForCheck();
  }

  formatTimeAgo(isoString: string): string {
    if (!isoString) return 'recently';
    const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diffSec < 45) return 'just now';
    if (diffSec < 90) return '1 minute ago';
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `${mins} minutes ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }

  private initModuleData(): void {
    if (this.module) {
      this.moduleForm = {
        id: this.module.id,
        courseId: this.module.course_id || this.module.courseId || this.course?.id || '',
        title: this.module.title || '',
        order: this.module.order_num ?? this.module.order ?? 1,
        description: this.module.description || ''
      };
    } else {
      this.moduleForm = {
        courseId: this.course?.id || '',
        title: '',
        order: 1,
        description: ''
      };
    }

    if (this.initialBlocks && this.initialBlocks.length > 0) {
      this.moduleBlocks = this.initialBlocks.map(b => ({
        ...b,
        imageWidth: b.imageWidth || '100%',
        imageAlign: b.imageAlign || 'center',
        imageRounded: b.imageRounded ?? true,
        imageShadow: b.imageShadow ?? false,
        imageBorder: b.imageBorder ?? true,
        calloutType: b.calloutType || 'tip',
        isCollapsed: b.isCollapsed ?? false
      }));
    } else {
      this.moduleBlocks = [];
    }
    this.cdr.markForCheck();
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackByBlockId(index: number, blk: ModuleBlock): string {
    return blk.id || String(index);
  }

  // ── Metrics Calculation ──────────────────────────────────────
  get totalWords(): number {
    let words = 0;
    for (const b of this.moduleBlocks) {
      if (b.content) {
        const clean = b.content.replace(/<[^>]*>/g, ' ').trim();
        if (clean) words += clean.split(/\s+/).length;
      }
      if (b.title) words += b.title.split(/\s+/).length;
      if (b.videoTakeaway) words += b.videoTakeaway.split(/\s+/).length;
      if (b.besideText) {
        const clean = b.besideText.replace(/<[^>]*>/g, ' ').trim();
        if (clean) words += clean.split(/\s+/).length;
      }
    }
    return words;
  }

  get estimatedReadMinutes(): number {
    const textMinutes = this.totalWords > 0 ? Math.ceil(this.totalWords / 200) : 0;
    let videoMinutes = 0;
    for (const b of this.moduleBlocks) {
      if (b.type === 'video' && b.url && b.videoDuration) {
        videoMinutes += Number(b.videoDuration);
      }
    }
    const total = textMinutes + videoMinutes;
    return total > 0 ? total : 1;
  }

  get totalQuizzesCount(): number {
    return this.moduleBlocks.filter(b => b.type === 'quiz').length;
  }

  // ── Block CRUD & Insertion ───────────────────────────────────
  addBlock(type: ModuleBlock['type'], slotIndex?: number): void {
    const newId = 'blk-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 5);
    const newBlock: ModuleBlock = {
      id: newId,
      type,
      title: this.getDefaultTitleForType(type),
      content: '',
      isEditing: type === 'text' || type === 'callout',
      imageWidth: '100%',
      imageAlign: 'center',
      imageBorder: true,
      imageRounded: true,
      imageShadow: false,
      calloutType: 'tip'
    };

    if (type === 'quiz') {
      newBlock.quizQuestions = [
        {
          id: 'q-1',
          question: 'What is the primary objective of this module concept?',
          options: ['Option A: Fundamental Concept', 'Option B: Secondary Architecture', 'Option C: Performance Constraint', 'Option D: Optimization Benchmark'],
          correctIndex: 0,
          explanation: 'Option A is correct because it addresses the foundational logic discussed.'
        }
      ];
      newBlock.activeQuestionIdx = 0;
      newBlock.quizQuestion = newBlock.quizQuestions[0].question;
      newBlock.quizOptions = newBlock.quizQuestions[0].options;
      newBlock.quizCorrectIndex = 0;
      newBlock.quizExplanation = newBlock.quizQuestions[0].explanation;
    } else if (type === 'code') {
      newBlock.codeLanguage = 'python';
      newBlock.codeStarter = '# Starter challenge template\ndef solution():\n    # Implement solution below\n    pass\n';
    } else if (type === 'callout') {
      newBlock.calloutType = 'tip';
      newBlock.title = 'Pro Tip & Best Practice';
      newBlock.content = 'Remember to structure your logic before implementing to ensure clean separation of concerns.';
    } else if (type === 'table') {
      newBlock.title = 'Data Comparison Matrix';
      newBlock.tableCaption = 'Comparative analysis and technical specifications';
      newBlock.tableHeaders = ['Component / Metric', 'Standard / Baseline', 'Championship Target', 'Status'];
      newBlock.tableRows = [
        ['Algorithmic Latency', '< 50ms', '< 10ms (Optimized)', 'Verified'],
        ['Memory Footprint', '< 256MB', '< 64MB (Minimal Arena)', 'Verified'],
        ['Throughput (req/s)', '1,000 req/s', '5,000 req/s', 'Target'],
        ['Test Coverage', '80% Branch', '95% Full Suite', 'In Progress']
      ];
      newBlock.tableTheme = 'primary';
      newBlock.tableStriped = true;
      newBlock.tableBordered = true;
      newBlock.tableHoverable = true;
      newBlock.tableCompact = false;
      newBlock.tableHighlightFirstColumn = true;
      newBlock.tableSearchable = true;
      newBlock.tableSortable = true;
      newBlock.tableAlignment = 'left';
      newBlock.tableFooterNotes = 'Data verified against competition benchmark criteria.';
    }

    if (slotIndex !== undefined && slotIndex >= 0 && slotIndex <= this.moduleBlocks.length) {
      this.moduleBlocks.splice(slotIndex, 0, newBlock);
    } else {
      this.moduleBlocks.push(newBlock);
    }

    this.selectedBlockId = newId;
    this.editingBlockId = (type === 'text' || type === 'callout') ? newId : null;
    this.activeInsertSlotIndex = null;
    this.dialogService.toast(`Added ${type.toUpperCase()} block to module.`, 'info');
    this.scheduleAutoSave(true);
    this.cdr.markForCheck();

    // Smoothly scroll down to the newly added block so the user immediately sees it
    setTimeout(() => {
      const el = document.getElementById('card-' + newId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        const stream = document.querySelector('.studio-canvas-stream');
        if (stream) {
          stream.scrollTo({ top: stream.scrollHeight, behavior: 'smooth' });
        }
      }
    }, 60);
  }

  private getDefaultTitleForType(type: ModuleBlock['type']): string {
    switch (type) {
      case 'text': return 'Core Concepts & Principles';
      case 'video': return 'Video Lecture';
      case 'quiz': return 'Comprehension Checkpoint';
      case 'code': return 'Interactive Coding Challenge';
      case 'table': return 'Data & Specification Table';
      case 'image': return ''; // Image titles are optional!
      case 'file': return 'Reference Document & Handout';
      case 'callout': return 'Important Notice';
      case 'break': return 'Section Checkpoint';
      default: return '';
    }
  }

  // ── Table Widget Manipulation Subsystem ─────────────────────
  addTableColumn(blk: ModuleBlock): void {
    if (!blk.tableHeaders) blk.tableHeaders = [];
    if (!blk.tableRows) blk.tableRows = [];
    const colNum = blk.tableHeaders.length + 1;
    blk.tableHeaders.push(`Column ${colNum}`);
    for (const row of blk.tableRows) {
      row.push('');
    }
    this.dialogService.toast('Added column to table.', 'info');
    this.scheduleAutoSave(true);
    this.cdr.markForCheck();
  }

  removeTableColumn(blk: ModuleBlock, colIdx: number): void {
    if (!blk.tableHeaders || blk.tableHeaders.length <= 1) {
      this.dialogService.toast('Table must retain at least one column.', 'warning');
      return;
    }
    blk.tableHeaders.splice(colIdx, 1);
    if (blk.tableRows) {
      for (const row of blk.tableRows) {
        row.splice(colIdx, 1);
      }
    }
    this.dialogService.toast('Removed column.', 'info');
    this.scheduleAutoSave(true);
    this.cdr.markForCheck();
  }

  addTableRow(blk: ModuleBlock): void {
    if (!blk.tableHeaders) blk.tableHeaders = ['Column 1', 'Column 2'];
    if (!blk.tableRows) blk.tableRows = [];
    const newRow = new Array(blk.tableHeaders.length).fill('');
    blk.tableRows.push(newRow);
    this.scheduleAutoSave(true);
    this.cdr.markForCheck();
  }

  removeTableRow(blk: ModuleBlock, rowIdx: number): void {
    if (!blk.tableRows || blk.tableRows.length <= 1) {
      this.dialogService.toast('Table must have at least one data row.', 'warning');
      return;
    }
    blk.tableRows.splice(rowIdx, 1);
    this.scheduleAutoSave(true);
    this.cdr.markForCheck();
  }

  moveTableRow(blk: ModuleBlock, rowIdx: number, direction: -1 | 1): void {
    if (!blk.tableRows) return;
    const targetIdx = rowIdx + direction;
    if (targetIdx < 0 || targetIdx >= blk.tableRows.length) return;
    const temp = blk.tableRows[rowIdx];
    blk.tableRows[rowIdx] = blk.tableRows[targetIdx];
    blk.tableRows[targetIdx] = temp;
    this.scheduleAutoSave(true);
    this.cdr.markForCheck();
  }

  duplicateTableRow(blk: ModuleBlock, rowIdx: number): void {
    if (!blk.tableRows || !blk.tableRows[rowIdx]) return;
    const cloned = [...blk.tableRows[rowIdx]];
    blk.tableRows.splice(rowIdx + 1, 0, cloned);
    this.dialogService.toast('Row duplicated.', 'info');
    this.scheduleAutoSave(true);
    this.cdr.markForCheck();
  }

  applyTablePreset(blk: ModuleBlock, presetKey: string): void {
    if (presetKey === 'complexity') {
      blk.tableTitle = 'Algorithmic Complexity Reference';
      blk.tableCaption = 'Asymptotic runtime and memory scaling bounds';
      blk.tableHeaders = ['Algorithm / Procedure', 'Best Case', 'Average Case', 'Worst Case', 'Space'];
      blk.tableRows = [
        ['Binary Search', 'O(1)', 'O(log n)', 'O(log n)', 'O(1)'],
        ['Merge Sort', 'O(n log n)', 'O(n log n)', 'O(n log n)', 'O(n)'],
        ['Quick Sort', 'O(n log n)', 'O(n log n)', 'O(n²)', 'O(log n)'],
        ['Dijkstra (Binary Heap)', 'O(V + E)', 'O((V + E) log V)', 'O((V + E) log V)', 'O(V)']
      ];
      blk.tableTheme = 'primary';
      blk.tableHighlightFirstColumn = true;
      blk.tableFooterNotes = 'V = vertices, E = edges in graph traversal.';
    } else if (presetKey === 'hardware') {
      blk.tableTitle = 'Microcontroller Pinout & Peripheral Mapping';
      blk.tableCaption = 'Hardware bus assignments and sensor voltage levels';
      blk.tableHeaders = ['Pin / Header', 'Function', 'Protocol / Signal', 'Target Hardware Device', 'Voltage'];
      blk.tableRows = [
        ['GPIO 21 (SDA)', 'I2C Data', 'I2C Fast Mode', 'MPU6050 IMU Accelerometer', '3.3V'],
        ['GPIO 22 (SCL)', 'I2C Clock', 'I2C Fast Mode', 'MPU6050 IMU Accelerometer', '3.3V'],
        ['GPIO 18', 'SPI SCK', 'Hardware SPI', 'TFT Display ST7789', '3.3V'],
        ['GPIO 23', 'PWM Timer', 'Timer 1 Ch A', 'Dual H-Bridge Motor Driver', '5.0V']
      ];
      blk.tableTheme = 'emerald';
      blk.tableHighlightFirstColumn = true;
      blk.tableFooterNotes = 'Verify common ground across 3.3V and 5.0V power rails.';
    } else if (presetKey === 'rubric') {
      blk.tableTitle = 'Tournament Evaluation & Rubric Weighting';
      blk.tableCaption = 'National Tech Championship judging scorecard';
      blk.tableHeaders = ['Evaluation Pillar', 'Points', 'Target Mastery', 'Verification Rubric'];
      blk.tableRows = [
        ['Algorithmic Efficiency', '30 pts', 'Sub-linear queries, zero memory leaks', 'Automated test runner benchmarks'],
        ['System Architecture', '25 pts', 'Clean modular boundaries, OOP/FP purity', 'Instructor code review & audit'],
        ['Resilience & Security', '25 pts', 'Strict sanitization, fault tolerance', 'Fuzz testing & penetration tests'],
        ['Project Documentation', '20 pts', 'Comprehensive schemas, README & demo', 'Live jury defense & presentation']
      ];
      blk.tableTheme = 'dark';
      blk.tableHighlightFirstColumn = true;
      blk.tableFooterNotes = 'Total scorecard: 100 points maximum.';
    }
    this.dialogService.toast(`Applied ${presetKey.toUpperCase()} preset to table.`, 'success');
    this.scheduleAutoSave(true);
    this.cdr.markForCheck();
  }

  exportTableToCsv(blk: ModuleBlock): string {
    const headers = (blk.tableHeaders || []).join(',');
    const rows = (blk.tableRows || []).map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    return `${headers}\n${rows}`;
  }

  copyTableMarkdown(blk: ModuleBlock): void {
    const headers = blk.tableHeaders || ['Col 1', 'Col 2'];
    const separator = headers.map(() => '---');
    const rows = blk.tableRows || [];
    const mdLines = [
      `| ${headers.join(' | ')} |`,
      `| ${separator.join(' | ')} |`,
      ...rows.map(r => `| ${r.join(' | ')} |`)
    ];
    const md = mdLines.join('\n');
    navigator.clipboard.writeText(md).then(() => {
      this.dialogService.toast('Table copied as Markdown!', 'success');
    }).catch(() => {
      this.dialogService.toast('Failed to copy to clipboard', 'error');
    });
  }

  // ── Preview Interactive Simulation for Table ────────────────
  previewTableSearchQuery: Record<string, string> = {};
  previewTableSortCol: Record<string, number | null> = {};
  previewTableSortAsc: Record<string, boolean> = {};

  setPreviewTableSort(blockId: string, colIdx: number): void {
    if (this.previewTableSortCol[blockId] === colIdx) {
      this.previewTableSortAsc[blockId] = !this.previewTableSortAsc[blockId];
    } else {
      this.previewTableSortCol[blockId] = colIdx;
      this.previewTableSortAsc[blockId] = true;
    }
    this.cdr.markForCheck();
  }

  getPreviewFilteredRows(blk: ModuleBlock): string[][] {
    let rows = [...(blk.tableRows || [])];
    const q = (this.previewTableSearchQuery[blk.id] || '').trim().toLowerCase();
    if (q) {
      rows = rows.filter(r => r.some(cell => (cell || '').toLowerCase().includes(q)));
    }
    const sortCol = this.previewTableSortCol[blk.id];
    if (sortCol !== undefined && sortCol !== null && sortCol >= 0) {
      const isAsc = this.previewTableSortAsc[blk.id] ?? true;
      rows.sort((a, b) => {
        const valA = (a[sortCol] || '').toLowerCase();
        const valB = (b[sortCol] || '').toLowerCase();
        const numA = parseFloat(valA);
        const numB = parseFloat(valB);
        if (!isNaN(numA) && !isNaN(numB)) {
          return isAsc ? numA - numB : numB - numA;
        }
        return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
    }
    return rows;
  }

  cloneBlock(index: number): void {
    if (index < 0 || index >= this.moduleBlocks.length) return;
    const source = this.moduleBlocks[index];
    const cloned: ModuleBlock = JSON.parse(JSON.stringify(source));
    cloned.id = 'blk-clone-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 5);
    if (cloned.title) cloned.title += ' (Copy)';
    this.moduleBlocks.splice(index + 1, 0, cloned);
    this.selectedBlockId = cloned.id;
    this.dialogService.toast(`Duplicated ${cloned.type.toUpperCase()} block.`, 'success');
    this.scheduleAutoSave(true);
    this.cdr.markForCheck();

    setTimeout(() => {
      const el = document.getElementById('card-' + cloned.id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 60);
  }

  removeBlock(index: number): void {
    if (index < 0 || index >= this.moduleBlocks.length) return;
    const blk = this.moduleBlocks[index];
    this.moduleBlocks.splice(index, 1);
    if (this.selectedBlockId === blk.id) {
      this.selectedBlockId = this.moduleBlocks[0]?.id || null;
    }
    this.dialogService.toast('Block removed from sequence.', 'info');
    this.scheduleAutoSave(true);
    this.cdr.markForCheck();
  }

  moveBlockUp(index: number): void {
    if (index <= 0) return;
    const temp = this.moduleBlocks[index];
    this.moduleBlocks[index] = this.moduleBlocks[index - 1];
    this.moduleBlocks[index - 1] = temp;
    this.scheduleAutoSave(true);
    this.cdr.markForCheck();
  }

  moveBlockDown(index: number): void {
    if (index >= this.moduleBlocks.length - 1) return;
    const temp = this.moduleBlocks[index];
    this.moduleBlocks[index] = this.moduleBlocks[index + 1];
    this.moduleBlocks[index + 1] = temp;
    this.scheduleAutoSave(true);
    this.cdr.markForCheck();
  }

  setEditingBlock(id: string | null): void {
    this.editingBlockId = id;
    if (id) this.selectedBlockId = id;
    this.cdr.markForCheck();
  }

  togglePaletteSidebar(): void {
    this.isPaletteCollapsed = !this.isPaletteCollapsed;
    this.cdr.markForCheck();
  }

  toggleCollapse(block: ModuleBlock): void {
    block.isCollapsed = !block.isCollapsed;
    this.cdr.markForCheck();
  }

  collapseAll(): void {
    this.moduleBlocks.forEach(b => b.isCollapsed = true);
    this.cdr.markForCheck();
  }

  expandAll(): void {
    this.moduleBlocks.forEach(b => b.isCollapsed = false);
    this.cdr.markForCheck();
  }

  toggleInsertSlot(index: number): void {
    this.activeInsertSlotIndex = this.activeInsertSlotIndex === index ? null : index;
    this.cdr.markForCheck();
  }

  // ── Drag and Drop Engine (Palette & Reordering) ───────────────
  onPaletteDragStart(event: DragEvent, type: ModuleBlock['type']): void {
    if (this.isCanvasPreviewMode) {
      event.preventDefault();
      return;
    }
    this.draggedPaletteType = type;
    this.draggedIndex = null;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copyMove';
      event.dataTransfer.setData('text/plain', 'palette:' + type);
    }
  }

  onPaletteDragEnd(): void {
    this.draggedPaletteType = null;
    this.dragOverIndex = null;
    this.isDragOverBottomPrompt = false;
  }

  onDragStart(event: DragEvent, index: number): void {
    this.draggedPaletteType = null;
    this.draggedIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', 'block:' + String(index));
    }
  }

  onDragOver(event: DragEvent, index: number): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = this.draggedPaletteType ? 'copy' : 'move';
    }
    this.dragOverIndex = index;
  }

  onDragLeave(event: DragEvent, index: number): void {
    if (this.dragOverIndex === index) {
      this.dragOverIndex = null;
    }
  }

  onDrop(event: DragEvent, dropIndex: number): void {
    event.preventDefault();

    // Check if dragging a new block widget from the palette
    if (this.draggedPaletteType) {
      const typeToAdd = this.draggedPaletteType;
      this.draggedPaletteType = null;
      this.dragOverIndex = null;
      this.addBlock(typeToAdd, dropIndex);
      return;
    }

    // Check if reordering an existing block
    if (this.draggedIndex === null || this.draggedIndex === dropIndex) {
      this.draggedIndex = null;
      this.dragOverIndex = null;
      return;
    }

    const itemToMove = this.moduleBlocks[this.draggedIndex];
    this.moduleBlocks.splice(this.draggedIndex, 1);
    this.moduleBlocks.splice(dropIndex, 0, itemToMove);

    this.draggedIndex = null;
    this.dragOverIndex = null;
    this.dialogService.toast('Block reordered successfully!', 'info');
    this.scheduleAutoSave(true);
    this.cdr.markForCheck();
  }

  onDragEnd(): void {
    this.draggedIndex = null;
    this.dragOverIndex = null;
    this.draggedPaletteType = null;
    this.isDragOverBottomPrompt = false;
  }

  onBottomPromptDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = this.draggedPaletteType ? 'copy' : 'move';
    }
    this.isDragOverBottomPrompt = true;
  }

  onBottomPromptDragLeave(): void {
    this.isDragOverBottomPrompt = false;
  }

  onBottomPromptDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOverBottomPrompt = false;
    if (this.draggedPaletteType) {
      const typeToAdd = this.draggedPaletteType;
      this.draggedPaletteType = null;
      this.addBlock(typeToAdd);
    } else if (this.draggedIndex !== null) {
      const itemToMove = this.moduleBlocks[this.draggedIndex];
      this.moduleBlocks.splice(this.draggedIndex, 1);
      this.moduleBlocks.push(itemToMove);
      this.draggedIndex = null;
      this.dialogService.toast('Block moved to end.', 'info');
      this.scheduleAutoSave(true);
      this.cdr.markForCheck();
    }
  }

  // ── Quiz Question Helpers ────────────────────────────────────
  getQuizQuestions(blk: ModuleBlock): QuizQuestionItem[] {
    if (!blk.quizQuestions || blk.quizQuestions.length === 0) {
      blk.quizQuestions = [
        {
          id: 'q-1',
          question: blk.quizQuestion || 'Question prompt',
          options: (blk.quizOptions && blk.quizOptions.length) ? blk.quizOptions : ['Option A', 'Option B', 'Option C', 'Option D'],
          correctIndex: blk.quizCorrectIndex ?? 0,
          explanation: blk.quizExplanation || ''
        }
      ];
      blk.activeQuestionIdx = 0;
    }
    return blk.quizQuestions;
  }

  getActiveQuizQuestion(blk: ModuleBlock): QuizQuestionItem {
    const questions = this.getQuizQuestions(blk);
    const idx = blk.activeQuestionIdx ?? 0;
    return questions[idx] || questions[0];
  }

  selectQuizQuestion(blk: ModuleBlock, qIdx: number): void {
    blk.activeQuestionIdx = qIdx;
    const activeQ = blk.quizQuestions ? blk.quizQuestions[qIdx] : null;
    if (activeQ) {
      blk.quizQuestion = activeQ.question;
      blk.quizOptions = activeQ.options;
      blk.quizCorrectIndex = Number(activeQ.correctIndex ?? 0);
      blk.quizExplanation = activeQ.explanation;
    }
    this.cdr.markForCheck();
  }

  isQuizOptionCorrect(blk: ModuleBlock, oIdx: number): boolean {
    const q = this.getActiveQuizQuestion(blk);
    const cIdx = Number(q?.correctIndex ?? blk.quizCorrectIndex ?? 0);
    return cIdx === Number(oIdx);
  }

  setQuizCorrectOption(blk: ModuleBlock, oIdx: number): void {
    const numIdx = Number(oIdx) || 0;
    const q = this.getActiveQuizQuestion(blk);
    if (q) {
      q.correctIndex = numIdx;
    }
    blk.quizCorrectIndex = numIdx;
    this.scheduleAutoSave(true);
    this.cdr.markForCheck();
  }

  addQuizQuestion(blk: ModuleBlock): void {
    const questions = this.getQuizQuestions(blk);
    const newQ: QuizQuestionItem = {
      id: 'q-' + (questions.length + 1),
      question: '',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correctIndex: 0,
      explanation: ''
    };
    questions.push(newQ);
    blk.activeQuestionIdx = questions.length - 1;
    blk.quizQuestion = newQ.question;
    blk.quizOptions = newQ.options;
    blk.quizCorrectIndex = 0;
    blk.quizExplanation = '';
    this.scheduleAutoSave(true);
    this.cdr.markForCheck();
  }

  removeQuizQuestion(blk: ModuleBlock, qIdx: number): void {
    const questions = this.getQuizQuestions(blk);
    if (questions.length <= 1) return;
    questions.splice(qIdx, 1);
    blk.activeQuestionIdx = Math.max(0, qIdx - 1);
    this.selectQuizQuestion(blk, blk.activeQuestionIdx);
    this.scheduleAutoSave(true);
    this.cdr.markForCheck();
  }

  // ── File Upload Handler ──────────────────────────────────────
  onFileInputChange(event: Event, blk: ModuleBlock): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    this.uploadFile.emit({ file, block: blk });
  }

  // ── Save Action ──────────────────────────────────────────────
  onSave(): void {
    if (this.isReadOnly) {
      this.dialogService.toast('Admins cannot edit or save modules in review mode.', 'info');
      return;
    }
    if (!this.moduleForm.title.trim()) {
      this.dialogService.toast('Please provide a module title before saving.', 'warning');
      return;
    }
    this.performAutoSave();
    this.save.emit({
      moduleForm: this.moduleForm,
      blocks: this.moduleBlocks
    });
  }

  onExit(): void {
    if (!this.isReadOnly) {
      this.performAutoSave();
    }
    this.exit.emit();
  }

  // ── AI Question Builder Modal Handlers ───────────────────────
  openAiQuestionBuilder(blk: ModuleBlock | null): void {
    this.targetAiQuizBlock = blk;
    this.isAiQuestionBuilderOpen = true;
    this.aiBuilderError = '';
    this.previewQuestions = [];
    this.previewActiveIdx = 0;
    // Default to paste mode per user request
    this.aiBuilderTab = 'paste';
    this.aiQuestionSettings.count = blk ? 1 : 3;
    this.cdr.markForCheck();
  }

  closeAiQuestionBuilderModal(): void {
    this.isAiQuestionBuilderOpen = false;
    this.targetAiQuizBlock = null;
    this.isProcessingAiQuestions = false;
    this.cdr.markForCheck();
  }

  setAiBuilderTab(tab: 'paste' | 'documents'): void {
    this.aiBuilderTab = tab;
    this.aiBuilderError = '';
    this.cdr.markForCheck();
  }

  getAvailableGuideContentLength(): number {
    return this.moduleBlocks
      .filter(b => b.type === 'text' && b.content?.trim())
      .reduce((acc, b) => acc + (b.content?.length || 0), 0);
  }

  getAvailableAttachedDocCount(): number {
    return this.moduleBlocks.filter(b => b.type === 'file' && (b.fileName || b.url)).length;
  }

  onSlideDocSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    this.uploadedSlideDocName = file.name;
    this.isUploadingSlideDoc = true;
    this.cdr.markForCheck();

    if (file.name.endsWith('.txt') || file.name.endsWith('.md') || file.name.endsWith('.json') || file.type.startsWith('text/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.uploadedSlideDocText = (e.target?.result as string) || '';
        this.isUploadingSlideDoc = false;
        this.dialogService.toast(`Loaded slide document "${file.name}"`, 'success');
        this.cdr.markForCheck();
      };
      reader.onerror = () => {
        this.isUploadingSlideDoc = false;
        this.dialogService.toast(`Could not read file "${file.name}".`, 'error');
        this.cdr.markForCheck();
      };
      reader.readAsText(file);
    } else {
      // PDF or Office file metadata
      this.uploadedSlideDocText = `[Attached Curriculum Document: ${file.name}, size: ${(file.size / 1024).toFixed(1)} KB]`;
      this.isUploadingSlideDoc = false;
      this.dialogService.toast(`Referenced document "${file.name}".`, 'info');
      this.cdr.markForCheck();
    }
  }

  clearUploadedSlideDoc(): void {
    this.uploadedSlideDocName = '';
    this.uploadedSlideDocText = '';
    this.cdr.markForCheck();
  }

  executeAiQuestionBuilder(): void {
    if (this.isProcessingAiQuestions) return;
    this.aiBuilderError = '';

    let sourceText = '';
    const mode = this.aiBuilderTab === 'paste' ? 'parse' : 'generate';

    if (this.aiBuilderTab === 'paste') {
      sourceText = (this.rawPastedQuizText || '').trim();
      if (!sourceText) {
        this.aiBuilderError = 'Please paste questions, exam notes, or lecture points to organize.';
        this.dialogService.toast(this.aiBuilderError, 'warning');
        return;
      }
    } else {
      // From slides and documents
      const parts: string[] = [];
      if (this.uploadedSlideDocText.trim()) {
        parts.push(this.uploadedSlideDocText.trim());
      }
      if (this.aiQuestionSettings.includeLessonGuides) {
        const guideBlocks = this.moduleBlocks.filter(b => b.type === 'text' && b.content?.trim());
        guideBlocks.forEach(b => {
          parts.push(`${b.title || 'Lesson Guide'}:\n${b.content}`);
        });
      }
      sourceText = parts.join('\n\n').trim();
      if (!sourceText) {
        sourceText = `${this.moduleForm.title} - ${this.moduleForm.description || 'Core STEM concepts and algorithmic principles.'}`;
      }
    }

    this.isProcessingAiQuestions = true;
    this.cdr.markForCheck();

    const track = this.course?.track || 'coding';
    const title = this.moduleForm.title || 'Technical Curriculum';

    this.apiService.generateAiQuiz(sourceText, track, title, {
      mode: mode,
      questionType: this.aiQuestionSettings.questionType,
      difficulty: this.aiQuestionSettings.difficulty,
      count: this.aiQuestionSettings.count
    }).subscribe({
      next: (res: any) => {
        this.isProcessingAiQuestions = false;
        const rawList = (res?.questions && Array.isArray(res.questions) && res.questions.length > 0)
          ? res.questions
          : [res];

        this.previewQuestions = rawList.map((q: any, idx: number) => {
          const opts = (q.options && q.options.length >= 2) ? q.options : ['Option A', 'Option B', 'Option C', 'Option D'];
          const rawC = q.correct_index ?? q.correctIndex;
          let cIdx = typeof rawC === 'number' ? rawC : parseInt(rawC, 10);
          const exp = (q.explanation || '').trim();

          // Safely deduce correct index if undefined or invalid
          if (isNaN(cIdx) || cIdx < 0 || cIdx >= opts.length) {
            cIdx = 0;
          }
          // If True/False and explanation explicitly says "False" or "True", auto-align
          if (opts.length === 2 && opts[0].toLowerCase() === 'true' && opts[1].toLowerCase() === 'false') {
            const expLow = exp.toLowerCase();
            if (expLow.startsWith('false') || expLow.includes('answer is false') || expLow.includes('statement is false')) {
              cIdx = 1;
            } else if (expLow.startsWith('true') || expLow.includes('answer is true') || expLow.includes('statement is true')) {
              cIdx = 0;
            }
          }

          return {
            id: 'q-ai-' + Date.now() + '-' + (idx + 1),
            question: q.question || 'Comprehension checkpoint question',
            options: opts,
            correctIndex: cIdx,
            explanation: exp || 'Verified answer key explanation.'
          };
        });

        this.previewActiveIdx = 0;
        this.insertParsedQuestionsIntoModule(this.previewQuestions, mode);
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        this.isProcessingAiQuestions = false;
        this.aiBuilderError = err?.error?.detail || 'Failed to generate questions. Please try again.';
        this.dialogService.toast(this.aiBuilderError, 'error');
        this.cdr.markForCheck();
      }
    });
  }

  insertParsedQuestionsIntoModule(questions: QuizQuestionItem[], mode: 'parse' | 'generate'): void {
    if (!questions || questions.length === 0) return;

    if (this.targetAiQuizBlock) {
      // Opened from an existing quiz block
      const targetQList = this.getQuizQuestions(this.targetAiQuizBlock);
      const activeIdx = this.targetAiQuizBlock.activeQuestionIdx ?? 0;

      const currentQ = targetQList[activeIdx];
      const isCurrentBlank = !currentQ || !currentQ.question || !currentQ.question.trim() || currentQ.question === 'New Comprehension Checkpoint';

      if (isCurrentBlank && targetQList.length <= 1) {
        // Replace current placeholder question with the first parsed question
        targetQList[0] = { ...questions[0], id: targetQList[0]?.id || 'q-1' };
        // If multiple questions were parsed, append the rest
        for (let i = 1; i < questions.length; i++) {
          targetQList.push({
            ...questions[i],
            id: 'q-' + (targetQList.length + 1)
          });
        }
        this.selectQuizQuestion(this.targetAiQuizBlock, 0);
      } else {
        // Append all parsed questions to this quiz block
        const startIdx = targetQList.length;
        for (const q of questions) {
          targetQList.push({
            ...q,
            id: 'q-' + (targetQList.length + 1)
          });
        }
        this.selectQuizQuestion(this.targetAiQuizBlock, startIdx);
      }

      this.selectedBlockId = this.targetAiQuizBlock.id;
      this.editingBlockId = this.targetAiQuizBlock.id;

      const actionText = mode === 'parse' ? 'Parsed & organized' : 'Generated';
      this.dialogService.toast(`${actionText} ${questions.length} question(s) into Quiz block!`, 'success');
    } else {
      // Opened from palette or general builder -> create a new Quiz Block
      const firstQ = questions[0];
      const newQuestions: QuizQuestionItem[] = questions.map((q, idx) => ({
        id: 'q-' + (idx + 1),
        question: q.question,
        options: [...q.options],
        correctIndex: q.correctIndex,
        explanation: q.explanation
      }));

      const newBlock: ModuleBlock = {
        id: 'blk-quiz-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 5),
        type: 'quiz',
        title: 'Checkpoint Quiz: ' + (firstQ.question.slice(0, 36) || 'Comprehension Check') + '...',
        quizQuestions: newQuestions,
        activeQuestionIdx: 0,
        quizQuestion: firstQ.question,
        quizOptions: [...firstQ.options],
        quizCorrectIndex: firstQ.correctIndex,
        quizExplanation: firstQ.explanation
      };

      this.moduleBlocks.push(newBlock);
      this.selectedBlockId = newBlock.id;
      this.editingBlockId = newBlock.id;

      const actionText = mode === 'parse' ? 'Parsed & organized' : 'Created';
      this.dialogService.toast(`${actionText} new Quiz block with ${newQuestions.length} question(s)!`, 'success');
    }

    // Immediately trigger auto-save so parsed/generated content is never lost
    this.scheduleAutoSave(true);

    // Reset inputs and close modal so author can proceed immediately
    this.rawPastedQuizText = '';
    this.closeAiQuestionBuilderModal();
  }

  selectPreviewQuestion(idx: number): void {
    if (idx >= 0 && idx < this.previewQuestions.length) {
      this.previewActiveIdx = idx;
      this.cdr.markForCheck();
    }
  }

  removePreviewQuestion(idx: number): void {
    this.previewQuestions.splice(idx, 1);
    this.previewActiveIdx = Math.max(0, Math.min(this.previewActiveIdx, this.previewQuestions.length - 1));
    this.cdr.markForCheck();
  }

  applyAiQuestionToActive(): void {
    if (!this.targetAiQuizBlock || this.previewQuestions.length === 0) return;
    const activeQ = this.previewQuestions[this.previewActiveIdx] || this.previewQuestions[0];
    const targetQList = this.getQuizQuestions(this.targetAiQuizBlock);
    const targetIdx = this.targetAiQuizBlock.activeQuestionIdx ?? 0;

    if (targetQList[targetIdx]) {
      targetQList[targetIdx] = { ...activeQ, id: targetQList[targetIdx].id };
    } else {
      targetQList.push({ ...activeQ });
      this.targetAiQuizBlock.activeQuestionIdx = targetQList.length - 1;
    }

    this.targetAiQuizBlock.quizQuestion = activeQ.question;
    this.targetAiQuizBlock.quizOptions = activeQ.options;
    this.targetAiQuizBlock.quizCorrectIndex = activeQ.correctIndex;
    this.targetAiQuizBlock.quizExplanation = activeQ.explanation;

    this.dialogService.toast('Applied question to active prompt!', 'success');
    this.scheduleAutoSave(true);
    this.closeAiQuestionBuilderModal();
  }

  appendAllAiQuestionsToBlock(): void {
    if (!this.targetAiQuizBlock || this.previewQuestions.length === 0) return;
    const targetQList = this.getQuizQuestions(this.targetAiQuizBlock);

    this.previewQuestions.forEach((q, i) => {
      targetQList.push({
        id: 'q-' + (targetQList.length + 1),
        question: q.question,
        options: [...q.options],
        correctIndex: q.correctIndex,
        explanation: q.explanation
      });
    });

    this.targetAiQuizBlock.activeQuestionIdx = targetQList.length - 1;
    this.selectQuizQuestion(this.targetAiQuizBlock, this.targetAiQuizBlock.activeQuestionIdx);

    this.dialogService.toast(`Appended ${this.previewQuestions.length} question(s) to quiz tabs!`, 'success');
    this.scheduleAutoSave(true);
    this.closeAiQuestionBuilderModal();
  }

  createAiQuestionsAsNewBlock(): void {
    if (this.previewQuestions.length === 0) return;

    const firstQ = this.previewQuestions[0];
    const newQuestions: QuizQuestionItem[] = this.previewQuestions.map((q, idx) => ({
      id: 'q-' + (idx + 1),
      question: q.question,
      options: [...q.options],
      correctIndex: q.correctIndex,
      explanation: q.explanation
    }));

    const newBlock: ModuleBlock = {
      id: 'blk-quiz-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 5),
      type: 'quiz',
      title: 'Checkpoint Quiz: ' + (firstQ.question.slice(0, 38) || 'Comprehension Check') + '...',
      quizQuestions: newQuestions,
      activeQuestionIdx: 0,
      quizQuestion: firstQ.question,
      quizOptions: [...firstQ.options],
      quizCorrectIndex: firstQ.correctIndex,
      quizExplanation: firstQ.explanation
    };

    this.moduleBlocks.push(newBlock);
    this.selectedBlockId = newBlock.id;
    this.editingBlockId = newBlock.id;

    this.dialogService.toast(`Created new Quiz block with ${newQuestions.length} question(s)!`, 'success');
    this.scheduleAutoSave(true);
    this.closeAiQuestionBuilderModal();
  }
}
