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
  private shouldScrollToBottom = false;

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
