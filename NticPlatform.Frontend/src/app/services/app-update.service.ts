import { Injectable, ApplicationRef, inject } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { concat, filter, first, interval } from 'rxjs';
import { DialogService } from './dialog.service';

/**
 * Keeps the installed PWA up to date.
 *
 * Previously nothing in the app ever touched SwUpdate: no check, no prompt, no
 * activation. Combined with the service worker script being served with a
 * one-year immutable Cache-Control header, an installed user could stay on an
 * old bundle indefinitely while the API moved on underneath them.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  /**
   * Optional on purpose. SwUpdate is only provided when the service worker is
   * registered, which excludes unit tests and any build with the PWA disabled.
   * Injecting it non-optionally made every component that depends on this
   * service fail to construct with "No provider for SwUpdate".
   */
  private readonly swUpdate = inject(SwUpdate, { optional: true });
  private readonly appRef = inject(ApplicationRef);
  private readonly dialogs = inject(DialogService);

  /** How often to poll for a new deployment once the app has settled. */
  private readonly checkIntervalMs = 6 * 60 * 60 * 1000; // 6 hours

  init(): void {
    const swUpdate = this.swUpdate;
    if (!swUpdate?.isEnabled) {
      // Development, tests, or a browser without service-worker support.
      return;
    }

    // Offer the update as soon as the new version is downloaded and ready.
    swUpdate.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => this.promptForReload());

    // If the worker ends up in a broken state, a reload is the only recovery.
    swUpdate.unrecoverable.subscribe(event => {
      console.error('[AppUpdate] Service worker is unrecoverable:', event.reason);
      this.dialogs.toast('The app needs to reload to recover. Reloading...', 'error');
      setTimeout(() => document.location.reload(), 2500);
    });

    // Wait until the app is stable before polling, so update checks never
    // compete with the initial render.
    const appIsStable$ = this.appRef.isStable.pipe(first(stable => stable === true));
    concat(appIsStable$, interval(this.checkIntervalMs)).subscribe(() => {
      swUpdate.checkForUpdate().catch(err =>
        console.warn('[AppUpdate] Update check failed:', err)
      );
    });
  }

  private async promptForReload(): Promise<void> {
    const accepted = await this.dialogs.confirm({
      title: 'Update available',
      message: 'A new version of the NTIC platform is ready. Reload now to use it?',
      confirmText: 'Reload',
      cancelText: 'Later',
      type: 'info',
    });
    if (!accepted) return;

    try {
      await this.swUpdate?.activateUpdate();
      document.location.reload();
    } catch (err) {
      console.error('[AppUpdate] Could not activate the update:', err);
      document.location.reload();
    }
  }
}
