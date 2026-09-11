import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimeAgoPipe } from '../../../services/time-ago.pipe';

@Component({
  selector: 'app-audit-inspector-modal',
  standalone: true,
  imports: [CommonModule, TimeAgoPipe],
  templateUrl: './audit-inspector-modal.component.html',
  styleUrl: './audit-inspector-modal.component.scss',
})
export class AuditInspectorModalComponent implements OnChanges {
  @Input() log: any = null;
  @Input() forensics: any = null;

  @Output() close = new EventEmitter<void>();
  @Output() copyText = new EventEmitter<{ text: string; label: string }>();

  activeTab: 'changes' | 'machine' | 'timeline' | 'payload' = 'changes';
  showRawJson = false;
  isMaximized = false;

  toggleMaximize(): void {
    this.isMaximized = !this.isMaximized;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['log'] && changes['log'].currentValue) {
      this.activeTab = 'changes';
      this.showRawJson = false;
    }
  }

  setTab(tab: 'changes' | 'machine' | 'timeline' | 'payload'): void {
    this.activeTab = tab;
  }

  onClose(): void {
    this.close.emit();
  }

  onCopy(text: string, label: string = 'Copied'): void {
    this.copyText.emit({ text, label });
  }

  copyJson(): void {
    if (!this.log) return;
    this.onCopy(JSON.stringify(this.log, null, 2), 'JSON Payload');
  }
}
