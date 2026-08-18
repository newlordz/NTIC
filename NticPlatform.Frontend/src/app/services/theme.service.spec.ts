import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

/**
 * These lock down the fix for the laggy theme switch.
 *
 * The old implementation added an `is-theme-transitioning` class to <body> for
 * 350ms, which a global rule used to apply a 4-property transition to `*`,
 * `*::before` and `*::after`. On a large page that is tens of thousands of
 * simultaneous property animations -- including `box-shadow`, which forces a blur
 * repaint every frame -- plus two full-tree style invalidations.
 */
describe('ThemeService', () => {
  let service: ThemeService;
  let originalMatchMedia: typeof window.matchMedia;
  let originalStartViewTransition: any;

  /** Lets each test decide what the browser claims to support. */
  function stubEnvironment(opts: { reducedMotion?: boolean; viewTransitions?: boolean }) {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? !!opts.reducedMotion : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as any;

    // NOTE: in real Chrome `startViewTransition` lives on Document.prototype, so
    // `delete document.startViewTransition` does nothing and the genuine API takes
    // over -- and it runs its callback asynchronously, which breaks synchronous
    // assertions. Shadow it with an OWN property in both directions instead.
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      writable: true,
      value: opts.viewTransitions
        ? (cb: () => void) => { cb(); return { finished: Promise.resolve() }; }
        : undefined,
    });
  }

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    originalStartViewTransition = (document as any).startViewTransition;
    localStorage.removeItem('theme');
    document.body.classList.remove('dark-theme', 'is-theme-transitioning');
    stubEnvironment({});
    TestBed.configureTestingModule({ providers: [ThemeService] });
    service = TestBed.inject(ThemeService);
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    // Remove the own property so the native prototype implementation is visible
    // again for any other spec.
    delete (document as any).startViewTransition;
    if (originalStartViewTransition !== undefined &&
        Object.prototype.hasOwnProperty.call(document, 'startViewTransition')) {
      (document as any).startViewTransition = originalStartViewTransition;
    }
    localStorage.removeItem('theme');
    document.body.classList.remove('dark-theme', 'is-theme-transitioning');
  });

  it('starts in light mode when nothing is stored', () => {
    expect(service.isDarkMode).toBeFalse();
    expect(document.body.classList.contains('dark-theme')).toBeFalse();
  });

  it('applies dark mode', () => {
    service.setTheme(true);
    expect(service.isDarkMode).toBeTrue();
    expect(document.body.classList.contains('dark-theme')).toBeTrue();
  });

  it('toggles back to light', () => {
    service.setTheme(true);
    service.toggleTheme();
    expect(service.isDarkMode).toBeFalse();
    expect(document.body.classList.contains('dark-theme')).toBeFalse();
  });

  it('persists the choice', () => {
    service.setTheme(true);
    expect(localStorage.getItem('theme')).toBe('dark');
    service.setTheme(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('restores a stored dark preference on construction', () => {
    localStorage.setItem('theme', 'dark');
    const restored = new ThemeService();
    expect(restored.isDarkMode).toBeTrue();
    expect(document.body.classList.contains('dark-theme')).toBeTrue();
  });

  it('emits on isDarkMode$', () => {
    const seen: boolean[] = [];
    service.isDarkMode$.subscribe(v => seen.push(v));
    service.setTheme(true);
    service.setTheme(false);
    expect(seen).toEqual([false, true, false]);
  });

  // ── the actual performance fix ────────────────────────────────────────
  it('never adds the is-theme-transitioning class', () => {
    // That class was the hook for the `*` transition rule that caused the jank.
    service.setTheme(true);
    expect(document.body.classList.contains('is-theme-transitioning')).toBeFalse();
  });

  it('uses a View Transition when the browser supports it', () => {
    stubEnvironment({ viewTransitions: true });
    let called = false;
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true, writable: true,
      value: (cb: () => void) => { called = true; cb(); return { finished: Promise.resolve() }; },
    });
    service.setTheme(true);
    expect(called).toBeTrue();
    // The swap must still have happened.
    expect(document.body.classList.contains('dark-theme')).toBeTrue();
  });

  it('falls back to an instant swap without the API', () => {
    stubEnvironment({ viewTransitions: false });
    service.setTheme(true);
    expect(document.body.classList.contains('dark-theme')).toBeTrue();
  });

  it('skips the animation when reduced motion is requested', () => {
    stubEnvironment({ reducedMotion: true, viewTransitions: true });
    let called = false;
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true, writable: true,
      value: (cb: () => void) => { called = true; cb(); return { finished: Promise.resolve() }; },
    });
    service.setTheme(true);
    expect(called).toBeFalse();
    // Still applied, just not animated.
    expect(document.body.classList.contains('dark-theme')).toBeTrue();
  });

  it('does not animate the initial load', () => {
    // Restoring a stored preference should not cross-fade on first paint.
    stubEnvironment({ viewTransitions: true });
    let called = false;
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true, writable: true,
      value: (cb: () => void) => { called = true; cb(); return { finished: Promise.resolve() }; },
    });
    service.setTheme(true, false);
    expect(called).toBeFalse();
    expect(document.body.classList.contains('dark-theme')).toBeTrue();
  });

  it('applies the theme even if the API throws', () => {
    // A failed cross-fade must never leave the user on the wrong theme.
    stubEnvironment({ viewTransitions: true });
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true, writable: true,
      value: () => { throw new Error('unsupported'); },
    });
    expect(() => service.setTheme(true)).not.toThrow();
    expect(document.body.classList.contains('dark-theme')).toBeTrue();
  });
});
