import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User, LoginRequest, LoginResponse, AuthState } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly API_URL = environment.apiUrl;
  private readonly TOKEN_KEY = 'biller_token';
  private readonly USER_KEY = 'biller_user';

  // Signals for reactive state
  private authState = signal<AuthState>({
    isAuthenticated: false,
    user: null,
    token: null
  });

  // Computed values
  isAuthenticated = computed(() => this.authState().isAuthenticated);
  currentUser = computed(() => this.authState().user);
  token = computed(() => this.authState().token);

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    this.loadStoredAuth();
  }

  private loadStoredAuth(): void {
    const token = localStorage.getItem(this.TOKEN_KEY);
    const userStr = localStorage.getItem(this.USER_KEY);

    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as User;
        this.authState.set({
          isAuthenticated: true,
          user,
          token
        });
      } catch {
        this.clearAuth();
      }
    }
  }

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.API_URL}/auth/login`, credentials)
      .pipe(
        tap(response => {
          if (response.success && response.data) {
            this.setAuth(response.data.token, response.data.user);
          }
        }),
        catchError(error => {
          console.error('Login error:', error);
          return of({
            success: false,
            message: error.error?.message || 'Login failed'
          });
        })
      );
  }

  logout(): void {
    this.http.post(`${this.API_URL}/auth/logout`, {}).subscribe({
      complete: () => {
        this.clearAuth();
        this.router.navigate(['/login']);
      },
      error: () => {
        // Even if logout API fails, clear local auth
        this.clearAuth();
        this.router.navigate(['/login']);
      }
    });
  }

  // Logout without making API call (used for token expiration)
  logoutLocal(): void {
    this.clearAuth();
    this.router.navigate(['/login']);
  }

  private setAuth(token: string, user: User): void {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    
    this.authState.set({
      isAuthenticated: true,
      user,
      token
    });
  }

  private clearAuth(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    
    this.authState.set({
      isAuthenticated: false,
      user: null,
      token: null
    });
  }

  getToken(): string | null {
    return this.authState().token;
  }

  changePassword(currentPassword: string, newPassword: string): Observable<any> {
    return this.http.put(`${this.API_URL}/auth/password`, {
      currentPassword,
      newPassword
    });
  }

  isAdmin(): boolean {
    return this.authState().user?.role === 'admin';
  }

  hasRole(roles: string[]): boolean {
    const userRole = this.authState().user?.role;
    return userRole ? roles.includes(userRole) : false;
  }
}
