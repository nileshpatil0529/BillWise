import { Injectable, signal, inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Observable, from, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PrinterConfig, PaperSize } from '../models/settings.model';

declare const qz: any;

// Paper widths in characters
const WIDTH: Record<PaperSize, number> = { '2inch': 32, '3inch': 48 };

@Injectable({ providedIn: 'root' })
export class PrinterService {
  private readonly API_URL = `${environment.apiUrl}/printer-config`;
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  config = signal<PrinterConfig>({ printerName: null, paperSize: '3inch', enabled: false });
  qzStatus = signal<'unchecked' | 'connected' | 'disconnected' | 'loading'>('unchecked');
  availablePrinters = signal<string[]>([]);

  // ─── Config API ────────────────────────────────────────────────────────────

  loadConfig(): Observable<any> {
    return new Observable(observer => {
      this.http.get<any>(this.API_URL).subscribe({
        next: res => {
          if (res.success) {
            const cfg: PrinterConfig = {
              printerName: res.data.printerName,
              paperSize: res.data.paperSize || '3inch',
              enabled: Boolean(res.data.enabled)
            };
            this.config.set(cfg);
          }
          observer.next(res);
          observer.complete();
        },
        error: err => observer.error(err)
      });
    });
  }

  saveConfig(cfg: PrinterConfig): Observable<any> {
    return this.http.put(this.API_URL, cfg);
  }

  // ─── QZ Tray ───────────────────────────────────────────────────────────────

