import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'timeAgo', standalone: true })
export class TimeAgoPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    let valStr = String(value).trim();
    if (valStr.includes(' ') && !valStr.includes('T')) {
      valStr = valStr.replace(' ', 'T');
    }
    if (!valStr.endsWith('Z') && !valStr.includes('+') && !valStr.includes('-')) {
      valStr += 'Z';
    }
    const date = new Date(valStr);
    if (isNaN(date.getTime())) return value;

    const now = Date.now();
    const seconds = Math.floor((now - date.getTime()) / 1000);

    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${Math.max(1, seconds)}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
