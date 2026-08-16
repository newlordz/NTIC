import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private darkModeSubject = new BehaviorSubject<boolean>(false);
  isDarkMode$ = this.darkModeSubject.asObservable();
  private transitionTimeout: any = null;

  constructor() {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('theme');
      const isDark = stored === 'dark';
      this.setTheme(isDark, false);
    }
  }

  toggleTheme(): void {
    this.setTheme(!this.darkModeSubject.value, true);
  }

  setTheme(isDark: boolean, animated: boolean = true): void {
    this.darkModeSubject.next(isDark);
    if (typeof window !== 'undefined') {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
      }

      if (animated && document.body) {
        document.body.classList.add('is-theme-transitioning');
        if (this.transitionTimeout) {
          clearTimeout(this.transitionTimeout);
        }
        this.transitionTimeout = setTimeout(() => {
          document.body.classList.remove('is-theme-transitioning');
        }, 350);
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
