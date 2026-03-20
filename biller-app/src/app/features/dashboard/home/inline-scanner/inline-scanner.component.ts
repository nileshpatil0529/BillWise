import { Component, OnInit, OnDestroy, signal, inject, ViewChild, Output, EventEmitter, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { ZXingScannerModule, ZXingScannerComponent } from '@zxing/ngx-scanner';
import { BarcodeFormat } from '@zxing/library';
import { BeepService } from '../../../../core/services/beep.service';
import { Product } from '../../../../core/models/product.model';

@Component({
  selector: 'app-inline-scanner',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatDividerModule,
    ZXingScannerModule
  ],
  template: `
    <div class="inline-scanner" [@.disabled]="true">
      <div class="scanner-header">
        <div class="header-left">
          <mat-icon class="scanner-icon">qr_code_scanner</mat-icon>
          <div class="header-text">
            <span class="title">Barcode Scanner</span>
            <span class="subtitle">{{ isScanning() ? 'Scanning...' : 'Click Scan to start' }}</span>
          </div>
        </div>
        <button mat-icon-button class="close-btn" (click)="onClose()">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="scanner-content">
        <div class="scanner-view">
          <div class="camera-container">
            @if (loading()) {
              <div class="overlay-state">
                <mat-spinner diameter="40"></mat-spinner>
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
              ></zxing-scanner>

              <div class="scan-frame">
                <div class="corner tl"></div>
                <div class="corner tr"></div>
                <div class="corner bl"></div>
                <div class="corner br"></div>
                <div class="scan-line" [class.active]="isScanning()"></div>
              </div>
            }
          </div>

          @if (availableDevices().length > 1) {
            <button mat-stroked-button class="switch-cam-btn" (click)="switchCamera()">
              <mat-icon>cameraswitch</mat-icon>
            </button>
          }
        </div>

        <div class="result-panel">
          @if (lastScannedCode()) {
            <div class="product-found">
              <div class="product-icon success">
                <mat-icon>check_circle</mat-icon>
              </div>
              <div class="product-details">
                <span class="product-name">Product Added</span>
                <span class="product-info">
                  <span class="barcode">{{ lastScannedCode() }}</span>
                </span>
              </div>
            </div>
          } @else {
            <div class="waiting">
              <mat-icon>qr_code</mat-icon>
              <span>Ready to scan</span>
              <span class="hint">Click Scan button to start</span>
            </div>
          }

          <div class="action-buttons">
            <button mat-flat-button color="primary" class="scan-btn" 
                    (click)="startScan()"
                    [disabled]="!canScan() || isScanning() || loading() || !!error()">
              <mat-icon>{{ isScanning() ? 'hourglass_empty' : 'qr_code_scanner' }}</mat-icon>
              {{ isScanning() ? 'Scanning...' : 'Scan' }}
            </button>
          </div>
        </div>
      </div>

      <div class="scanner-footer">
        <div class="scan-stats">
          <mat-icon>shopping_cart</mat-icon>
          <span>{{ addedCount() }} items added</span>
        </div>
        <button mat-flat-button color="accent" class="done-btn" (click)="onClose()">
          <mat-icon>done_all</mat-icon>
          Done
        </button>
      </div>
    </div>
  `,
  styles: [`
    @use '../../../../../styles/variables' as v;
    @use '../../../../../styles/mixins' as m;

    .inline-scanner {
      display: flex;
      flex-direction: column;
      background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);

      @include m.dark-theme {
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      }
    }

    .scanner-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.1);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);

      .header-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .scanner-icon {
        font-size: 28px;
        width: 28px;
        height: 28px;
        color: #4fc3f7;
      }

      .header-text {
        display: flex;
        flex-direction: column;

        .title {
          font-size: 16px;
          font-weight: 600;
          color: white;
        }

        .subtitle {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.7);
        }
      }

      .close-btn {
        color: rgba(255, 255, 255, 0.7);

        &:hover {
          color: white;
          background: rgba(255, 255, 255, 0.1);
        }
      }
    }

    .scanner-content {
      display: flex;
      gap: 16px;
      padding: 16px;
      min-height: 250px;

      @media (max-width: 600px) {
        flex-direction: column;
        min-height: auto;
      }
    }

    .scanner-view {
      position: relative;
      flex: 1;
      min-width: 200px;
      max-width: 280px;

      @media (max-width: 600px) {
        max-width: 100%;
        height: 200px;
      }
    }

    .camera-container {
      position: relative;
      width: 100%;
      aspect-ratio: 1;
      background: #000;
      border-radius: 12px;
      overflow: hidden;

      @media (max-width: 600px) {
        aspect-ratio: 16/9;
        height: 100%;
      }

      zxing-scanner {
        width: 100%;
        height: 100%;

        ::ng-deep video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
      }

      .overlay-state {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        background: rgba(0, 0, 0, 0.85);
        color: white;
        z-index: 10;

        mat-icon {
          font-size: 48px;
          width: 48px;
          height: 48px;
        }

        &.error mat-icon {
          color: #ef5350;
        }

        p {
          margin: 0;
          font-size: 14px;
          text-align: center;
        }
      }
    }

    .scan-frame {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 70%;
      height: 70%;
      pointer-events: none;

      .corner {
        position: absolute;
        width: 20px;
        height: 20px;
        border: 3px solid #4fc3f7;

        &.tl { top: 0; left: 0; border-right: none; border-bottom: none; border-top-left-radius: 8px; }
        &.tr { top: 0; right: 0; border-left: none; border-bottom: none; border-top-right-radius: 8px; }
        &.bl { bottom: 0; left: 0; border-right: none; border-top: none; border-bottom-left-radius: 8px; }
        &.br { bottom: 0; right: 0; border-left: none; border-top: none; border-bottom-right-radius: 8px; }
      }

      .scan-line {
        position: absolute;
        left: 5%;
        width: 90%;
        height: 2px;
        background: linear-gradient(90deg, transparent, #4fc3f7, transparent);
        box-shadow: 0 0 8px #4fc3f7;
        opacity: 0;

        &.active {
          opacity: 1;
          animation: scanMove 2s ease-in-out infinite;
        }
      }
    }

    .switch-cam-btn {
      position: absolute;
      bottom: 8px;
      right: 8px;
      min-width: 36px;
      padding: 0;
      color: white;
      background: rgba(0, 0, 0, 0.5);
      border: none;

      mat-icon {
        margin: 0;
      }
    }

    .result-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-width: 200px;
    }

    .product-found {
      display: flex;
      gap: 12px;
      padding: 16px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      margin-bottom: 16px;

      .product-icon {
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(76, 175, 80, 0.2);
        border-radius: 12px;
        flex-shrink: 0;

        mat-icon {
          color: #4caf50;
          font-size: 28px;
          width: 28px;
          height: 28px;
        }
      }

      .product-details {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;

        .product-name {
          font-size: 16px;
          font-weight: 600;
          color: white;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .product-info {
          display: flex;
          gap: 12px;
          font-size: 13px;

          .barcode {
            color: rgba(255, 255, 255, 0.6);
            font-family: 'Roboto Mono', monospace;
          }

          .price {
            color: #4fc3f7;
            font-weight: 600;
          }
        }

        .stock {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.6);

          &.low {
            color: #ffb74d;
          }
        }
      }
    }

    .action-buttons {
      display: flex;
      gap: 12px;
      margin-top: 16px;

      button {
        flex: 1;

        mat-icon {
          margin-right: 4px;
        }
      }

      .scan-btn {
        min-height: 48px;
        font-size: 16px;
      }
    }

    .product-found {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      background: rgba(76, 175, 80, 0.2);
      border-radius: 8px;
      border-left: 4px solid #4caf50;

      .product-icon {
        flex-shrink: 0;

        mat-icon {
          font-size: 40px;
          width: 40px;
          height: 40px;
          color: #4caf50;
        }

        &.success mat-icon {
          color: #4caf50;
        }
      }

      .product-details {
        flex: 1;
        min-width: 0;

        .product-name {
          display: block;
          font-size: 16px;
          font-weight: 600;
          color: white;
          margin-bottom: 4px;
        }

        .product-info {
          display: flex;
          gap: 16px;
          font-size: 13px;

          .barcode {
            color: rgba(255, 255, 255, 0.7);
            font-family: 'Roboto Mono', monospace;
          }
        }
      }
    }

    .waiting {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 24px;
      text-align: center;
      color: rgba(255, 255, 255, 0.8);

      mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        color: rgba(255, 255, 255, 0.4);
      }

      .hint {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.5);
      }
    }

    .scanner-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: rgba(0, 0, 0, 0.2);
      border-top: 1px solid rgba(255, 255, 255, 0.1);

      .scan-stats {
        display: flex;
        align-items: center;
        gap: 8px;
        color: rgba(255, 255, 255, 0.7);
        font-size: 14px;

        mat-icon {
          font-size: 20px;
          width: 20px;
          height: 20px;
        }
      }

      .done-btn {
        min-width: 100px;
      }
    }

    @keyframes scanMove {
      0%, 100% { top: 0; }
      50% { top: calc(100% - 2px); }
    }
  `]
})
export class InlineScannerComponent implements OnInit, OnDestroy {
  @ViewChild('scanner') scanner!: ZXingScannerComponent;
  
