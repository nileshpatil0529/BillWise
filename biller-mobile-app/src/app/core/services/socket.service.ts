import { Injectable, signal, effect, NgZone, inject } from '@angular/core';
import { Socket, io } from 'socket.io-client';
import { MatSnackBar } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { PrinterService } from './printer.service';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket | null = null;
  public connected = signal(false);
  private snackBar = inject(MatSnackBar);
  private printerConfigLoadAttempted = false;
  private printerRuntimeInitInFlight: Promise<void> | null = null;

  // Lazily injected to avoid circular dependency (PrinterService → SocketService → PrinterService)
  private get printerService(): PrinterService {
    return this._printerService;
  }

  constructor(
    private authService: AuthService,
    private ngZone: NgZone,
    private _printerService: PrinterService
  ) {
    // Auto-connect when user logs in
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        void this.ensurePrinterRuntimeReady();
        this.connect();
      } else {
        this.disconnect();
      }
    });

    // PWA: Reconnect when app comes to foreground
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !this.socket?.connected && this.authService.currentUser()) {
        this.connect();
      }
    });

    // PWA: Handle network changes
    window.addEventListener('online', () => {
      if (this.authService.currentUser()) {
        this.connect();
      }
    });
  }

  connect(): void {
    if (this.socket?.connected) {
      return;
    }

    // Clean up any stale disconnected socket before creating a new one
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    const socketUrl = environment.apiUrl.replace('/api', '');

    this.socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: Infinity, // never give up — prevents permanent print failure
      timeout: 20000
    });

    this.socket.on('connect', () => {
      this.ngZone.run(() => {
        this.connected.set(true);
        this.socket?.emit('join-tables-room');
        this.socket?.emit('join-bills-room');
        this.socket?.emit('join-products-room');

        // Identify this user so server can route targeted events
        const user = this.authService.currentUser();
        if (user?.uid) {
          this.socket?.emit('identify', { userId: user.uid });
        }

        // Ensure config + agent are available, then refresh server printer mapping.
        void this.ensurePrinterRuntimeReady();
      });
    });

    this.socket.on('disconnect', (reason) => {
      this.ngZone.run(() => {
        this.connected.set(false);
        if (reason === 'io server disconnect') {
          this.socket?.connect();
        }
      });
    });

    this.socket.on('connect_error', (error) => {
      this.ngZone.run(() => {
        this.connected.set(false);
        console.error('❌ Socket connection error:', error);
      });
    });

    // Safety net: if socket.io ever stops retrying (shouldn't happen with Infinity), force a fresh connection
    this.socket.on('reconnect_failed', () => {
      this.ngZone.run(() => {
        console.warn('⚠️ Socket reconnect_failed — forcing fresh connection in 5s');
        setTimeout(() => this.connect(), 5000);
      });
    });

    this.socket.on('connected', (data) => {
      this.ngZone.run(() => console.log('📨 Received from server:', data));
    });

    // Routed print job arrives — execute print locally via the print agent
    this.socket.on('print-job', async (payload: any) => {
      const { requestId, bill, settings, type } = payload;
      try {
        await this.ensurePrinterRuntimeReady();
        if (!this.printerService.isReady()) {
          throw new Error('Local printer not ready');
        }
        if (type === 'kot') {
          await this.printerService.printKOT(bill, settings);
        } else {
          await this.printerService.printReceipt(bill, settings);
        }
        this.socket?.emit('print-job-result', { requestId, success: true, type });
      } catch (err: any) {
        this.socket?.emit('print-job-result', { requestId, success: false, error: err?.message, type });
        this.ngZone.run(() =>
          this.snackBar.open('Print failed: ' + (err?.message || 'Unknown error'), 'OK', { duration: 5000 })
        );
      }
    });

    // Result of a print request we initiated via server routing
    this.socket.on('print-response', ({ success, error, type }: any) => {
      this.ngZone.run(() => {
        if (!success) {
          this.snackBar.open('Print failed: ' + (error || 'Unknown error'), 'OK', { duration: 5000 });
        }
      });
    });
  }

  private async ensurePrinterRuntimeReady(): Promise<void> {
    if (this.printerRuntimeInitInFlight) {
      await this.printerRuntimeInitInFlight;
      return;
    }

    this.printerRuntimeInitInFlight = (async () => {
      if (!this.printerConfigLoadAttempted) {
        this.printerConfigLoadAttempted = true;
        await new Promise<void>((resolve) => {
          this.printerService.loadConfig().subscribe({
            next: () => resolve(),
            error: (err) => {
              console.warn('Printer config load failed:', err);
              resolve();
            }
          });
        });
      }

      const cfg = this.printerService.config();
      if (cfg.enabled && cfg.printerName && this.printerService.agentStatus() !== 'connected') {
        try {
          await this.printerService.connectAgent();
        } catch (err) {
          console.warn('Auto-connect to print agent failed:', err);
        }
      }

      this.refreshPrinterRegistration();
    })();

    try {
      await this.printerRuntimeInitInFlight;
    } finally {
      this.printerRuntimeInitInFlight = null;
    }
  }

  /** Call after saving printer config to update server registration */
  refreshPrinterRegistration(): void {
    const user = this.authService.currentUser();
    if (!user?.uid || !this.socket?.connected) return;
    const cfg = this.printerService.config();
    if (cfg.enabled && cfg.printerName) {
      this.socket.emit('register-printer', { userId: user.uid });
    } else {
      this.socket.emit('unregister-printer', { userId: user.uid });
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected.set(false);
    }
  }

  on(event: string, callback: (...args: any[]) => void): void {
    if (this.socket) {
      this.socket.on(event, (...args) => {
        this.ngZone.run(() => callback(...args));
      });
    }
  }

  off(event: string, callback?: (...args: any[]) => void): void {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  emit(event: string, data?: any): void {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  once(event: string, callback: (...args: any[]) => void): void {
    if (this.socket) {
      this.socket.once(event, (...args) => {
        this.ngZone.run(() => callback(...args));
      });
    }
  }
}
