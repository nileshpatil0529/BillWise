import { Injectable, signal, inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import * as QRCode from 'qrcode';
import { PrinterConfig, PaperSize } from '../models/settings.model';

// Paper widths in characters
const WIDTH: Record<PaperSize, number> = { '2inch': 32, '3inch': 48 };

@Injectable({ providedIn: 'root' })
export class PrinterService {
  private readonly API_URL = `${environment.apiUrl}/printer-config`;
  private readonly AGENT_URL = 'http://127.0.0.1:32145';
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  config = signal<PrinterConfig>({ printerName: null, paperSize: '3inch', enabled: false });
  agentStatus = signal<'unchecked' | 'connected' | 'disconnected' | 'loading'>('unchecked');
  availablePrinters = signal<string[]>([]);
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private wakeListenerAttached = false;

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

  // ─── Local Print Agent ─────────────────────────────────────────────────────

  async connectAgent(): Promise<void> {
    if (!this.isBrowser) return;
    this.agentStatus.set('loading');
    try {
      await this.fetchAgent('/health');
      this.agentStatus.set('connected');
      await this.refreshPrinters();
      this.startHealthCheck();
      this.setupWakeListener();
    } catch (err: any) {
      this.agentStatus.set('disconnected');
      throw new Error(err?.message || 'BillWise Print Agent is not running');
    }
  }

  disconnectAgent(): void {
    this.stopHealthCheck();
    this.agentStatus.set('disconnected');
  }

  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthCheckInterval = setInterval(async () => {
      if (this.agentStatus() !== 'connected') { this.stopHealthCheck(); return; }
      try {
        await fetch(`${this.AGENT_URL}/health`, { cache: 'no-store' });
      } catch {
        this.agentStatus.set('disconnected');
        this.stopHealthCheck();
      }
    }, 30_000);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval !== null) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private setupWakeListener(): void {
    if (!this.isBrowser || this.wakeListenerAttached) return;
    this.wakeListenerAttached = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.agentStatus() !== 'connected') {
        this.connectAgent().catch(() => {});
      }
    });
  }

  async refreshPrinters(): Promise<string[]> {
    try {
      const response = await this.fetchAgent('/printers');
      const printers = Array.isArray(response?.printers) ? response.printers : [];

      this.availablePrinters.set(printers);
      return printers;
    } catch (err: any) {
      console.error('Print Agent refreshPrinters error:', err);
      this.agentStatus.set('disconnected');
      this.availablePrinters.set([]);
      return [];
    }
  }

  isReady(): boolean {
    return (
      this.agentStatus() === 'connected' &&
      this.config().enabled &&
      !!this.config().printerName
    );
  }

  // ─── ESC/POS Print ─────────────────────────────────────────────────────────

  async printReceipt(bill: any, settings: any): Promise<void> {
    const cfg = this.config();
    if (!cfg.printerName) throw new Error('No printer selected');
    const imageBase64 = this.buildReceiptImage(bill, settings, cfg.paperSize);
    await this.sendImage(cfg.printerName, imageBase64, cfg.paperSize);
  }

  async printKOT(bill: any, settings: any): Promise<void> {
    const cfg = this.config();
    if (!cfg.printerName) throw new Error('No printer selected');
    const imageBase64 = this.buildKOTImage(bill, settings, cfg.paperSize);
    await this.sendImage(cfg.printerName, imageBase64, cfg.paperSize);
  }

  private async sendRaw(printerName: string, escData: string): Promise<void> {
    const response = await this.fetchAgent('/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printerName, data: escData })
    });
    if (!response?.success) {
      throw new Error(response?.message || 'Print failed');
    }
  }

  private async sendImage(printerName: string, imageBase64: string, paperSize: PaperSize): Promise<void> {
    const response = await this.fetchAgent('/print-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printerName, imageBase64, paperSize })
    });
    if (!response?.success) {
      throw new Error(response?.message || 'Image print failed');
    }
  }

  private async fetchAgent(path: string, init?: RequestInit): Promise<any> {
    try {
      const res = await fetch(`${this.AGENT_URL}${path}`, { ...init, cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Agent request failed (${res.status})`);
      }
      return res.json();
    } catch (err) {
      this.agentStatus.set('disconnected');
      throw err;
    }
  }

  private shouldUseImagePipeline(settings: any): boolean {
    return settings?.receiptLanguage === 'hi';
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

    // 3-column table: Items | Qty | Tip (item note)
    const itemW = W === 32 ? 16 : 22;
    const qtyW  = W === 32 ? 4  : 6;
    const tipW  = W - itemW - qtyW;
    t += 'Items'.padEnd(itemW) + 'Qty'.padStart(qtyW) + ' ' + 'Tip'.padEnd(tipW - 1) + '\n';
    t += sep + '\n';

    newItems.forEach((item: any) => {
      const name = ((isHindi && item.nameHi) ? item.nameHi : item.name) || 'Unknown';
      const newQty = item.quantity - (item.kotPrintedQuantity || 0);
      const qty = item.isLooseItem ? Number(newQty).toFixed(2) : String(Math.round(newQty));
      const tip = (item.note || '').substring(0, tipW - 1);
      const nameLine = name.length > itemW ? name.substring(0, itemW) : name.padEnd(itemW);
      t += nameLine + qty.padStart(qtyW) + ' ' + tip + '\n';
      if (name.length > itemW) {
        t += name.substring(itemW).padEnd(itemW) + '\n';
      }
    });

    t += sep + '\n\n';
    t += GS + 'V\x41\x03';
    return t;
  }

  private buildReceiptImage(bill: any, settings: any, paperSize: PaperSize): string {
    return this.renderReceiptTableToPngBase64(bill, settings, paperSize, settings?.receiptLanguage === 'hi');
  }

  private buildKOTImage(bill: any, settings: any, paperSize: PaperSize): string {
    return this.renderKOTTableToPngBase64(bill, paperSize, settings?.kotLanguage === 'hi');
  }

  private renderKOTTableToPngBase64(bill: any, paperSize: PaperSize, isHindi: boolean): string {
    if (!this.isBrowser) throw new Error('Image print is available only in browser runtime');

    const newItems = (bill.items || []).filter((i: any) => i.quantity > (i.kotPrintedQuantity || 0));
    const width = paperSize === '2inch' ? 384 : 576;
    const padding = paperSize === '2inch' ? 8 : 10;
    const innerW = width - (padding * 2);
    const fontFamily = isHindi
      ? '"Nirmala UI", "Mangal", "Arial Unicode MS", sans-serif'
      : '"Tahoma", "Arial", sans-serif';
    const titleSize = paperSize === '2inch' ? 28 : 34;
    const bodySize = paperSize === '2inch' ? 22 : 28;
    const smallSize = paperSize === '2inch' ? 18 : 22;
    const rowHeight = paperSize === '2inch' ? 30 : 38;

    // Column proportions: Items 50% | Qty 15% | Tip 35%
    const colQtyW  = Math.round(innerW * 0.15);
    const colTipW  = Math.round(innerW * 0.35);
    const colItemW = innerW - colQtyW - colTipW;

    const measureCanvas = document.createElement('canvas');
    const m = measureCanvas.getContext('2d')!;
    m.font = `400 ${bodySize}px ${fontFamily}`;
    const itemNameLines = newItems.map((item: any) => this.wrapText(m, this.pickItemName(item, isHindi), colItemW - 6));

    let height = padding + titleSize + 6 + (smallSize + 4) * 2 + rowHeight * 2;
    itemNameLines.forEach((lines: string[]) => { height += Math.max(1, lines.length) * rowHeight; });
    height += rowHeight + padding;

    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = Math.max(200, Math.ceil(height * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, Math.ceil(height));
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'top';

    const x0 = padding, x1 = x0 + colItemW, x2 = x1 + colQtyW, x3 = x2 + colTipW;
    const drawH = (yPos: number) => {
      ctx.beginPath(); ctx.moveTo(x0, yPos); ctx.lineTo(x3, yPos);
      ctx.lineWidth = 1; ctx.strokeStyle = '#000'; ctx.stroke();
    };
    const drawV = (xPos: number, y1: number, y2: number) => {
      ctx.beginPath(); ctx.moveTo(xPos, y1); ctx.lineTo(xPos, y2);
      ctx.lineWidth = 1; ctx.strokeStyle = '#000'; ctx.stroke();
    };

    let y = padding;
    drawH(y);
    ctx.font = `700 ${titleSize}px ${fontFamily}`;
    const titleW = ctx.measureText('Kitchen Order').width;
    ctx.fillText('Kitchen Order', Math.max(x0 + 4, x0 + (innerW - titleW) / 2), y + 4);
    y += titleSize + 6;
    drawH(y);

    const btd = bill.businessTypeData || {};
    ctx.font = `700 ${smallSize}px ${fontFamily}`;
    ctx.fillText(`Bill: ${(bill.billNumber || '').slice(-5)}`, x0 + 4, y + 4);
    if (btd.tableNumber) {
      const label = btd.tableType === 'parcel' ? 'Parcel' : 'Table';
      ctx.fillText(`${label}: ${btd.tableNumber}`, Math.round(x3 / 2), y + 4);
    }
    y += smallSize + 4;
    const dateStr = new Date().toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
    ctx.fillText(dateStr, x0 + 4, y + 4);
    y += smallSize + 4;
    drawH(y);

    // Column header
    const tableStartY = y;
    ctx.font = `700 ${bodySize}px ${fontFamily}`;
    ctx.fillText('Items', x0 + 4, y + 4);
    ctx.fillText('Qty', x1 + 4, y + 4);
    ctx.fillText('Tip', x2 + 4, y + 4);
    y += rowHeight;
    drawH(y);

    ctx.font = `500 ${bodySize}px ${fontFamily}`;
    newItems.forEach((item: any, i: number) => {
      const nameLines: string[] = itemNameLines[i];
      const newQty = item.quantity - (item.kotPrintedQuantity || 0);
      const qty = item.isLooseItem ? Number(newQty).toFixed(2) : String(Math.round(newQty));
      const rowY = y;
      nameLines.forEach((line: string, li: number) => ctx.fillText(line, x0 + 4, rowY + 4 + li * rowHeight));
      ctx.fillText(qty, x1 + 4, rowY + 4);
      if (item.note) ctx.fillText(String(item.note), x2 + 4, rowY + 4);
      y += Math.max(1, nameLines.length) * rowHeight;
    });
    y += padding; // bottom padding inside KOT box (same as top)
    drawH(y);

    drawV(x0, tableStartY, y); drawV(x1, tableStartY, y);
    drawV(x2, tableStartY, y); drawV(x3, tableStartY, y);
    drawV(x0, padding, y); drawV(x3, padding, y);
    drawH(padding);

    return this.toHighContrastPngBase64(canvas);
  }

  private renderReceiptTableToPngBase64(bill: any, settings: any, paperSize: PaperSize, isHindi: boolean): string {
    if (!this.isBrowser) {
      throw new Error('Image print is available only in browser runtime');
    }

    const width = paperSize === '2inch' ? 384 : 576;
    const padding = paperSize === '2inch' ? 8 : 10;
    const innerW = width - (padding * 2);
    const colQtyW = Math.round(innerW * 0.14);
    const colRateW = Math.round(innerW * 0.19);
    const colAmtW = Math.round(innerW * 0.21);
    const colParticularW = innerW - colQtyW - colRateW - colAmtW;

    const fontFamily = isHindi
      ? '"Nirmala UI", "Mangal", "Arial Unicode MS", sans-serif'
      : '"Tahoma", "Arial", sans-serif';
    const titleSize = paperSize === '2inch' ? 28 : 34;
    const bodySize = paperSize === '2inch' ? 22 : 28;
    const smallSize = paperSize === '2inch' ? 18 : 22;
    const rowHeight = paperSize === '2inch' ? 30 : 38;

    const measureCanvas = document.createElement('canvas');
    const m = measureCanvas.getContext('2d');
    if (!m) throw new Error('Unable to initialize print canvas');
    m.font = `400 ${bodySize}px ${fontFamily}`;

    const items: any[] = bill.items || [];
    const itemNameLines = items.map(item => this.wrapText(m, this.pickItemName(item, isHindi), colParticularW - 10));

    let height = 0;
    height += padding;
    height += titleSize + 6;
    height += (smallSize + 4) * 2;
    height += rowHeight + 4;
    height += rowHeight;
    height += rowHeight;

    itemNameLines.forEach(lines => {
      height += Math.max(1, lines.length) * rowHeight;
    });

    height += rowHeight;
    if (Number(bill.taxTotal || 0) > 0) height += rowHeight;
    if (Number(bill.discountTotal || 0) > 0) height += rowHeight;
    height += rowHeight + 6;
    if (settings?.taxNumber) height += smallSize + 4;
    // Reserve space for QR code when online payment + UPI configured
    const showQr = bill.paymentMethod === 'online' && !!settings?.upiId;
    const qrDisplaySize = paperSize === '2inch' ? 120 : 160;
    if (showQr) height += qrDisplaySize + smallSize + 18;
    height += smallSize + 4;
    height += padding * 2; // top padding (outside) + bottom padding (inside + outside)

    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = Math.max(300, Math.ceil(height * scale));

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Unable to initialize print canvas');

    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, Math.ceil(height));
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'top';

    const x0 = padding;
    const x1 = x0 + colParticularW;
    const x2 = x1 + colQtyW;
    const x3 = x2 + colRateW;
    const x4 = x3 + colAmtW;
    const right = x4;
    const rightTextInset = 6;

    const drawRight = (text: string, x: number, yPos: number, w: number, font: string) => {
      ctx.font = font;
      const tw = ctx.measureText(text).width;
      ctx.fillText(text, Math.round(Math.max(x, x + w - tw - rightTextInset)), Math.round(yPos));
    };

    const drawH = (yPos: number, lw = 1) => {
      ctx.beginPath();
      ctx.moveTo(x0, yPos);
      ctx.lineTo(x4, yPos);
      ctx.lineWidth = lw;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
    };

    const drawV = (xPos: number, yStart: number, yEnd: number, lw = 1) => {
      ctx.beginPath();
      ctx.moveTo(xPos, yStart);
      ctx.lineTo(xPos, yEnd);
      ctx.lineWidth = lw;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
    };

    let y = padding;

    ctx.font = `700 ${titleSize}px ${fontFamily}`;
    // Outer border
    const topY = y;
    drawH(topY);

    // Business heading block
    ctx.font = `700 ${titleSize}px ${fontFamily}`;
    const heading = String(settings?.businessName || 'RESTAURANT').toUpperCase();
    const titleW = ctx.measureText(heading).width;
    ctx.fillText(heading, Math.max(x0 + 4, x0 + ((innerW - titleW) / 2)), y + 4);
    y += titleSize + 6;
    drawH(y);

    const dt = new Date(bill.createdAt || Date.now());
    const timeStr = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const dateStr = dt.toLocaleDateString('en-GB').replace(/\//g, '/');
    const btd = bill.businessTypeData || {};
    const tableNo = String(btd.tableNumber || '-');
    const billNo = String((bill.billNumber || '').slice(-5) || '-');

    ctx.font = `700 ${smallSize}px ${fontFamily}`;
    ctx.fillText(`TABLE NO :  ${tableNo}`, Math.round(x0 + 6), Math.round(y + 4));
    drawRight(`TIME:  ${timeStr}`, x1, y + 4, x4 - x1, `700 ${smallSize}px ${fontFamily}`);
    y += rowHeight;
    ctx.fillText(`NO :  ${billNo}`, Math.round(x0 + 6), Math.round(y + 4));
    drawRight(`DATE:  ${dateStr}`, x1, y + 4, x4 - x1, `700 ${smallSize}px ${fontFamily}`);
    y += rowHeight;
    drawH(y);

    // Column header row
    const tableStartY = y;
    ctx.font = `700 ${bodySize}px ${fontFamily}`;
    ctx.fillText('Particular', Math.round(x0 + 6), Math.round(y + 4));
    drawRight('Qty', x1, y + 4, colQtyW, `700 ${bodySize}px ${fontFamily}`);
    drawRight('Rate', x2, y + 4, colRateW, `700 ${bodySize}px ${fontFamily}`);
    drawRight('Amt.', x3, y + 4, colAmtW, `700 ${bodySize}px ${fontFamily}`);
    y += rowHeight;
    drawH(y);

    ctx.font = `500 ${bodySize}px ${fontFamily}`;
    items.forEach((item, i) => {
      const nameLines = itemNameLines[i];
      const qty = item.isLooseItem ? Number(item.quantity || 0).toFixed(2) : String(Math.round(item.quantity || 0));
      const rate = Number(item.unitPrice || 0).toFixed(0);
      const amt = Number((item.itemTotal ?? (Number(item.quantity || 0) * Number(item.unitPrice || 0))) || 0).toFixed(0);

      const rowY = y;
      nameLines.forEach((line, index) => {
        ctx.fillText(line, Math.round(x0 + 6), Math.round(rowY + 4 + (index * rowHeight)));
      });

      drawRight(qty, x1, rowY + 4, colQtyW, `500 ${bodySize}px ${fontFamily}`);
      drawRight(rate, x2, rowY + 4, colRateW, `500 ${bodySize}px ${fontFamily}`);
      drawRight(amt, x3, rowY + 4, colAmtW, `500 ${bodySize}px ${fontFamily}`);

      y += Math.max(1, nameLines.length) * rowHeight;
      if (i === items.length - 1) {
        drawH(y);
      }
    });

    // Vertical column lines across table section
    drawV(x0, tableStartY, y);
    drawV(x1, tableStartY, y);
    drawV(x2, tableStartY, y);
    drawV(x3, tableStartY, y);
    drawV(x4, tableStartY, y);

    const drawTotalLine = (label: string, value: string, bold = false) => {
      ctx.font = `${bold ? 700 : 400} ${bodySize}px ${fontFamily}`;
      ctx.fillText(label, Math.round(x0 + 6), Math.round(y + 4));
      drawRight(value, x3, y + 4, colAmtW, `${bold ? 700 : 400} ${bodySize}px ${fontFamily}`);
      y += rowHeight;
      drawH(y);
    };

    drawTotalLine('TOTAL', Number(bill.subtotal || 0).toFixed(0));
    if (Number(bill.taxTotal || 0) > 0) {
      const rate = settings?.taxRates?.[0]?.rate || 0;
      drawTotalLine(`Tax (${rate}%)`, Number(bill.taxTotal || 0).toFixed(0));
    }
    if (Number(bill.discountTotal || 0) > 0) {
      drawTotalLine('Discount', '-' + Number(bill.discountTotal || 0).toFixed(0));
    }
    drawTotalLine('NET AMT', Number(bill.grandTotal || 0).toFixed(0), true);

    ctx.font = `400 ${smallSize}px ${fontFamily}`;
    if (settings?.taxNumber) {
      ctx.fillText('Fssai : ' + settings.taxNumber, Math.round(x0 + 6), Math.round(y + 2));
      y += smallSize + 4;
    }

    // QR code before footer when online payment + UPI ID set
    if (showQr) {
      try {
        const upiStr = `upi://pay?pa=${settings.upiId}&pn=${encodeURIComponent(settings.businessName || '')}&am=${Number(bill.grandTotal).toFixed(2)}&cu=INR`;
        const qr = QRCode.create(upiStr, { errorCorrectionLevel: 'M' });
        const qrSize = qr.modules.size;
        const cellSize = Math.floor(qrDisplaySize / qrSize);
        const actualSz = cellSize * qrSize;
        const qrLeft = Math.floor((innerW - actualSz) / 2) + padding;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(qrLeft - 4, y + 2, actualSz + 8, actualSz + 8);
        ctx.fillStyle = '#000000';
        for (let row = 0; row < qrSize; row++) {
          for (let col = 0; col < qrSize; col++) {
            if (qr.modules.get(row, col)) {
              ctx.fillRect(qrLeft + col * cellSize, y + 4 + row * cellSize, cellSize, cellSize);
            }
          }
        }
        y += actualSz + 8;
        ctx.font = `700 ${smallSize}px ${fontFamily}`;
        const amtText = `Scan to Pay  Rs.${Number(bill.grandTotal).toFixed(2)}`;
        const amtW = ctx.measureText(amtText).width;
        ctx.fillText(amtText, Math.round(Math.max(x0 + 4, x0 + (innerW - amtW) / 2)), Math.round(y + 2));
        y += smallSize + 6;
        ctx.font = `400 ${smallSize}px ${fontFamily}`;
      } catch { /* skip if QR generation fails */ }
    }

    const thanks = (settings?.footerText || 'THANKS VISIT AGAIN').toUpperCase();
    const thanksW = ctx.measureText(thanks).width;
    ctx.fillText(thanks, Math.round(Math.max(x0 + 4, x0 + ((innerW - thanksW) / 2))), Math.round(y + 2));
    y += smallSize + 4;
    y += padding; // bottom padding inside receipt box (same as top)

    // Close outer border
    drawV(x0, topY, y);
    drawV(x4, topY, y);
    drawH(y);

    return this.toHighContrastPngBase64(canvas);
  }

  private toHighContrastPngBase64(canvas: HTMLCanvasElement): string {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      const fallback = canvas.toDataURL('image/png');
      return fallback.split(',')[1] || '';
    }

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const threshold = 168;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = (0.299 * r) + (0.587 * g) + (0.114 * b);
      const v = lum >= threshold ? 255 : 0;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl.split(',')[1] || '';
  }

  private renderLinesToPngBase64(lines: string[], paperSize: PaperSize, isHindi: boolean): string {
    if (!this.isBrowser) {
      throw new Error('Image print is available only in browser runtime');
    }

    const width = paperSize === '2inch' ? 384 : 576;
    const padding = 12;
    const maxTextWidth = width - (padding * 2);
    const fontFamily = isHindi ? '"Nirmala UI", "Mangal", "Arial Unicode MS", sans-serif' : '"Consolas", "Courier New", monospace';
    const fontSize = paperSize === '2inch' ? 26 : 32;
    const lineHeight = paperSize === '2inch' ? 38 : 46;

    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');
    if (!measureCtx) throw new Error('Unable to initialize print canvas');
    measureCtx.font = `400 ${fontSize}px ${fontFamily}`;

    const expanded: string[] = [];
    for (const line of lines) {
      if (line === '-') continue;
      const wrapped = this.wrapText(measureCtx, line, maxTextWidth);
      expanded.push(...wrapped);
    }

    const height = Math.max(200, padding * 2 + expanded.length * lineHeight + 12);
    const canvas = document.createElement('canvas');
    const scale = 2;
    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Unable to initialize print canvas');

    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#000000';
    ctx.font = `400 ${fontSize}px ${fontFamily}`;
    ctx.textBaseline = 'top';

    let y = padding;
    expanded.forEach((line, idx) => {
      const isTitle = idx === 0;
      if (isTitle) {
        ctx.font = `700 ${fontSize + 2}px ${fontFamily}`;
        const titleWidth = ctx.measureText(line).width;
        ctx.fillText(line, Math.max(padding, (width - titleWidth) / 2), y);
        ctx.font = `400 ${fontSize}px ${fontFamily}`;
      } else {
        ctx.fillText(line, padding, y);
      }
      y += lineHeight;
    });

    return this.toHighContrastPngBase64(canvas);
  }

  private wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!normalized) return [''];

    const words = normalized.split(' ');
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      const testLine = current ? `${current} ${word}` : word;
      if (ctx.measureText(testLine).width <= maxWidth) {
        current = testLine;
        continue;
      }

      if (current) {
        lines.push(current);
        current = word;
      } else {
        let chunk = '';
        for (const ch of word) {
          const testChunk = chunk + ch;
          if (ctx.measureText(testChunk).width <= maxWidth) {
            chunk = testChunk;
          } else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        current = chunk;
      }
    }

    if (current) lines.push(current);
    return lines;
  }

  private pickItemName(item: any, isHindi: boolean): string {
    if (isHindi && item?.nameHi) return String(item.nameHi);
    return String(item?.name || 'Unknown');
  }

  private rpad(label: string, value: string, width: number): string {
    const total = label.length + value.length;
    const spaces = Math.max(1, width - total);
    return label + ' '.repeat(spaces) + value;
  }
}
