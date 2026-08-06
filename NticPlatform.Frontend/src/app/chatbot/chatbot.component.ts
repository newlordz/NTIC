import { getAuthValue } from '../services/session.util';
import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  ChangeDetectionStrategy,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatbotService } from '../services/chatbot.service';

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chatbot.component.html',
  styleUrl: './chatbot.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatbotComponent implements OnChanges, AfterViewChecked {
  @Input() currentUser: { name: string; avatar: string; roleName: string; roleId: string } | null = null;
  @ViewChild('messagesContainer') messagesContainer!: ElementRef<HTMLDivElement>;

  userInput = '';
  ticketLookupInput = '';
  ticketEmailInput = '';
  accountLookupInput = '';
  private shouldScrollToBottom = false;

  // Draggable FAB state variables
  fabBottom = 92;
  private isDragging = false;
  private startY = 0;
  private startBottom = 92;
  private dragThreshold = 5;
  private hasMoved = false;

  private mouseMoveListener = (e: MouseEvent) => this.onDrag(e.clientY);
  private mouseUpListener = () => this.onDragEnd();

  private touchMoveListener = (e: TouchEvent) => {
    if (e.touches.length > 0) {
      this.onDrag(e.touches[0].clientY);
    }
  };
  private touchEndListener = () => this.onDragEnd();

  constructor(public chatbot: ChatbotService, private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currentUser'] && this.currentUser && this.chatbot.isOpen()) {
      this.cdr.markForCheck();
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  onMouseDown(event: MouseEvent): void {
    event.preventDefault();
    this.startDrag(event.clientY);
    document.addEventListener('mousemove', this.mouseMoveListener);
    document.addEventListener('mouseup', this.mouseUpListener);
  }

  onTouchStart(event: TouchEvent): void {
    if (event.touches.length > 0) {
      this.startDrag(event.touches[0].clientY);
      document.addEventListener('touchmove', this.touchMoveListener, { passive: true });
      document.addEventListener('touchend', this.touchEndListener);
    }
  }

  private startDrag(clientY: number): void {
    this.isDragging = true;
    this.hasMoved = false;
    this.startY = clientY;
    this.startBottom = this.fabBottom;
  }

  get panelBottom(): number {
    const viewportHeight = window.innerHeight;
    const panelHeight = 520;
    
    // Default position (above FAB)
    let bottom = this.fabBottom + 64;
    
    // If the panel would go off the top of the screen
    if (bottom + panelHeight > viewportHeight - 20) {
      // If the FAB is in the upper half, place the panel below the FAB
      if (this.fabBottom > (viewportHeight / 2)) {
        bottom = this.fabBottom - panelHeight - 8;
      } else {
        // Otherwise, just cap the panel at the top of the viewport
        bottom = viewportHeight - panelHeight - 20;
      }
    }
    
    // Ensure the panel does not go off the bottom of the screen
    if (bottom < 20) {
      bottom = 20;
    }
    
    return bottom;
  }

  private onDrag(clientY: number): void {
    if (!this.isDragging) return;
    const deltaY = this.startY - clientY;
    if (Math.abs(deltaY) > this.dragThreshold) {
      this.hasMoved = true;
    }
    let newBottom = this.startBottom + deltaY;

    // Boundary check to keep FAB on screen
    const minBottom = 20;
    const maxBottom = window.innerHeight - 100;
    if (newBottom < minBottom) newBottom = minBottom;
    if (newBottom > maxBottom) newBottom = maxBottom;

    this.fabBottom = newBottom;
    this.cdr.detectChanges();
  }

  private onDragEnd(): void {
    this.isDragging = false;
    document.removeEventListener('mousemove', this.mouseMoveListener);
    document.removeEventListener('mouseup', this.mouseUpListener);
    document.removeEventListener('touchmove', this.touchMoveListener);
    document.removeEventListener('touchend', this.touchEndListener);
  }

  onFabClick(event: Event): void {
    if (this.hasMoved) {
      event.preventDefault();
      event.stopPropagation();
      this.hasMoved = false;
      return;
    }
    this.toggleChat();
  }

  toggleChat(): void {
    const name = this.currentUser?.name || 'there';
    const role = this.currentUser?.roleId || 'student';
    const userId = this.getUserId();
    const email = this.getUserEmail();
    this.chatbot.toggleChat(name, role, userId, email);
    if (this.chatbot.isOpen()) {
      this.shouldScrollToBottom = true;
    }
    this.cdr.markForCheck();
  }

  closeChat(): void {
    this.chatbot.closeChat();
    this.cdr.markForCheck();
  }


  clearHistory(): void {
    const name = this.currentUser?.name || 'there';
    const role = this.currentUser?.roleId || 'student';
    this.chatbot.clearHistory(name, role);
    this.cdr.markForCheck();
  }

  async onSend(): Promise<void> {
    if (!this.userInput.trim() || this.chatbot.isLoading()) return;
    const text = this.userInput;
    this.userInput = '';
    const role = this.currentUser?.roleId || 'student';
    
    // Scroll down immediately to show the user's message and the typing indicator
    this.shouldScrollToBottom = true;
    this.cdr.markForCheck();

    await this.chatbot.sendMessage(text, role);
    
    // When the AI finishes, we ONLY mark for check.
    // We intentionally DO NOT scroll to bottom here, so the view stays
    // anchored at the top of the AI's newly generated message.
    this.cdr.markForCheck();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.onSend();
    }
  }

  acceptTicket(): void {
    this.chatbot.acceptTicketCreation();
    this.cdr.markForCheck();
  }

  rejectTicket(): void {
    this.chatbot.rejectTicketCreation();
    this.cdr.markForCheck();
  }

  lookupTicket(): void {
    if (!this.ticketLookupInput.trim()) return;
    this.chatbot.checkTicketById(this.ticketLookupInput);
    this.cdr.markForCheck();
  }

  submitEmail(): void {
    if (!this.ticketEmailInput.trim()) return;
    this.chatbot.createTicket(this.ticketEmailInput.trim());
    this.ticketEmailInput = '';
    this.cdr.markForCheck();
  }

  lookupAccount(): void {
    if (!this.accountLookupInput.trim()) return;
    this.chatbot.lookupAccount(this.accountLookupInput);
    this.accountLookupInput = '';
    this.cdr.markForCheck();
  }

  private scrollToBottom(): void {
    try {
      if (this.messagesContainer) {
        this.messagesContainer.nativeElement.scrollTop =
          this.messagesContainer.nativeElement.scrollHeight;
      }
    } catch (_) {}
  }

  private getUserId(): string {
    return getAuthValue('activeUserEmail') || '';
  }

  private getUserEmail(): string {
    return getAuthValue('activeUserEmail') || '';
  }

  get unreadCount(): number {
    return this.chatbot.isOpen() ? 0 : (this.chatbot.messages().length > 1 ? 1 : 0);
  }

  trackByIndex(index: number): number {
    return index;
  }

  formatMessage(text: string): string {
    if (!text) return '';
    return text.replace(/\*\*/g, '').replace(/\*/g, '-');
  }
}
