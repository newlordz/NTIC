import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/** Minimal shape of the View Transitions API, safe across TypeScript DOM lib versions. */
interface ViewTransitionCapableDocument {
  startViewTransition?: (callback: () => void | Promise<void>) => { finished?: Promise<void> } | unknown;
}


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
      this.setTheme(isDark, false);
    }
  }

  toggleTheme(): void {
    this.setTheme(!this.darkModeSubject.value, true);
  }

  /**
   * Applies a theme.
   *
   * Previously this added an `is-theme-transitioning` class to <body> for 350ms,
   * which a global stylesheet rule used to put a 4-property transition on
   * `*`, `*::before` and `*::after`. On a large page that meant tens of thousands of
   * simultaneous property animations -- including `box-shadow`, which forces a blur
   * repaint every frame and cannot be composited -- plus two full-tree style
   * invalidations. That is what made switching feel laggy.
   *
   * Now the class swap happens in one shot inside a View Transition, so the browser
   * cross-fades a GPU snapshot of the old and new states: one composited animation
   * regardless of how many elements are on screen. Where the API is unavailable the
   * swap is instant, which is a single repaint and still smooth.
   */
  setTheme(isDark: boolean, animated: boolean = true): void {
    this.darkModeSubject.next(isDark);
    if (typeof window === 'undefined' || !document.body) return;

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    }

    const apply = () => {
      document.body.classList.toggle('dark-theme', isDark);
    };

    if (!animated || !this.canAnimate()) {
      apply();
      return;
    }

    const doc = document as unknown as ViewTransitionCapableDocument;
    if (typeof doc.startViewTransition === 'function') {
      try {
        // The callback runs between the two snapshots.
        doc.startViewTransition(apply);
      } catch {
        // A failed cross-fade must never leave the user on the wrong theme --
        // the appearance change matters, the animation does not.
        apply();
      }
    } else {
      apply();
    }
  }

  /** Honour an explicit request for reduced motion. */
  private canAnimate(): boolean {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  get isDarkMode(): boolean {
    return this.darkModeSubject.value;
  }
}
