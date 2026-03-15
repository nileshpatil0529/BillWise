import { Component, OnInit, OnDestroy, signal, inject, ViewChild, Inject, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRippleModule } from '@angular/material/core';
import { ZXingScannerModule, ZXingScannerComponent } from '@zxing/ngx-scanner';
import { BarcodeFormat } from '@zxing/library';
import { BeepService } from '../../../../core/services/beep.service';

export interface ScannerDialogData {
  mode?: 'single' | 'continuous';
  title?: string;
}

@Component({
  selector: 'app-barcode-scanner-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatRippleModule,
    ZXingScannerModule
  ],
  template: `
    <div class="scanner-dialog">
      <div class="scanner-header">
        <div class="header-content">
          <mat-icon class="scanner-icon">qr_code_scanner</mat-icon>
          <div class="header-text">
            <h2>{{ dialogData?.title || 'Scan Barcode' }}</h2>
            <p class="subtitle">{{ mode === 'continuous' ? 'Scanning continuously...' : 'Position barcode in frame' }}</p>
          </div>
        </div>
        <button mat-icon-button class="close-button" (click)="onCancel()">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="scanner-body">
        <div class="scanner-container">
          <div class="scanner-frame">
            <div class="corner top-left"></div>
            <div class="corner top-right"></div>
            <div class="corner bottom-left"></div>
            <div class="corner bottom-right"></div>
            <div class="scan-line" [class.scanning]="!loading() && !error()"></div>
          </div>

          @if (loading()) {
            <div class="overlay-state">
              <mat-spinner diameter="48" color="accent"></mat-spinner>
              <p>Starting camera...</p>
            </div>
          }

          @if (error()) {
            <div class="overlay-state error">
              <mat-icon>videocam_off</mat-icon>
              <p>{{ error() }}</p>
              <button mat-flat-button color="primary" (click)="retryCamera()">
                <mat-icon>refresh</mat-icon>
                Retry
              </button>
            </div>
          } @else {
            <zxing-scanner
              #scanner
              [formats]="allowedFormats"
              [device]="selectedDevice()"
              (deviceChange)="onDeviceChange($event)"
              (scanSuccess)="onScanSuccess($event)"
              (camerasFound)="onCamerasFound($event)"
              (camerasNotFound)="onCamerasNotFound()"
              (permissionResponse)="onPermissionResponse($event)"
              (scanError)="onScanError($event)"
            ></zxing-scanner>
          }
        </div>

        @if (lastScannedCode()) {
          <div class="scanned-result" [class.success]="true">
            <mat-icon>check_circle</mat-icon>
            <div class="result-text">
              <span class="label">Scanned:</span>
              <span class="code">{{ lastScannedCode() }}</span>
            </div>
            @if (mode === 'continuous') {
              <span class="scan-count">{{ scanCount() }} scanned</span>
            }
          </div>
        }
      </div>

      <div class="scanner-footer">
        @if (availableDevices().length > 1) {
          <button mat-stroked-button class="switch-camera" (click)="switchCamera()">
            <mat-icon>cameraswitch</mat-icon>
            Switch Camera
          </button>
        }
        
        <button mat-flat-button color="warn" class="cancel-button" (click)="onCancel()">
          <mat-icon>close</mat-icon>
          {{ mode === 'continuous' ? 'Done' : 'Cancel' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    @use '../../../../../styles/variables' as v;
    @use '../../../../../styles/mixins' as m;

    .scanner-dialog {
      display: flex;
      flex-direction: column;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border-radius: 16px;
      overflow: hidden;
      max-height: 90vh;
      
      @include m.dark-theme {
        background: linear-gradient(135deg, #0d0d0d 0%, #1a1a1a 100%);
      }
    }

    .scanner-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      background: rgba(255, 255, 255, 0.05);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);

      .header-content {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .scanner-icon {
        font-size: 32px;
        width: 32px;
        height: 32px;
        color: #4fc3f7;
      }

      .header-text {
        h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: white;
        }

        .subtitle {
          margin: 2px 0 0;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.6);
        }
      }

      .close-button {
        color: rgba(255, 255, 255, 0.7);

        &:hover {
          color: white;
          background: rgba(255, 255, 255, 0.1);
        }
      }
    }

    .scanner-body {
      flex: 1;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .scanner-container {
      position: relative;
      width: 100%;
      aspect-ratio: 1;
      background: #000;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);

      zxing-scanner {
        width: 100%;
        height: 100%;

        ::ng-deep video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
      }

      .scanner-frame {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 70%;
        height: 70%;
        pointer-events: none;
        z-index: 10;

        .corner {
          position: absolute;
          width: 24px;
          height: 24px;
          border-color: #4fc3f7;
          border-style: solid;
          border-width: 0;

          &.top-left {
            top: 0;
            left: 0;
            border-top-width: 3px;
            border-left-width: 3px;
            border-top-left-radius: 8px;
          }

          &.top-right {
            top: 0;
            right: 0;
            border-top-width: 3px;
            border-right-width: 3px;
            border-top-right-radius: 8px;
          }

          &.bottom-left {
            bottom: 0;
            left: 0;
            border-bottom-width: 3px;
            border-left-width: 3px;
            border-bottom-left-radius: 8px;
          }

          &.bottom-right {
            bottom: 0;
            right: 0;
            border-bottom-width: 3px;
            border-right-width: 3px;
            border-bottom-right-radius: 8px;
          }
        }

        .scan-line {
          position: absolute;
          top: 0;
          left: 5%;
          width: 90%;
          height: 2px;
          background: linear-gradient(90deg, transparent, #4fc3f7, transparent);
          box-shadow: 0 0 8px #4fc3f7;
          opacity: 0;

          &.scanning {
            opacity: 1;
            animation: scanLine 2s ease-in-out infinite;
          }
        }
      }

      .overlay-state {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
        background: rgba(0, 0, 0, 0.85);
        color: white;
        z-index: 20;

        mat-icon {
          font-size: 64px;
          width: 64px;
          height: 64px;
          color: rgba(255, 255, 255, 0.5);
        }

        &.error mat-icon {
          color: #ef5350;
        }

        p {
          margin: 0;
          text-align: center;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.8);
          max-width: 80%;
        }
      }
    }

    .scanned-result {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      border-left: 4px solid #4caf50;

      &.success {
        background: rgba(76, 175, 80, 0.15);
      }

      mat-icon {
        color: #4caf50;
        flex-shrink: 0;
      }

      .result-text {
        flex: 1;
        min-width: 0;

        .label {
          display: block;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .code {
          display: block;
          font-size: 16px;
          font-weight: 600;
          color: white;
          font-family: 'Roboto Mono', monospace;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }

      .scan-count {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
        background: rgba(255, 255, 255, 0.1);
        padding: 4px 8px;
        border-radius: 12px;
        flex-shrink: 0;
      }
    }

    .scanner-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 16px 20px;
      background: rgba(0, 0, 0, 0.2);
      border-top: 1px solid rgba(255, 255, 255, 0.1);

      .switch-camera {
        color: white;
        border-color: rgba(255, 255, 255, 0.3);

        &:hover {
          background: rgba(255, 255, 255, 0.1);
        }
      }

      .cancel-button {
        margin-left: auto;
      }
    }

    @keyframes scanLine {
      0%, 100% {
        top: 0;
      }
      50% {
        top: calc(100% - 2px);
      }
    }

    @media (max-width: 480px) {
      .scanner-dialog {
        border-radius: 0;
        max-height: 100vh;
        height: 100vh;
      }

      .scanner-header {
        padding: 12px 16px;

        .scanner-icon {
          font-size: 28px;
          width: 28px;
          height: 28px;
        }

        .header-text h2 {
          font-size: 16px;
        }
      }

      .scanner-body {
        padding: 16px;
      }

      .scanner-footer {
        padding: 12px 16px;
      }
    }
  `]
})
export class BarcodeScannerDialogComponent implements OnInit, OnDestroy {
  @ViewChild('scanner') scanner!: ZXingScannerComponent;

