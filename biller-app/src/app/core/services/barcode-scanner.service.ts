import { Injectable, NgZone, signal, OnDestroy } from '@angular/core';
import { Subject, fromEvent, Subscription } from 'rxjs';
import { SettingsService } from './settings.service';

export interface ScanResult {
  barcode: string;
  timestamp: Date;
}

@Injectable({
  providedIn: 'root'
})
export class BarcodeScannerService implements OnDestroy {
  // Signal to track if scanner is active/listening
  isActive = signal(false);
  
  // Last scanned barcode
  lastScannedCode = signal<string | null>(null);
  
  // Subject for emitting scan events
  private scanSubject = new Subject<ScanResult>();
  
  // Observable that components can subscribe to
  scan$ = this.scanSubject.asObservable();
  
  // Buffer for collecting characters
  private charBuffer: string[] = [];
  
  // Timestamp of last keypress (for detecting rapid input)
  private lastKeyTime = 0;
  
  // Threshold in milliseconds - USB scanners typically type very fast (under 50ms between keys)
  private readonly SCANNER_SPEED_THRESHOLD = 50;
  
  // Minimum barcode length to be considered valid
  private readonly MIN_BARCODE_LENGTH = 3;
  
  // Maximum time to wait before clearing buffer
  private readonly BUFFER_CLEAR_TIMEOUT = 200;
  
  // Timer for clearing buffer
  private bufferClearTimer: any = null;
  
  // Subscriptions
  private keydownSubscription: Subscription | null = null;
  
  // Track if a scan sequence is in progress
  private scanInProgress = false;
  
  // Elements to ignore scanner input from (like input fields in products page when editing)
  private ignoredElements: Set<string> = new Set(['product-barcode-input']);

  constructor(
    private ngZone: NgZone,
    private settingsService: SettingsService
  ) {
    // Auto-start if USB scanner is enabled in settings
    if (this.settingsService.settings().scannerType === 'usb') {
      this.startListening();
    }
  }

  ngOnDestroy(): void {
    this.stopListening();
  }

  /**
   * Start listening for barcode scanner input
   */
  startListening(): void {
    if (this.isActive()) {
      return; // Already listening
    }

    this.ngZone.runOutsideAngular(() => {
      this.keydownSubscription = fromEvent<KeyboardEvent>(document, 'keydown')
        .subscribe(event => this.handleKeydown(event));
    });

    this.isActive.set(true);
  }

  /**
   * Stop listening for barcode scanner input
   */
  stopListening(): void {
    if (this.keydownSubscription) {
      this.keydownSubscription.unsubscribe();
      this.keydownSubscription = null;
    }
    this.clearBuffer();
    this.isActive.set(false);
  }

  /**
   * Add element ID to ignore list (scanner input will be ignored when these elements are focused)
   */
  addIgnoredElement(elementId: string): void {
    this.ignoredElements.add(elementId);
  }

  /**
   * Remove element ID from ignore list
   */
  removeIgnoredElement(elementId: string): void {
    this.ignoredElements.delete(elementId);
  }

  /**
   * Clear all ignored elements
   */
  clearIgnoredElements(): void {
    this.ignoredElements.clear();
  }

  /**
   * Handle keydown events
   */
  private handleKeydown(event: KeyboardEvent): void {
    const currentTime = Date.now();
    const timeDiff = currentTime - this.lastKeyTime;
    
    // Check if we should ignore this input (e.g., user typing in a specific input field)
    const activeElement = document.activeElement;
    if (activeElement) {
      const elementId = activeElement.id;
      if (this.ignoredElements.has(elementId)) {
        return; // Ignore scanner input for this element
      }
    }

    // Clear timeout if exists
    if (this.bufferClearTimer) {
      clearTimeout(this.bufferClearTimer);
      this.bufferClearTimer = null;
    }

    // Check if this seems like scanner input (very fast typing)
    if (timeDiff > this.BUFFER_CLEAR_TIMEOUT && this.charBuffer.length > 0) {
      // Too slow, likely human typing - clear buffer
      this.clearBuffer();
    }

    // Handle Enter key
    if (event.key === 'Enter') {
      if (this.charBuffer.length >= this.MIN_BARCODE_LENGTH) {
        // We have a valid barcode
        const barcode = this.charBuffer.join('');
        this.processBarcode(barcode);
        event.preventDefault();
        event.stopPropagation();
      }
      this.clearBuffer();
      return;
    }

    // Only buffer printable characters
    if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      // If this is rapid input or first character, add to buffer
      if (this.charBuffer.length === 0 || timeDiff < this.SCANNER_SPEED_THRESHOLD) {
        this.charBuffer.push(event.key);
        this.scanInProgress = true;
        
        // If scanner input is detected and we're in an input field, prevent the default
        if (this.charBuffer.length > 1 && timeDiff < this.SCANNER_SPEED_THRESHOLD) {
          // Only prevent if not in a search/text input that should receive the value
          if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
            // Check if it's not an ignored element - for scan input, we want to prevent default
            const tagName = (activeElement as HTMLElement).tagName?.toLowerCase();
            const inputType = (activeElement as HTMLInputElement).type?.toLowerCase();
            
            // Allow scanner input to go to search fields
            if (!['search', 'text'].includes(inputType)) {
              event.preventDefault();
            }
          }
        }
      } else {
        // Slow typing - this is human input, clear buffer and don't interfere
        this.clearBuffer();
        this.charBuffer.push(event.key); // Start fresh with this character
      }
    }

    this.lastKeyTime = currentTime;

    // Set timeout to clear buffer if no more input
    this.bufferClearTimer = setTimeout(() => {
      if (this.charBuffer.length >= this.MIN_BARCODE_LENGTH && this.scanInProgress) {
        // Might be a barcode without Enter - some scanners work this way
        // Only process if it seems like scanner speed input
        const barcode = this.charBuffer.join('');
        this.processBarcode(barcode);
      }
      this.clearBuffer();
    }, this.BUFFER_CLEAR_TIMEOUT);
  }

  /**
   * Process a detected barcode
   */
  private processBarcode(barcode: string): void {
    // Clean the barcode (remove any newlines, carriage returns, etc.)
    const cleanBarcode = barcode.trim().replace(/[\r\n]/g, '');
    
    if (cleanBarcode.length < this.MIN_BARCODE_LENGTH) {
      return; // Too short to be valid
    }
    
    // Update last scanned code
    this.ngZone.run(() => {
      this.lastScannedCode.set(cleanBarcode);
      
      // Emit the scan event
      this.scanSubject.next({
        barcode: cleanBarcode,
        timestamp: new Date()
      });
    });
  }

  /**
   * Clear the character buffer
   */
  private clearBuffer(): void {
    this.charBuffer = [];
    this.scanInProgress = false;
  }

  /**
   * Manually emit a barcode (useful for testing or camera scan integration)
   */
  emitBarcode(barcode: string): void {
    this.processBarcode(barcode);
  }

  /**
   * Check if the service is currently listening for scanner input
   */
  isListening(): boolean {
    return this.isActive();
  }
}
