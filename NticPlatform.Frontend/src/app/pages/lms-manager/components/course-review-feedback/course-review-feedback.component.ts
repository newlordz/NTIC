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
    return this.course?.rejectionReason || this.course?.rejection_reason || 'No specific text comments provided by the reviewer.';
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