  private async loadQZScript(): Promise<void> {
    if (!this.isBrowser) return;
    if (typeof qz !== 'undefined') return;
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-qz]');
      if (existing) { resolve(); return; }
      const s = document.createElement('script');
      s.setAttribute('data-qz', 'true');
      s.src = 'https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load QZ Tray library'));
      document.head.appendChild(s);
    });
  }

  async connectQZ(): Promise<void> {
    this.qzStatus.set('loading');
    try {
      await this.loadQZScript();
      // Allow unsigned connection for local use
      qz.security.setCertificatePromise((_: any, resolve: any) => resolve(''));
      qz.security.setSignaturePromise((_: any, resolve: any) => resolve(''));

      if (!qz.websocket.isActive()) {
        await qz.websocket.connect();
      }
      this.qzStatus.set('connected');
      await this.refreshPrinters();
    } catch (err: any) {
      this.qzStatus.set('disconnected');
      throw new Error(err?.message || 'QZ Tray is not running');
    }
  }

  async disconnectQZ(): Promise<void> {
    try {
      if (typeof qz !== 'undefined' && qz.websocket.isActive()) {
        await qz.websocket.disconnect();
      }
    } catch { /* ignore */ }
    this.qzStatus.set('disconnected');
  }

  async refreshPrinters(): Promise<string[]> {
    try {
      const printers: string[] = await qz.printers.find();
      this.availablePrinters.set(printers);
      return printers;
    } catch {
      return [];
    }
  }

  isReady(): boolean {
    return (
      this.qzStatus() === 'connected' &&
      this.config().enabled &&
      !!this.config().printerName
    );
  }

  // ─── ESC/POS Print ─────────────────────────────────────────────────────────

  async printReceipt(bill: any, settings: any): Promise<void> {
    const cfg = this.config();
    if (!cfg.printerName) throw new Error('No printer selected');
    const data = this.buildReceiptData(bill, settings, cfg.paperSize);
    await this.sendRaw(cfg.printerName, data);
  }

  async printKOT(bill: any, settings: any): Promise<void> {
    const cfg = this.config();
    if (!cfg.printerName) throw new Error('No printer selected');
    const data = this.buildKOTData(bill, settings, cfg.paperSize);
    await this.sendRaw(cfg.printerName, data);
  }

  private async sendRaw(printerName: string, escData: string): Promise<void> {
    const qzConfig = qz.configs.create(printerName);
    await qz.print(qzConfig, [{ type: 'raw', format: 'command', data: escData }]);
  }

  // ─── ESC/POS builders ──────────────────────────────────────────────────────

  private buildReceiptData(bill: any, settings: any, paperSize: PaperSize): string {
    const W = WIDTH[paperSize];
    const ESC = '\x1B', GS = '\x1D';
    const sep = '-'.repeat(W);
    const isHindi = settings?.receiptLanguage === 'hi';
    const items: any[] = bill.items || [];
    let t = '';

    // Init
    t += ESC + '@';
    // Header — center, bold, double size
    t += ESC + 'a\x01' + ESC + 'E\x01' + GS + '!\x11';
    t += (settings?.businessName || 'My Business') + '\n';
    t += GS + '!\x00' + ESC + 'E\x00\n';
    // Business details
    if (settings?.address) t += settings.address + '\n';
    if (settings?.taxNumber) t += 'GST: ' + settings.taxNumber + '\n';
    if (settings?.phone) t += 'Ph: ' + settings.phone + '\n';
    // Bill info — left align
    t += ESC + 'a\x00\n';
    t += 'Date: ' + new Date(bill.createdAt).toLocaleString('en-IN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    }) + '\n';
    t += 'Bill: ' + (bill.billNumber || '').slice(-5) + '\n';
    const btd = bill.businessTypeData || {};
    if (btd.tableNumber) t += 'Table: ' + btd.tableNumber + '\n';
    t += sep + '\n';

    // Column widths
    const nameW = W === 32 ? 14 : 20;
    const qtyW  = W === 32 ? 4  : 6;
    const priceW = W === 32 ? 8  : 10;
    const hdr = 'Name'.padEnd(nameW) + 'Qty'.padStart(qtyW) + 'Price'.padStart(priceW);
    t += hdr + '\n';

    items.forEach(item => {
      const name = ((isHindi && item.nameHi) ? item.nameHi : item.name) || 'Unknown';
      const qty  = item.isLooseItem ? Number(item.quantity).toFixed(2) : String(Math.round(item.quantity));
      const price = Number(item.unitPrice).toFixed(2);
      const nameLine = name.length > nameW ? name.substring(0, nameW) : name.padEnd(nameW);
      t += nameLine + qty.padStart(qtyW) + price.padStart(priceW) + '\n';
      if (name.length > nameW) {
        t += name.substring(nameW, nameW * 2).padEnd(nameW) + '\n';
      }
    });

    t += sep + '\n';
    t += this.rpad('Subtotal:', 'Rs.' + Number(bill.subtotal).toFixed(2), W) + '\n';
    if (bill.taxTotal > 0) {
      const rate = settings?.taxRates?.[0]?.rate || 0;
      t += this.rpad(`Tax (${rate}%):`, 'Rs.' + Number(bill.taxTotal).toFixed(2), W) + '\n';
    }
    if (bill.discountTotal > 0) {
      t += this.rpad('Discount:', '-Rs.' + Number(bill.discountTotal).toFixed(2), W) + '\n';
    }
    t += ESC + 'E\x01';
    t += this.rpad('Grand Total:', 'Rs.' + Number(bill.grandTotal).toFixed(2), W) + '\n';
    t += ESC + 'E\x00';
    t += sep + '\n';

    // QR code for UPI
    if ((bill.paymentMethod === 'upi' || bill.paymentMethod === 'online') && settings?.upiId) {
      const upi = `upi://pay?pa=${settings.upiId}&pn=${encodeURIComponent(settings.businessName || '')}&am=${Number(bill.grandTotal).toFixed(2)}&cu=INR`;
      t += ESC + 'a\x01';
      t += GS + '(k' + String.fromCharCode(4, 0, 49, 65, 50, 0);
      t += GS + '(k' + String.fromCharCode(3, 0, 49, 67, 6);
      t += GS + '(k' + String.fromCharCode(3, 0, 49, 69, 49);
      const qLen = upi.length + 3;
      t += GS + '(k' + String.fromCharCode(qLen % 256, Math.floor(qLen / 256), 49, 80, 48) + upi;
      t += GS + '(k' + String.fromCharCode(3, 0, 49, 81, 48) + '\n';
    }

    // Footer
    t += ESC + 'a\x01';
    if (settings?.footerText) t += settings.footerText + '\n';
    t += '\n';
    // Cut
    t += GS + 'V\x41\x03';
    return t;
  }

  private buildKOTData(bill: any, settings: any, paperSize: PaperSize): string {
    const W = WIDTH[paperSize];
    const ESC = '\x1B', GS = '\x1D';
    const sep = '-'.repeat(W);
    const isHindi = settings?.receiptLanguage === 'hi';
    // Only new (unprinted) items
    const newItems = (bill.items || []).filter((i: any) => i.quantity > (i.kotPrintedQuantity || 0));
    let t = '';

    t += ESC + '@';
    t += ESC + 'a\x01' + ESC + 'E\x01' + GS + '!\x11';
    t += 'Kitchen Order\n';
    t += GS + '!\x00' + ESC + 'E\x00\n';
    t += ESC + 'a\x00';
    t += 'Date: ' + new Date().toLocaleString('en-IN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    }) + '\n';
    t += 'Bill: ' + (bill.billNumber || '').slice(-5) + '\n';
    const btd = bill.businessTypeData || {};
    if (btd.tableNumber) {
      const label = btd.tableType === 'parcel' ? 'Parcel' : 'Table';
      t += label + ': ' + btd.tableNumber + '\n';
    }
    t += sep + '\n';

    newItems.forEach((item: any) => {
      const name = ((isHindi && item.nameHi) ? item.nameHi : item.name) || 'Unknown';
      const newQty = item.quantity - (item.kotPrintedQuantity || 0);
      const qty = item.isLooseItem ? Number(newQty).toFixed(2) : String(Math.round(newQty));
      const note = item.note ? ' [' + item.note + ']' : '';
      t += name + ' X ' + qty + note + '\n';
    });

    t += sep + '\n\n';
    t += GS + 'V\x41\x03';
    return t;
  }

  private rpad(label: string, value: string, width: number): string {
    const total = label.length + value.length;
    const spaces = Math.max(1, width - total);
    return label + ' '.repeat(spaces) + value;
  }
}
