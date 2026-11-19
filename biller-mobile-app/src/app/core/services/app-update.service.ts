import { Injectable, inject } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { MatSnackBar } from '@angular/material/snack-bar';
import { filter } from 'rxjs/operators';

/**
 * Keeps an already-installed PWA instance in sync with whatever is deployed
 * on the server, without requiring the user to manually reinstall or trigger
 * an update check.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly snackBar = inject(MatSnackBar);

  initialize(): void {
    if (!this.swUpdate.isEnabled) {
      return;
    }

    // As soon as a newly deployed version finishes downloading in the
    // background, activate it and reload so the running app picks it up.
    this.swUpdate.versionUpdates
      .pipe(filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'))
      .subscribe(() => {
        // No duration/action: the reload below replaces the whole page,
        // which dismisses this snackbar automatically once updated.
        this.snackBar.open('New update available. Updating app...', '', {
          duration: 0,
          panelClass: ['update-snackbar'],
          verticalPosition: 'top',
          horizontalPosition: 'center'
        });

        this.swUpdate.activateUpdate().then(() => document.location.reload());
      });

    // The service worker only checks for updates on its own schedule/navigation.
    // Re-check whenever the app regains focus/visibility (e.g. an installed
    // desktop/mobile PWA window being reopened or switched back to) so a
    // deploy is detected promptly even if the app was left open in the background.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.swUpdate.checkForUpdate();
      }
    });
    window.addEventListener('focus', () => this.swUpdate.checkForUpdate());

    // If the service worker enters a broken state, reload to force a clean
    // re-registration instead of leaving the user stuck on a stale app.
    this.swUpdate.unrecoverable.subscribe(() => document.location.reload());
  }
}