  @Input() currencySymbol = '₹';
  @Output() productAdded = new EventEmitter<Product>();
  @Output() barcodeScanned = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();

  loading = signal(true);
  error = signal<string | null>(null);
  lastScannedCode = signal<string | null>(null);
  addedCount = signal(0);
  availableDevices = signal<MediaDeviceInfo[]>([]);
  selectedDevice = signal<MediaDeviceInfo | undefined>(undefined);
  currentDeviceIndex = 0;
  isScanning = signal(false);
  canScan = signal(false);

  private beepService = inject(BeepService);
  private lastScanTime = 0;
  private scanDebounceMs = 1000;

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

  ngOnInit(): void {}

  ngOnDestroy(): void {}

  onCamerasFound(devices: MediaDeviceInfo[]): void {
    this.availableDevices.set(devices);
    if (devices.length > 0) {
      const backCamera = devices.find(d => 
        d.label.toLowerCase().includes('back') || 
        d.label.toLowerCase().includes('rear') ||
        d.label.toLowerCase().includes('environment')
      );
      this.selectedDevice.set(backCamera || devices[0]);
      this.loading.set(false);
      this.canScan.set(true);
    }
  }

  onCamerasNotFound(): void {
    this.error.set('No cameras found');
    this.loading.set(false);
  }

