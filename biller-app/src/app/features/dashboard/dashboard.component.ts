import { Component, signal, computed, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, RouterOutlet } from '@angular/router';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { AuthService } from '../../core/services/auth.service';
import { SettingsService } from '../../core/services/settings.service';

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
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
    MatDividerModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  @ViewChild('sidenav') sidenav!: MatSidenav;

  sidenavOpened = signal(true);
  isMobile = signal(false);

  private baseMenuItems: MenuItem[] = [
    { icon: 'home', label: 'Home', route: '/dashboard/home' },
    { icon: 'inventory_2', label: 'Products', route: '/dashboard/products' },
    { icon: 'receipt_long', label: 'Bills & Reports', route: '/dashboard/bills' }
  ];

  menuItems = computed(() => {
    const user = this.authService.currentUser();
    const permissions = user?.permissions || [];
    
    // Admin gets all permissions by default
    const hasPermission = (permission: string) => {
      return user?.role === 'admin' || permissions.includes(permission);
    };
    
    // Filter menu items based on user permissions
    let items: MenuItem[] = [];
    
    if (hasPermission('dashboard')) {
      items.push({ icon: 'home', label: 'Home', route: '/dashboard/home' });
    }
    
    if (hasPermission('products')) {
      items.push({ icon: 'inventory_2', label: 'Products', route: '/dashboard/products' });
    }
    
    if (hasPermission('bills')) {
      items.push({ icon: 'receipt_long', label: 'Bills & Reports', route: '/dashboard/bills' });
    }
    
    if (hasPermission('customers') && this.settingsService.settings().debtEnabled) {
      items.push({ icon: 'account_balance_wallet', label: 'Customers', route: '/dashboard/customers' });
    }
    
    // Manage Users - Admin only
    if (user?.role === 'admin') {
      items.push({ icon: 'group', label: 'Manage Users', route: '/dashboard/users' });
    }
    
    if (hasPermission('settings')) {
      items.push({ icon: 'settings', label: 'Settings', route: '/dashboard/settings' });
    }
    
    return items;
  });

  constructor(
    public authService: AuthService,
    public settingsService: SettingsService,
    private router: Router,
    private breakpointObserver: BreakpointObserver
  ) {}

  ngOnInit(): void {
    this.breakpointObserver
      .observe([Breakpoints.HandsetPortrait, Breakpoints.TabletPortrait])
      .subscribe(result => {
        this.isMobile.set(result.matches);
        if (result.matches) {
          this.sidenavOpened.set(false);
        } else {
          this.sidenavOpened.set(true);
        }
      });

    // Load settings
    this.settingsService.getSettings().subscribe();
  }

  toggleSidenav(): void {
    this.sidenavOpened.set(!this.sidenavOpened());
  }

  toggleTheme(): void {
    this.settingsService.toggleTheme();
  }

  onMenuItemClick(): void {
    if (this.isMobile()) {
      this.sidenavOpened.set(false);
    }
  }

  logout(): void {
    this.authService.logout();
  }

  isActive(route: string): boolean {
    return this.router.url === route;
  }
}
