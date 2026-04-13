import { Injectable, signal, effect, NgZone } from '@angular/core';
import { Socket, io } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket | null = null;
  public connected = signal(false);

  constructor(
    private authService: AuthService,
    private ngZone: NgZone
  ) {
    // Auto-connect when user logs in
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.connect();
      } else {
        this.disconnect();
      }
    });

    // PWA: Reconnect when app comes to foreground
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !this.socket?.connected && this.authService.currentUser()) {
        console.log('📱 App resumed, reconnecting socket...');
        this.connect();
      }
    });

    // PWA: Handle network changes
    window.addEventListener('online', () => {
      if (this.authService.currentUser()) {
        console.log('🌐 Network online, reconnecting socket...');
        this.connect();
      }
    });
  }

  connect(): void {
    if (this.socket?.connected) {
      return;
    }

    // Connect to root URL, not /api (Socket.IO server is on root)
    const socketUrl = environment.apiUrl.replace('/api', '');
    
    this.socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 10000
    });

    this.socket.on('connect', () => {
      this.ngZone.run(() => {
        this.connected.set(true);
        console.log('✅ Socket connected:', this.socket?.id);
        
        // Join rooms for specific updates
        this.socket?.emit('join-tables-room');
        console.log('🎯 Joining tables room');
        this.socket?.emit('join-bills-room');
        console.log('🎯 Joining bills room');
        this.socket?.emit('join-products-room');
        console.log('🎯 Joining products room');
      });
    });

    this.socket.on('disconnect', (reason) => {
      this.ngZone.run(() => {
        this.connected.set(false);
        
        // Auto-reconnect if not intentional disconnect
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

    // Listen for welcome message from server
    this.socket.on('connected', (data) => {
      this.ngZone.run(() => {
        console.log('📨 Received from server:', data);
      });
    });
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
        // Run callbacks inside Angular zone for proper change detection
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