  private dialogRef = inject(MatDialogRef<BarcodeScannerDialogComponent>);
  private beepService = inject(BeepService);

  mode: 'single' | 'continuous' = 'single';
  dialogData: ScannerDialogData | null = null;

  loading = signal(true);
  error = signal<string | null>(null);
  lastScannedCode = signal<string | null>(null);
  scannedCodes = signal<string[]>([]);
  scanCount = signal(0);
  availableDevices = signal<MediaDeviceInfo[]>([]);
  selectedDevice = signal<MediaDeviceInfo | undefined>(undefined);
  currentDeviceIndex = 0;

  constructor(@Optional() @Inject(MAT_DIALOG_DATA) data: ScannerDialogData | null) {
    this.dialogData = data;
    this.mode = data?.mode || 'single';
  }

  // Support common 1D barcode formats and QR Code
  allowedFormats: BarcodeFormat[] = [
    BarcodeFormat.QR_CODE,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.CODE_93,
    BarcodeFormat.CODABAR,
    BarcodeFormat.ITF
  ];

  private lastScanTime = 0;
  private scanDebounceMs = 1500; // Prevent duplicate scans within 1.5 seconds

  ngOnInit(): void {
    // Camera will be initialized by zxing-scanner
  }

  ngOnDestroy(): void {
    // Clean up handled by zxing-scanner
  }

