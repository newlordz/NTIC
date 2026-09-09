import {
  Component, ChangeDetectionStrategy, Input, Output, EventEmitter,
  OnInit, OnChanges, SimpleChanges, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QuillEditorComponent } from 'ngx-quill';
import { DialogService } from '../../../../services/dialog.service';

export interface QuizQuestionItem {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
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
export class ModuleStudioComponent implements OnInit, OnChanges {
  @Input() course: any = null;
  @Input() module: any = null;
  @Input() initialBlocks: ModuleBlock[] = [];
  @Input() isSaving = false;
  @Input() saveError = '';

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
      [{ font: [] }, { size: ['small', false, 'large', 'huge'] }],
      [{ header: [1, 2, 3, 4, 5, 6, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ color: [] }, { background: [] }],
      [{ script: 'sub' }, { script: 'super' }],
      [{ header: 1 }, { header: 2 }, 'blockquote', 'code-block'],
      [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }],
      [{ direction: 'rtl' }, { align: [] }],
      ['link', 'image', 'video'],
      ['clean']
    ]
  };

  constructor(
    private dialogService: DialogService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initModuleData();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['module'] || changes['initialBlocks']) {
      this.initModuleData();
    }
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
    } else if (!this.module) {
      this.moduleBlocks = [
        {
          id: 'blk-init-1',
          type: 'text',
          title: 'Module Overview & Learning Objectives',
          content: '<p>Welcome to this module. In this lesson, we will explore core architectural principles, analyze reference implementations, and complete hands-on checkpoint challenges.</p>',
          isEditing: false
        }
      ];
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
    this.cdr.markForCheck();
  }

  addTableRow(blk: ModuleBlock): void {
    if (!blk.tableHeaders) blk.tableHeaders = ['Column 1', 'Column 2'];
    if (!blk.tableRows) blk.tableRows = [];
    const newRow = new Array(blk.tableHeaders.length).fill('');
    blk.tableRows.push(newRow);
    this.cdr.markForCheck();
  }

  removeTableRow(blk: ModuleBlock, rowIdx: number): void {
    if (!blk.tableRows || blk.tableRows.length <= 1) {
      this.dialogService.toast('Table must have at least one data row.', 'warning');
      return;
    }
    blk.tableRows.splice(rowIdx, 1);
    this.cdr.markForCheck();
  }

  moveTableRow(blk: ModuleBlock, rowIdx: number, direction: -1 | 1): void {
    if (!blk.tableRows) return;
    const targetIdx = rowIdx + direction;
    if (targetIdx < 0 || targetIdx >= blk.tableRows.length) return;
    const temp = blk.tableRows[rowIdx];
    blk.tableRows[rowIdx] = blk.tableRows[targetIdx];
    blk.tableRows[targetIdx] = temp;
    this.cdr.markForCheck();
  }

  duplicateTableRow(blk: ModuleBlock, rowIdx: number): void {
    if (!blk.tableRows || !blk.tableRows[rowIdx]) return;
    const cloned = [...blk.tableRows[rowIdx]];
    blk.tableRows.splice(rowIdx + 1, 0, cloned);
    this.dialogService.toast('Row duplicated.', 'info');
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
    this.cdr.markForCheck();
  }

  moveBlockUp(index: number): void {
    if (index <= 0) return;
    const temp = this.moduleBlocks[index];
    this.moduleBlocks[index] = this.moduleBlocks[index - 1];
    this.moduleBlocks[index - 1] = temp;
    this.cdr.markForCheck();
  }

  moveBlockDown(index: number): void {
    if (index >= this.moduleBlocks.length - 1) return;
    const temp = this.moduleBlocks[index];
    this.moduleBlocks[index] = this.moduleBlocks[index + 1];
    this.moduleBlocks[index + 1] = temp;
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
      blk.quizCorrectIndex = activeQ.correctIndex;
      blk.quizExplanation = activeQ.explanation;
    }
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
    this.cdr.markForCheck();
  }

  removeQuizQuestion(blk: ModuleBlock, qIdx: number): void {
    const questions = this.getQuizQuestions(blk);
    if (questions.length <= 1) return;
    questions.splice(qIdx, 1);
    blk.activeQuestionIdx = Math.max(0, qIdx - 1);
    this.selectQuizQuestion(blk, blk.activeQuestionIdx);
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
    if (!this.moduleForm.title.trim()) {
      this.dialogService.toast('Please provide a module title before saving.', 'warning');
      return;
    }
    this.save.emit({
      moduleForm: this.moduleForm,
      blocks: this.moduleBlocks
    });
  }

  onExit(): void {
    this.exit.emit();
  }
}
