import {
  Component, ChangeDetectionStrategy, Input, Output, EventEmitter,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogService } from '../../../../services/dialog.service';
import {
  LmsModule as ApiLmsModule,
  LmsMaterial as ApiLmsMaterial,
  LmsAssignment
} from '../../../../services/api.service';

export interface ReviewFeedbackItem {
  id: string;
  section: string;
  quote: string;
  note: string;
  timestamp: string;
  elementId?: string;
}

export interface RubricCriterion {
  id: string;
  title: string;
  maxPoints: number;
  description?: string;
  earnedPoints?: number;
}

export interface ModuleBlock {
  id: string;
  type: 'text' | 'video' | 'quiz' | 'code' | 'break' | 'resource' | 'image' | 'file';
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
  codeLanguage?: string;
  codeStarter?: string;
  codeInstructions?: string;
}

@Component({
  selector: 'app-course-review-audit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './course-review-audit.component.html',
  styleUrls: ['./course-review-audit.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseReviewAuditComponent {
  @Input() course: any = null;
  @Input() modules: ApiLmsModule[] = [];
  @Input() materials: ApiLmsMaterial[] = [];
  @Input() assignments: LmsAssignment[] = [];
  @Input() competitions: Array<{ id: string; title: string }> = [];
  @Input() isSaving = false;

  @Output() exit = new EventEmitter<void>();
  @Output() approve = new EventEmitter<void>();
  @Output() sendFeedback = new EventEmitter<{ payload: string; items: ReviewFeedbackItem[] }>();
  @Output() reject = new EventEmitter<{ reason: string; checklist: string[] }>();

  // ── Reviewer Desk State ─────────────────────────────────────
  reviewQuoteText = '';
  reviewQuoteSection = '';
  reviewQuoteElementId = '';
  reviewFeedbackNote = '';
  reviewFeedbackComments: ReviewFeedbackItem[] = [];

  // ── Rejection Modal State ───────────────────────────────────
  isRejectModalOpen = false;
  rejectionReason = '';
  rejectionChecklist = [
    { label: 'Incomplete or missing curriculum modules', checked: false },
    { label: 'Missing starter code, boilerplate, or challenge test-cases', checked: false },
    { label: 'Insufficient checkpoint quiz questions or missing explanations', checked: false },
    { label: 'Low quality, unformatted, or inaccurate theory descriptions', checked: false },
    { label: 'Broken external resource links or media attachments', checked: false },
    { label: 'Curriculum does not align with designated track or competition cycle', checked: false },
  ];

  constructor(
    private dialogService: DialogService,
    private cdr: ChangeDetectorRef
  ) {}

  get courseModules(): ApiLmsModule[] {
    if (!this.course?.id) return [];
    return this.modules
      .filter(m => m.course_id === this.course.id)
      .sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
  }

  get courseAssignments(): LmsAssignment[] {
    if (!this.course?.id) return [];
    return this.assignments.filter(a => (a.course_id || (a as any).courseId) === this.course.id);
  }

  getModuleBlocks(moduleId: string): ModuleBlock[] {
    const mats = this.materials.filter(m => m.module_id === moduleId);
    return mats.map(m => this.parseMaterialToBlock(m));
  }

  private parseMaterialToBlock(mat: ApiLmsMaterial): ModuleBlock {
    let rawPayload = mat.description || '';
    let parsed: any = null;

    while (typeof rawPayload === 'string' && rawPayload.trim().startsWith('{')) {
      try {
        const next = JSON.parse(rawPayload);
        parsed = { ...parsed, ...next };
        if (typeof next.instructions === 'string') rawPayload = next.instructions;
        else if (typeof next.overview === 'string') rawPayload = next.overview;
        else if (typeof next.caption === 'string') rawPayload = next.caption;
        else { rawPayload = ''; break; }
      } catch {
        break;
      }
    }

    let bType: ModuleBlock['type'] = 'text';
    const declaredType = (mat.type || '').toLowerCase();
    const widgetType = (parsed?.widget || '').toLowerCase();

    if (declaredType === 'guide' || declaredType === 'text' || widgetType === 'text' || widgetType === 'guide') {
      bType = 'text';
    } else if (declaredType === 'video' || widgetType === 'video') {
      bType = 'video';
    } else if (declaredType === 'quiz' || widgetType === 'quiz') {
      bType = 'quiz';
    } else if (declaredType === 'code' || widgetType === 'code') {
      bType = 'code';
    } else if (declaredType === 'image' || widgetType === 'image') {
      bType = 'image';
    } else if (declaredType === 'file' || declaredType === 'document' || widgetType === 'file') {
      bType = 'file';
    } else if (declaredType === 'break' || widgetType === 'break') {
      bType = 'break';
    }

    let contentText = typeof rawPayload === 'string' ? rawPayload : '';
    if (contentText.trim().startsWith('{') && contentText.includes('"widget"')) {
      contentText = '';
    }

    return {
      id: mat.id,
      type: bType,
      title: mat.title || '',
      content: contentText,
      url: mat.url || '',
      fileName: parsed?.fileName || '',
      fileSize: parsed?.fileSize || '',
      mimeType: parsed?.mimeType || '',
      videoDuration: parsed?.durationMinutes || 15,
      videoTakeaway: parsed?.keyTakeaway || '',
      videoSource: parsed?.source || (mat.url?.includes('files/') ? 'upload' : 'url'),
      quizQuestion: parsed?.question || mat.title || '',
      quizOptions: (Array.isArray(parsed?.options) && parsed.options.length) ? parsed.options : ['Option A', 'Option B', 'Option C', 'Option D'],
      quizCorrectIndex: parsed?.correctIndex ?? 0,
      quizExplanation: parsed?.explanation || '',
      codeLanguage: parsed?.language || 'python',
      codeStarter: parsed?.starterCode || '# Starter code\n',
      codeInstructions: parsed?.instructions || contentText,
    };
  }

  getAssignmentRubric(asgn: any): RubricCriterion[] {
    if (!asgn || !asgn.description) return [];
    const match = asgn.description.match(/<!-- RUBRIC_DATA:([\s\S]*?)-->/);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1]) || [];
      } catch {
        return [];
      }
    }
    return [];
  }

  getAssignmentCleanDescription(asgn: any): string {
    if (!asgn || !asgn.description) return '';
    return asgn.description.replace(/<!-- RUBRIC_DATA:[\s\S]*?-->/g, '').trim();
  }

  getAssignmentMaxScore(asgn: any): number {
    return asgn?.max_score ?? asgn?.maxPoints ?? 100;
  }

  getAssignmentDueDate(asgn: any): string | null {
    return asgn?.due_date || asgn?.dueDate || null;
  }

  stripHtml(html?: string): string {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  getFormattedDescription(desc?: string): string {
    if (!desc) return '';
    if (desc.trim().startsWith('{')) {
      try {
        const p = JSON.parse(desc);
        return p.overview || p.instructions || p.caption || '';
      } catch {
        return desc;
      }
    }
    return desc;
  }

  cycleLabel(competitionId?: string): string {
    if (!competitionId) return 'General';
    const c = this.competitions.find(item => item.id === competitionId);
    return c ? c.title : 'Competition Cycle';
  }

  // ── Quoting & Section Jumping Engine ────────────────────────
  quoteSection(sectionName: string, textSnippet?: string, elementId?: string): void {
    // If there is already an unsaved review note, auto-save it first rather than losing it!
    if (this.reviewFeedbackNote.trim()) {
      this.addFeedbackComment();
      this.dialogService.toast('Previous drafted review note auto-saved!', 'info');
    }

    this.reviewQuoteSection = sectionName;
    this.reviewQuoteText = textSnippet ? textSnippet.slice(0, 200) : '';
    this.reviewQuoteElementId = elementId || '';

    this.dialogService.toast(`Quoted "${sectionName}" to Reviewer Desk`, 'info');
    this.cdr.markForCheck();

    // Scroll to and highlight section on canvas
    if (elementId) {
      this.scrollToQuotedElement(elementId);
    }
  }

  clearQuote(): void {
    this.reviewQuoteSection = '';
    this.reviewQuoteText = '';
    this.reviewQuoteElementId = '';
    this.cdr.markForCheck();
  }

  addFeedbackComment(): void {
    if (!this.reviewFeedbackNote.trim()) {
      this.dialogService.toast('Please write a feedback note or recommendation before adding.', 'warning');
      return;
    }

    this.reviewFeedbackComments.push({
      id: 'rfc-' + Math.random().toString(36).slice(2, 7),
      section: this.reviewQuoteSection || 'General Course Curriculum',
      quote: this.reviewQuoteText || '',
      note: this.reviewFeedbackNote.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      elementId: this.reviewQuoteElementId || undefined
    });

    this.reviewFeedbackNote = '';
    this.reviewQuoteSection = '';
    this.reviewQuoteText = '';
    this.reviewQuoteElementId = '';
    this.dialogService.toast('Review comment attached to draft.', 'success');
    this.cdr.markForCheck();
  }

  removeFeedbackComment(idx: number): void {
    this.reviewFeedbackComments.splice(idx, 1);
    this.cdr.markForCheck();
  }

  scrollToQuotedElement(elementId?: string): void {
    if (!elementId) return;
    const targetEl = document.getElementById(elementId);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetEl.classList.remove('highlight-pulse');
      void targetEl.offsetWidth;
      targetEl.classList.add('highlight-pulse');
      setTimeout(() => {
        targetEl.classList.remove('highlight-pulse');
      }, 2000);
    }
  }

  // ── Action Handlers ─────────────────────────────────────────
  onSendFeedback(): void {
    if (this.reviewFeedbackComments.length === 0 && !this.reviewFeedbackNote.trim()) {
      this.dialogService.toast('Please add at least one review observation or note before sending.', 'warning');
      return;
    }

    if (this.reviewFeedbackNote.trim()) {
      this.addFeedbackComment();
    }

    const lines = this.reviewFeedbackComments.map((c, i) =>
      `${i + 1}. [${c.section}]${c.quote ? `\n   Quoted snippet: "${c.quote}"\n   Recommendation: ` : ' Recommendation: '}${c.note}`
    );
    const payload = `Curriculum Review & Revision Recommendations:\n\n${lines.join('\n\n')}`;
    this.sendFeedback.emit({ payload, items: [...this.reviewFeedbackComments] });
  }

  onApprove(): void {
    this.approve.emit();
  }

  openRejectModal(): void {
    this.rejectionReason = '';
    this.rejectionChecklist.forEach(c => c.checked = false);
    this.isRejectModalOpen = true;
    this.cdr.markForCheck();
  }

  closeRejectModal(): void {
    this.isRejectModalOpen = false;
    this.cdr.markForCheck();
  }

  confirmRejection(): void {
    const selectedChecks = this.rejectionChecklist.filter(c => c.checked).map(c => c.label);
    if (!this.rejectionReason.trim() && selectedChecks.length === 0) {
      this.dialogService.toast('Please provide a reason or select at least one issue checklist item.', 'warning');
      return;
    }

    let finalReason = '';
    if (selectedChecks.length > 0) {
      finalReason += `Rejection Grounds:\n- ` + selectedChecks.join('\n- ') + `\n\n`;
    }
    if (this.rejectionReason.trim()) {
      finalReason += `Detailed Remediation Instructions:\n${this.rejectionReason.trim()}`;
    }

    this.reject.emit({ reason: finalReason.trim(), checklist: selectedChecks });
    this.closeRejectModal();
  }
}
