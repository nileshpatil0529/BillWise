import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Service that automatically blurs interactive elements after click.
 * This prevents barcode scanners from triggering buttons when they send
 * keyboard input (like Enter key) after scanning.
 * 
 * Initialize this service in app.component.ts
 */
@Injectable({
  providedIn: 'root'
})
export class AutoBlurService {
  private initialized = false;
  private lastClickedButton: HTMLElement | null = null;
  private lastClickTime = 0;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  /**
   * Initialize the global click listener.
   * Call this once from the root component.
   */
  initialize(): void {
    if (this.initialized || !isPlatformBrowser(this.platformId)) {
      return;
    }

    // Track clicked buttons
    document.addEventListener('click', (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      // Find the closest button or interactive element
      const button = target.closest('button, [mat-button], [mat-raised-button], [mat-flat-button], [mat-stroked-button], [mat-icon-button], [mat-fab], [mat-mini-fab]');
      
      if (button instanceof HTMLElement) {
        this.lastClickedButton = button;
        this.lastClickTime = Date.now();
        
        // Blur the button immediately
        button.blur();
        
        // Also blur after a short delay as backup
        setTimeout(() => {
          button.blur();
          // Clear active element focus as well
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
        }, 10);
      }
    }, true);

    // Intercept Enter key on buttons that were recently clicked
    // This prevents barcode scanner from triggering buttons
    document.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        const target = event.target as HTMLElement;
        const button = target.closest('button, [mat-button], [mat-raised-button], [mat-flat-button], [mat-stroked-button], [mat-icon-button], [mat-fab], [mat-mini-fab]');
        
        // If Enter is pressed on a button that was clicked in the last 5 seconds,
        // prevent it (likely barcode scanner input)
        if (button instanceof HTMLElement && 
            this.lastClickedButton === button && 
            Date.now() - this.lastClickTime < 5000) {
          event.preventDefault();
          event.stopPropagation();
          button.blur();
        }
      }
    }, true);

    this.initialized = true;
    console.log('AutoBlurService initialized - buttons will auto-blur after click');
  }
}

