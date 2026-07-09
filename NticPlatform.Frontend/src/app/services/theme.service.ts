import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private darkModeSubject = new BehaviorSubject<boolean>(false);
  isDarkMode$ = this.darkModeSubject.asObservable();

  constructor() {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('theme');
      const isDark = stored === 'dark';
      this.setTheme(isDark);
    }
  }

  toggleTheme(): void {
    this.setTheme(!this.darkModeSubject.value);
  }

  setTheme(isDark: boolean): void {
    this.darkModeSubject.next(isDark);
    if (typeof window !== 'undefined') {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
      }
      if (isDark) {
        document.body.classList.add('dark-theme');
      } else {
        document.body.classList.remove('dark-theme');
      }
    }
  }

  get isDarkMode(): boolean {
    return this.darkModeSubject.value;
  }
}
