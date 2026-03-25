import { Routes } from '@angular/router';
import { authGuard, loginGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },
  {
    path: 'login',
    canActivate: [loginGuard],
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
    children: [
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full'
      },
      {
        path: 'home',
        data: { permission: 'dashboard' },
        loadComponent: () => import('./features/dashboard/home/home.component').then(m => m.HomeComponent)
      },
      {
        path: 'products',
        data: { permission: 'products' },
        loadComponent: () => import('./features/dashboard/products/products.component').then(m => m.ProductsComponent)
      },
      {
        path: 'bills',
        data: { permission: 'bills' },
        loadComponent: () => import('./features/dashboard/bills/bills.component').then(m => m.BillsComponent)
      },
      {
        path: 'settings',
        data: { permission: 'settings' },
        loadComponent: () => import('./features/dashboard/settings/settings.component').then(m => m.SettingsComponent)
      },
      {
        path: 'customers',
        data: { permission: 'customers' },
        loadComponent: () => import('./features/dashboard/customers/customers.component').then(m => m.CustomersComponent)
      },
      {
        path: 'users',
        data: { permission: 'users' },
        loadComponent: () => import('./features/dashboard/users/users.component').then(m => m.UsersComponent)
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'login'
  }
];