  onCamerasFound(devices: MediaDeviceInfo[]): void {
    this.availableDevices.set(devices);
    if (devices.length > 0) {
      // Try to select back camera first
      const backCamera = devices.find(d => 
        d.label.toLowerCase().includes('back') || 
        d.label.toLowerCase().includes('rear') ||
        d.label.toLowerCase().includes('environment')
      );
      this.selectedDevice.set(backCamera || devices[0]);
      this.loading.set(false);
    }
  }

  onCamerasNotFound(): void {
    this.error.set('No cameras found on this device');
    this.loading.set(false);
  }

  onPermissionResponse(hasPermission: boolean): void {
    if (!hasPermission) {
      this.error.set('Camera permission denied. Please allow camera access.');
      this.loading.set(false);
    }
  }

  onDeviceChange(device: MediaDeviceInfo): void {
    this.selectedDevice.set(device);
    this.loading.set(false);
  }

  onScanSuccess(barcode: string): void {
    const now = Date.now();
    
    // Debounce to prevent rapid duplicate scans
    if (now - this.lastScanTime < this.scanDebounceMs) {
      return;
    }
    this.lastScanTime = now;

    console.log('=== BARCODE SCANNED ===');
    console.log('Barcode value:', barcode);
    console.log('Mode:', this.mode);
    console.log('========================');
    
    if (barcode) {
      // Play success beep
      this.beepService.playDoubleBeep();
      
      this.lastScannedCode.set(barcode);
      this.scanCount.update(count => count + 1);
      this.scannedCodes.update(codes => [...codes, barcode]);

      if (this.mode === 'single') {
        // Single mode: close dialog after scan
        setTimeout(() => {
          this.dialogRef.close(barcode);
        }, 500);
      } else {
        // Continuous mode: emit the barcode but keep scanning
        // The home component will handle adding products
        this.dialogRef.componentInstance; // Keep dialog open
      }
    }
  }

  onScanError(error: Error): void {
    console.error('Scan error:', error);
  }

  switchCamera(): void {
    const devices = this.availableDevices();
    if (devices.length > 1) {
      this.currentDeviceIndex = (this.currentDeviceIndex + 1) % devices.length;
      this.selectedDevice.set(devices[this.currentDeviceIndex]);
    }
  }

  retryCamera(): void {
    this.error.set(null);
    this.loading.set(true);
    // Re-trigger camera initialization
    if (this.scanner) {
      this.scanner.restart();
    }
  }

  onCancel(): void {
    // For continuous mode, return all scanned codes
    if (this.mode === 'continuous' && this.scannedCodes().length > 0) {
      this.dialogRef.close({ codes: this.scannedCodes(), count: this.scanCount() });
    } else {
      this.dialogRef.close(null);
    }
  }
}
