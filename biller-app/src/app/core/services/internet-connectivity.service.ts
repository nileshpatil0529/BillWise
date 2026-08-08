import { Injectable, OnDestroy, inject, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class InternetConnectivityService implements OnDestroy {
  enabled = signal(true);
  isOffline = signal(false);
  checking = signal(false);
  offlineReason = signal('');

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onlineListener: (() => void) | null = null;
  private offlineListener: (() => void) | null = null;
  private visibilityListener: (() => void) | null = null;
  private monitorStarted = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.isOffline.set(!navigator.onLine);
      if (this.enabled()) {
        this.startWatch();
        void this.recheckNow();
      }
    }
  }

  initialize(isEnabled: boolean): void {
    this.setEnabled(isEnabled);
  }

  setEnabled(isEnabled: boolean): void {
    const wasEnabled = this.enabled();
    this.enabled.set(isEnabled);

    if (wasEnabled === isEnabled) {
      if (isEnabled && !this.monitorStarted) {
        this.startWatch();
        void this.recheckNow();
      }
      return;
    }

    if (!isEnabled) {
      this.stopWatch();
      this.isOffline.set(false);
      this.offlineReason.set('');
      return;
    }

    if (typeof window !== 'undefined' && !navigator.onLine) {
      this.isOffline.set(true);
      this.offlineReason.set('browser-offline');
    }

    this.startWatch();
    void this.recheckNow();
  }

  async recheckNow(): Promise<void> {
    if (!this.enabled() || this.checking()) {
      return;
    }

    this.checking.set(true);
    try {
      const hasInternet = await this.checkInternetAccess();
      this.isOffline.set(!hasInternet);
      if (hasInternet) {
        this.offlineReason.set('');
      } else if (!navigator.onLine) {
        this.offlineReason.set('browser-offline');
      } else {
        this.offlineReason.set('health-check-failed');
      }
    } catch {
      this.isOffline.set(true);
      this.offlineReason.set('health-check-failed');
    } finally {
      this.checking.set(false);
    }
  }

  private startWatch(): void {
    if (typeof window === 'undefined') {
      return;
    }

    if (this.monitorStarted) {
      return;
    }

    this.stopWatch();

    this.onlineListener = () => {
      void this.recheckNow();
    };
    this.offlineListener = () => {
      this.isOffline.set(true);
      this.offlineReason.set('browser-offline');
    };
    this.visibilityListener = () => {
      if (document.visibilityState === 'visible') {
        void this.recheckNow();
      }
    };

    window.addEventListener('online', this.onlineListener);
    window.addEventListener('offline', this.offlineListener);
    document.addEventListener('visibilitychange', this.visibilityListener);

    this.intervalId = setInterval(() => {
      void this.recheckNow();
    }, 5000);

    this.monitorStarted = true;
  }

  private stopWatch(): void {
    if (typeof window !== 'undefined') {
      if (this.onlineListener) {
        window.removeEventListener('online', this.onlineListener);
      }
      if (this.offlineListener) {
        window.removeEventListener('offline', this.offlineListener);
      }
      if (this.visibilityListener) {
        document.removeEventListener('visibilitychange', this.visibilityListener);
      }
    }

    this.onlineListener = null;
    this.offlineListener = null;
    this.visibilityListener = null;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.monitorStarted = false;
  }

  private async checkInternetAccess(): Promise<boolean> {
    if (typeof window === 'undefined') {
      return true;
    }

    if (!navigator.onLine) {
      return false;
    }

    const urls = [
      'https://www.gstatic.com/generate_204',
      'https://1.1.1.1/cdn-cgi/trace'
    ];

    for (const url of urls) {
      const reachable = await this.tryFetchWithTimeout(url, 4000);
      if (reachable) {
        return true;
      }
    }

    return false;
  }

  private async tryFetchWithTimeout(url: string, timeoutMs: number): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      await fetch(`${url}?_=${Date.now()}`, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal
      });
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  ngOnDestroy(): void {
    this.stopWatch();
  }
}