  onPermissionResponse(hasPermission: boolean): void {
    if (!hasPermission) {
      this.error.set('Camera permission denied');
      this.loading.set(false);
    }
  }

  onDeviceChange(device: MediaDeviceInfo): void {
    this.selectedDevice.set(device);
    this.loading.set(false);
  }

  onScanSuccess(barcode: string): void {
    const now = Date.now();
    
    // Only process if scanning is enabled
    if (!this.isScanning() || (now - this.lastScanTime < this.scanDebounceMs)) {
      return;
    }
    this.lastScanTime = now;

    if (barcode) {
      this.beepService.playDoubleBeep();
      this.lastScannedCode.set(barcode);
      this.isScanning.set(false);
      // Emit barcode for parent to handle product lookup and auto-add
      this.barcodeScanned.emit(barcode);
    }
  }

  startScan(): void {
    if (this.canScan() && !this.loading() && !this.error()) {
      this.isScanning.set(true);
      this.lastScannedCode.set(null);
    }
  }

  onProductAdded(): void {
    this.addedCount.update(c => c + 1);
    this.lastScannedCode.set(null);
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
    if (this.scanner) {
      this.scanner.restart();
    }
  }

  onClose(): void {
    this.closed.emit();
  }

  formatCurrency(amount: number): string {
    return `${this.currencySymbol}${amount.toFixed(2)}`;
  }

  setProductAdded(): void {
    this.onProductAdded();
  }

  setNotFound(): void {
    this.beepService.playError();
    this.lastScannedCode.set(null);
  }
}
