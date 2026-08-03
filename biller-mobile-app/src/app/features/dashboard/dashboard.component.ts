import { Component, signal, computed, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { AuthService } from '../../core/services/auth.service';
import { SettingsService } from '../../core/services/settings.service';
import { TranslateService } from '../../core/services/translate.service';

interface MenuItem {
  icon: string;
  label: string;
  route: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    RouterOutlet,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatDividerModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  translateService = inject(TranslateService);

  menuItems = computed(() => {
    const user = this.authService.currentUser();
    const permissions = user?.permissions || [];
    const t = this.translateService.t.bind(this.translateService);
    
    // Force recomputation when language changes
    const _ = this.translateService.translations();
    
    // Admin gets all permissions by default
    const hasPermission = (permission: string) => {
      return user?.role === 'admin' || permissions.includes(permission);
    };
    
    // Filter menu items based on user permissions
    let items: MenuItem[] = [];
    
    if (hasPermission('dashboard')) {
      items.push({ icon: 'home', label: t('nav.home'), route: '/dashboard/home' });
    }
    
    if (hasPermission('bills')) {
      items.push({ icon: 'receipt_long', label: t('nav.bills'), route: '/dashboard/bills' });
    }
    
    if (hasPermission('products')) {
      items.push({ icon: 'inventory_2', label: t('nav.products'), route: '/dashboard/products' });
    }
    
    if (hasPermission('customers') && this.settingsService.settings().debtEnabled) {
      items.push({ icon: 'account_balance_wallet', label: t('nav.customers'), route: '/dashboard/customers' });
    }
    
    // Manage Users - Admin only
    if (user?.role === 'admin') {
      items.push({ icon: 'group', label: t('nav.users'), route: '/dashboard/users' });
    }
    
    return items;
  });

  constructor(
    public authService: AuthService,
    public settingsService: SettingsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Load settings
    this.settingsService.getSettings().subscribe();
  }

  toggleTheme(): void {
    this.settingsService.toggleTheme();
  }

  logout(): void {
    this.authService.logout();
  }

  isActive(route: string): boolean {
    return this.router.url === route;
  }
}
