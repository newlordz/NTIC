import { Component, Input, Output, EventEmitter, forwardRef, ElementRef, HostListener, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SelectOption {
  value: any;
  label: string;
  sublabel?: string;
  icon?: string;
  disabled?: boolean;
}

@Component({
  selector: 'app-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app-select.component.html',
  styleUrl: './app-select.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AppSelectComponent),
      multi: true
    }
  ]
})
export class AppSelectComponent implements ControlValueAccessor {
  @Input() placeholder: string = 'Select an option...';
  @Input() disabled: boolean = false;
  @Input() searchable: boolean = false;
  @Input() name: string = '';
  @Input() customClass: string = '';

  private _rawOptions: any[] = [];
  normalizedOptions: SelectOption[] = [];
  filteredOptions: SelectOption[] = [];

  @Input()
  set options(value: any[]) {
    this._rawOptions = value || [];
    this.normalizeOptions();
    this.filterOptions();
  }
  get options(): any[] {
    return this._rawOptions;
  }

  @Output() selectionChange = new EventEmitter<any>();

  isOpen: boolean = false;
  searchQuery: string = '';
  selectedValue: any = null;
  focusedIndex: number = -1;

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('triggerButton') triggerButton?: ElementRef<HTMLButtonElement>;

  onChange: (value: any) => void = () => {};
  onTouched: () => void = () => {};

  constructor(private elementRef: ElementRef) {}

  private normalizeOptions(): void {
    this.normalizedOptions = this._rawOptions.map(opt => {
      if (typeof opt === 'string' || typeof opt === 'number') {
        return { value: opt, label: String(opt) };
      }
      return {
        value: opt.value !== undefined ? opt.value : opt.id !== undefined ? opt.id : opt.name || opt.label,
        label: opt.label || opt.name || String(opt.value || opt),
        sublabel: opt.sublabel || opt.description,
        icon: opt.icon,
        disabled: !!opt.disabled
      };
    });
  }

  filterOptions(): void {
    if (!this.searchQuery.trim()) {
      this.filteredOptions = [...this.normalizedOptions];
    } else {
      const q = this.searchQuery.toLowerCase().trim();
      this.filteredOptions = this.normalizedOptions.filter(opt =>
        opt.label.toLowerCase().includes(q) || (opt.sublabel && opt.sublabel.toLowerCase().includes(q))
      );
    }
    this.focusedIndex = -1;
  }

  get selectedOption(): SelectOption | undefined {
    return this.normalizedOptions.find(opt => String(opt.value) === String(this.selectedValue));
  }

  get displayLabel(): string {
    const found = this.selectedOption;
    if (found) return found.label;
    if (this.selectedValue !== null && this.selectedValue !== undefined && this.selectedValue !== '' && this.selectedValue !== 'all') {
      return String(this.selectedValue);
    }
    return this.placeholder;
  }

  get isPlaceholder(): boolean {
    return !this.selectedOption && (this.selectedValue === null || this.selectedValue === undefined || this.selectedValue === '');
  }

  toggleDropdown(event?: Event): void {
    if (this.disabled) return;
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (this.isOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  openDropdown(): void {
    if (this.disabled) return;
    this.isOpen = true;
    this.searchQuery = '';
    this.filterOptions();

    const selectedIdx = this.filteredOptions.findIndex(opt => opt.value === this.selectedValue);
    this.focusedIndex = selectedIdx >= 0 ? selectedIdx : 0;

    setTimeout(() => {
      const container = this.elementRef.nativeElement.querySelector('.select-options-list');
      if (container) {
        container.scrollTop = 0;
      }
      if (this.shouldShowSearch() && this.searchInput) {
        this.searchInput.nativeElement.focus({ preventScroll: true });
      }
    }, 20);
  }

  closeDropdown(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.searchQuery = '';
    this.onTouched();
    if (this.triggerButton) {
      this.triggerButton.nativeElement.focus();
    }
  }

  selectOption(opt: SelectOption, event?: Event): void {
    if (opt.disabled) return;
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    this.selectedValue = opt.value;
    this.onChange(this.selectedValue);
    this.selectionChange.emit(this.selectedValue);
    this.closeDropdown();
  }

  shouldShowSearch(): boolean {
    return this.searchable || this.normalizedOptions.length > 7;
  }

  onKeyDown(event: KeyboardEvent): void {
    if (this.disabled) return;

    if (!this.isOpen) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.openDropdown();
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (this.focusedIndex < this.filteredOptions.length - 1) {
          this.focusedIndex++;
          this.scrollToFocused();
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (this.focusedIndex > 0) {
          this.focusedIndex--;
          this.scrollToFocused();
        }
        break;
      case 'Enter':
        event.preventDefault();
        if (this.focusedIndex >= 0 && this.focusedIndex < this.filteredOptions.length) {
          this.selectOption(this.filteredOptions[this.focusedIndex]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        this.closeDropdown();
        break;
      case 'Tab':
        this.closeDropdown();
        break;
    }
  }

  private scrollToFocused(): void {
    setTimeout(() => {
      const container = this.elementRef.nativeElement.querySelector('.select-options-list');
      const focusedItem = this.elementRef.nativeElement.querySelector('.select-option-item.focused');
      if (container && focusedItem) {
        const cTop = container.scrollTop;
        const cBottom = cTop + container.clientHeight;
        const eTop = focusedItem.offsetTop;
        const eBottom = eTop + focusedItem.clientHeight;

        if (eTop < cTop) {
          container.scrollTop = eTop;
        } else if (eBottom > cBottom) {
          container.scrollTop = eBottom - container.clientHeight;
        }
      }
    }, 10);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.isOpen && !this.elementRef.nativeElement.contains(event.target)) {
      this.closeDropdown();
    }
  }

  // ControlValueAccessor methods
  writeValue(value: any): void {
    this.selectedValue = value;
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    if (isDisabled && this.isOpen) {
      this.closeDropdown();
    }
  }
}
