import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PrinterService } from '../../../../core/services/printer.service';
import { SocketService } from '../../../../core/services/socket.service';
import { PrinterConfig, PaperSize } from '../../../../core/models/settings.model';

@Component({
  selector: 'app-printer-config',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatRadioModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatSnackBarModule
  ],
  templateUrl: './printer-config.component.html',
  styleUrls: ['./printer-config.component.scss']
})
export class PrinterConfigComponent implements OnInit {
  printerService: PrinterService = inject(PrinterService);
  private socketService: SocketService = inject(SocketService);
  private snackBar: MatSnackBar = inject(MatSnackBar);

  saving = signal(false);
  testing = signal(false);

  // Typed proxies for template strict-type-checking
  readonly qzStatus = computed(() => this.printerService.qzStatus());
  readonly availablePrinters = computed(() => this.printerService.availablePrinters());

  // Local form state
  enabled = signal(false);
  selectedPrinter = signal<string | null>(null);
  paperSize = signal<PaperSize>('3inch');

  ngOnInit(): void {
    this.printerService.loadConfig().subscribe({
      next: () => {
        const cfg = this.printerService.config();
        this.enabled.set(cfg.enabled);
        this.selectedPrinter.set(cfg.printerName);
        this.paperSize.set(cfg.paperSize);
        // Auto-connect QZ Tray if enabled
        if (cfg.enabled) {
          this.connectQZ();
        }
      }
    });
  }

  connectQZ(): void {
    this.printerService.connectQZ().catch((_err: unknown) => {
      this.snackBar.open(
        'QZ Tray not detected. Please install and start QZ Tray, then try again.',
        'Download',
        { duration: 8000 }
      ).onAction().subscribe(() => {
        window.open('https://qz.io/download/', '_blank');
      });
    });
  }

  refreshPrinters(): void {
    this.printerService.refreshPrinters().then((printers: string[]) => {
      if (printers.length === 0) {
        this.snackBar.open('No printers found', 'OK', { duration: 3000 });
      }
    });
  }

  async testPrint(): Promise<void> {
    this.testing.set(true);
    try {
      await this.printerService.printReceipt(this.buildTestBill(), this.buildTestSettings());
      this.snackBar.open('Test print sent successfully!', 'OK', { duration: 3000 });
    } catch (err: any) {
      this.snackBar.open('Test print failed: ' + (err?.message || 'Unknown error'), 'OK', { duration: 5000 });
    } finally {
      this.testing.set(false);
    }
  }

  saveConfig(): void {
    this.saving.set(true);
    const cfg: PrinterConfig = {
      printerName: this.selectedPrinter(),
      paperSize: this.paperSize(),
      enabled: this.enabled()
    };

    // Apply to service before saving so socket registration picks it up
    this.printerService.config.set(cfg);

    this.printerService.saveConfig(cfg).subscribe({
      next: () => {
        this.snackBar.open('Printer configuration saved', 'OK', { duration: 3000 });
        this.socketService.refreshPrinterRegistration();
      },
      error: () => {
        this.snackBar.open('Failed to save printer configuration', 'OK', { duration: 4000 });
      },
      complete: () => this.saving.set(false)
    });
  }

  private buildTestBill(): any {
    return {
      billNumber: 'TEST00001',
      createdAt: new Date().toISOString(),
      subtotal: 100,
      taxTotal: 18,
      discountTotal: 0,
      grandTotal: 118,
      paymentMethod: 'cash',
      businessTypeData: {},
      items: [{ name: 'Test Item', quantity: 1, unitPrice: 100, isLooseItem: false, kotPrintedQuantity: 0 }]
    };
  }

  private buildTestSettings(): any {
    return {
      businessName: 'Test Business',
      address: '123 Test Street',
      phone: '9999999999',
      taxNumber: 'TESTGST123',
      footerText: 'Thank you!',
      taxRates: [{ name: 'GST', rate: 18 }],
      receiptLanguage: 'en'
    };
  }
}
