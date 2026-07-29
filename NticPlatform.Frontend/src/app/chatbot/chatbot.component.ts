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
  private shouldScrollToBottom = false;

  constructor(public chatbot: ChatbotService, private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    // If user just logged in and chat is open, ensure greeting is shown
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
    this.chatbot.toggleChat(name, role);
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
    await this.chatbot.sendMessage(text, role);
    this.shouldScrollToBottom = true;
    this.cdr.markForCheck();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.onSend();
    }
  }

  private scrollToBottom(): void {
    try {
      if (this.messagesContainer) {
        this.messagesContainer.nativeElement.scrollTop =
          this.messagesContainer.nativeElement.scrollHeight;
      }
    } catch (_) {}
  }

  get unreadCount(): number {
    return this.chatbot.isOpen() ? 0 : (this.chatbot.messages().length > 1 ? 1 : 0);
  }

  trackByIndex(index: number): number {
    return index;
  }
}
