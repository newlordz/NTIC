import {
  Component, ChangeDetectionStrategy, Input, Output, EventEmitter,
  OnInit, OnChanges, SimpleChanges, ChangeDetectorRef
} from '@angular/core';
import { CommonModule, TitleCasePipe } from '@angular/common';

@Component({
  selector: 'app-course-review-feedback',
  standalone: true,
  imports: [CommonModule, TitleCasePipe],
  templateUrl: './course-review-feedback.component.html',
  styleUrls: ['./course-review-feedback.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseReviewFeedbackComponent implements OnInit, OnChanges {
  @Input() course: any = null;
  @Input() modules: any[] = [];
  @Input() materials: any[] = [];

  @Output() exit = new EventEmitter<void>();
  @Output() editCurriculum = new EventEmitter<void>();

  selectedModuleId: string | null = null;
  activeSectionTab: 'all' | 'overview' | 'curriculum' = 'all';

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    if (this.modules && this.modules.length > 0) {
      this.selectedModuleId = this.modules[0].id;
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['modules'] && this.modules && this.modules.length > 0 && !this.selectedModuleId) {
      this.selectedModuleId = this.modules[0].id;
      this.cdr.markForCheck();
    }
  }

  get rejectionReason(): string {
    return this.getCleanRejectionReason();
  }

  get structuredFeedbackItems(): Array<{ section: string; note: string; quote?: string; elementId?: string }> {
    const raw = this.course?.rejectionReason || this.course?.rejection_reason || '';
    const match = raw.match(/<!-- REVIEW_FEEDBACK_DATA:([\s\S]*?)-->/);
    if (match && match[1]) {
      try {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    // Fallback: parse lines like "1. [Module 1: Title]\n Recommendation: Note"
    const items: Array<{ section: string; note: string; quote?: string; elementId?: string }> = [];
    const sectionRegex = /\d+\.\s*\[(.*?)\](?:\s*Quoted snippet:\s*"(.*?)")?(?:\s*(?:Recommendation|Action Required):\s*(.*?)(?=\n\d+\.|\n\n<!--|$))/gs;
    let m: RegExpExecArray | null;
    while ((m = sectionRegex.exec(raw)) !== null) {
      items.push({
        section: m[1]?.trim() || '',
        quote: m[2]?.trim() || '',
        note: m[3]?.trim() || '',
      });
    }
    return items;
  }

  getCleanRejectionReason(): string {
    const raw = this.course?.rejectionReason || this.course?.rejection_reason || '';
    const clean = raw.replace(/<!-- REVIEW_FEEDBACK_DATA:[\s\S]*?-->/g, '').trim();
    return clean || 'No specific text comments provided by the reviewer.';
  }

  getAllFeedbackForSection(sectionName: string, elementId?: string): Array<{ section: string; note: string; quote?: string; elementId?: string }> {
    const items = this.structuredFeedbackItems;
    if (!items || !items.length) return [];
    const lower = (sectionName || '').toLowerCase().trim();
    return items.filter(i => {
      if (elementId && i.elementId && i.elementId === elementId) return true;
      const itemLower = (i.section || '').toLowerCase().trim();
      return itemLower === lower || itemLower.includes(lower) || lower.includes(itemLower);
    });
  }

  getModules(): any[] {
    return (this.modules || []).slice().sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
  }

  getMaterialsForModule(moduleId: string): any[] {
    return (this.materials || []).filter(m => m.module_id === moduleId || m.moduleId === moduleId);
  }

  parseWidgetData(mat: any): any {
    if (!mat || !mat.description) return null;
    let raw = mat.description;
    while (typeof raw === 'string' && raw.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(raw);
        return parsed;
      } catch {
        break;
      }
    }
    return null;
  }

  stripHtml(html?: string): string {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }

  scrollToSection(elementId: string): void {
    const el = document.getElementById(elementId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  onExit(): void {
    this.exit.emit();
  }

  onEdit(): void {
    this.editCurriculum.emit();
  }
}
