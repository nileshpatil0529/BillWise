import { Injectable, signal, effect, PLATFORM_ID, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environment';
import { Settings, ApplicationTypes, Currency, ThemeType, ApplicationType, ScannerType } from '../models/settings.model';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly API_URL = `${environment.apiUrl}/settings`;
  private readonly SETTINGS_KEY = 'biller_settings';

  // Signals
  settings = signal<Settings>({
    businessName: 'My Business',
    logo: '',
    address: '',
    phone: '',
    email: '',
    taxNumber: '',
    currency: '₹',
    currencyCode: 'INR',
    applicationType: 'general',
    theme: 'dark',
    scannerType: 'none',
    taxEnabled: true,
    taxRates: [],
    categories: [{ name: 'General', enabled: true }],
    discountEnabled: true,
    debtEnabled: false,
    invoicePrefix: 'INV',
    invoiceStartNumber: 1,
    footerText: 'Thank you for your business!',
    lowStockAlertEnabled: true,
    lowStockThreshold: 10,
    updatedAt: ''
  });

  currentTheme = signal<ThemeType>('dark');
  applicationTypes = signal<ApplicationTypes>({});
  currencies = signal<Currency[]>([]);

  private isBrowser: boolean;

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    this.loadStoredSettings();
    
    // Effect to update theme
    effect(() => {
      const theme = this.currentTheme();
      if (this.isBrowser) {
        document.body.classList.remove('light-theme', 'dark-theme');
        document.body.classList.add(`${theme}-theme`);
        localStorage.setItem('biller_theme', theme);
      }
    });
  }

  private loadStoredSettings(): void {
    if (this.isBrowser) {
      const storedTheme = localStorage.getItem('biller_theme') as ThemeType;
      if (storedTheme) {
        this.currentTheme.set(storedTheme);
      }

      const storedSettings = localStorage.getItem(this.SETTINGS_KEY);
      if (storedSettings) {
        try {
          const settings = JSON.parse(storedSettings) as Settings;
          this.settings.set(settings);
          this.currentTheme.set(settings.theme);
        } catch {}
      }
    }
  }

  getSettings(): Observable<any> {
    return this.http.get(`${this.API_URL}`)
      .pipe(
        tap((response: any) => {
          if (response.success) {
            this.settings.set(response.data);
            this.currentTheme.set(response.data.theme);
            if (this.isBrowser) {
              localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(response.data));
            }
          }
        })
      );
  }

  updateSettings(settings: Partial<Settings>): Observable<any> {
    return this.http.put(this.API_URL, settings)
      .pipe(
        tap((response: any) => {
          if (response.success) {
            this.settings.set(response.data);
            if (settings.theme) {
              this.currentTheme.set(settings.theme);
            }
            if (this.isBrowser) {
              localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(response.data));
            }
          }
        })
      );
  }

  getApplicationTypes(): Observable<any> {
    return this.http.get(`${this.API_URL}/application-types`)
      .pipe(
        tap((response: any) => {
          if (response.success) {
            this.applicationTypes.set(response.data);
          }
        })
      );
  }

  getCurrencies(): Observable<any> {
    return this.http.get(`${this.API_URL}/currencies`)
      .pipe(
        tap((response: any) => {
          if (response.success) {
            this.currencies.set(response.data);
          }
        })
      );
  }

  uploadLogo(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('logo', file);
    return this.http.post(`${this.API_URL}/logo`, formData);
  }

  toggleTheme(): void {
    const newTheme = this.currentTheme() === 'light' ? 'dark' : 'light';
    this.currentTheme.set(newTheme);
    this.updateSettings({ theme: newTheme }).subscribe();
  }

  setApplicationType(type: ApplicationType): void {
    this.updateSettings({ applicationType: type }).subscribe();
  }

  formatCurrency(amount: number): string {
    const settings = this.settings();
    return `${settings.currency}${amount.toFixed(2)}`;
  }
}
