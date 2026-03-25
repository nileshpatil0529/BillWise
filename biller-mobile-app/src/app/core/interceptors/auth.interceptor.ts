import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

let isLoggingOut = false;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  const token = authService.getToken();

  if (token) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !isLoggingOut) {
        // Prevent multiple simultaneous logout calls
        isLoggingOut = true;
        
        // Use local logout to avoid making another API call that could fail
        authService.logoutLocal();
        
        // Reset flag after a short delay
        setTimeout(() => {
          isLoggingOut = false;
        }, 1000);
      }
      return throwError(() => error);
    })
  );
};
