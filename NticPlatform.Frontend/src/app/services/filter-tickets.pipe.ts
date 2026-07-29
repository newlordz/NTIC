import { Pipe, PipeTransform } from '@angular/core';
import { SupportTicket } from './chatbot.service';

@Pipe({ name: 'filterTickets', standalone: true, pure: false })
export class FilterTicketsPipe implements PipeTransform {
  transform(tickets: SupportTicket[], status: string): number {
    return tickets.filter(t => t.status === status).length;
  }
}
