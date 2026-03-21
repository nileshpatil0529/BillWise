import { Injectable, inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    // Check route permissions
    const requiredPermission = route.data?.['permission'] as string;
    if (requiredPermission) {
      const user = authService.currentUser();
      // Admin has access to all routes
      if (user?.role !== 'admin' && !user?.permissions?.includes(requiredPermission)) {
        router.navigate(['/dashboard']);
        return false;
      }
    }
    return true;
  }

  router.navigate(['/login'], { 
    queryParams: { returnUrl: state.url }
  });
  return false;
};

export const loginGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return true;
  }

  router.navigate(['/dashboard']);
  return false;
};

export const adminGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated() && authService.isAdmin()) {
    return true;
  }

  router.navigate(['/dashboard']);
  return false;
};
