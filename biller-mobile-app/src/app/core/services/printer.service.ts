import { Injectable, signal, inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
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
    } catch (err: any) {
      this.agentStatus.set('disconnected');
      throw new Error(err?.message || 'BillWise Print Agent is not running');
    }
  }

  disconnectAgent(): void {
    this.agentStatus.set('disconnected');
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
    if (this.shouldUseImagePipeline(settings)) {
      const imageBase64 = this.buildReceiptImage(bill, settings, cfg.paperSize);
      await this.sendImage(cfg.printerName, imageBase64, cfg.paperSize);
      return;
    }
    const data = this.buildReceiptData(bill, settings, cfg.paperSize);
    await this.sendRaw(cfg.printerName, data);
  }

  async printKOT(bill: any, settings: any): Promise<void> {
    const cfg = this.config();
    if (!cfg.printerName) throw new Error('No printer selected');
    if (this.shouldUseImagePipeline(settings)) {
      const imageBase64 = this.buildKOTImage(bill, settings, cfg.paperSize);
      await this.sendImage(cfg.printerName, imageBase64, cfg.paperSize);
      return;
    }
    const data = this.buildKOTData(bill, settings, cfg.paperSize);
    await this.sendRaw(cfg.printerName, data);
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
    const res = await fetch(`${this.AGENT_URL}${path}`, { ...init, cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Agent request failed (${res.status})`);
    }
    return res.json();
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

  private buildReceiptImage(bill: any, settings: any, paperSize: PaperSize): string {
    return this.renderReceiptTableToPngBase64(bill, settings, paperSize, true);
  }

  private buildKOTImage(bill: any, settings: any, paperSize: PaperSize): string {
    const lines: string[] = [];
    const newItems = (bill.items || []).filter((i: any) => i.quantity > (i.kotPrintedQuantity || 0));

    lines.push('Kitchen Order');
    lines.push('Date: ' + new Date().toLocaleString('en-IN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    }));
    lines.push('Bill: ' + (bill.billNumber || '').slice(-5));
    const btd = bill.businessTypeData || {};
    if (btd.tableNumber) {
      const label = btd.tableType === 'parcel' ? 'Parcel' : 'Table';
      lines.push(label + ': ' + btd.tableNumber);
    }
    lines.push('-');

    newItems.forEach((item: any) => {
      const name = this.pickItemName(item, true);
      const newQty = item.quantity - (item.kotPrintedQuantity || 0);
      const qty = item.isLooseItem ? Number(newQty).toFixed(2) : String(Math.round(newQty));
      const note = item.note ? ` [${item.note}]` : '';
      lines.push(`${name}  x ${qty}${note}`);
    });

    return this.renderLinesToPngBase64(lines, paperSize, true);
  }

  private renderReceiptTableToPngBase64(bill: any, settings: any, paperSize: PaperSize, isHindi: boolean): string {
    if (!this.isBrowser) {
      throw new Error('Image print is available only in browser runtime');
    }

    const width = paperSize === '2inch' ? 384 : 576;
    const padding = 12;
    const gap = 10;
    const comboW = paperSize === '2inch' ? 138 : 188;
    const nameW = width - (padding * 2) - comboW - gap;

    const fontFamily = isHindi
      ? '"Nirmala UI", "Mangal", "Arial Unicode MS", sans-serif'
      : '"Consolas", "Courier New", monospace';
    const titleSize = paperSize === '2inch' ? 30 : 34;
    const bodySize = paperSize === '2inch' ? 22 : 26;
    const smallSize = paperSize === '2inch' ? 18 : 21;
    const rowHeight = paperSize === '2inch' ? 32 : 36;

    const measureCanvas = document.createElement('canvas');
    const m = measureCanvas.getContext('2d');
    if (!m) throw new Error('Unable to initialize print canvas');
    m.font = `400 ${bodySize}px ${fontFamily}`;

    const items: any[] = bill.items || [];
    const itemNameLines = items.map(item => this.wrapText(m, this.pickItemName(item, isHindi), nameW));
    const addressLines = settings?.address ? this.wrapText(m, String(settings.address), width - (padding * 2)) : [];
    const footerLines = settings?.footerText ? this.wrapText(m, String(settings.footerText), width - (padding * 2)) : [];

    let height = 0;
    height += padding;
    height += titleSize + 8;
    height += addressLines.length * (smallSize + 6);
    if (settings?.taxNumber) height += smallSize + 6;
    if (settings?.phone) height += smallSize + 6;
    height += 8;
    height += (smallSize + 6) * 2;
    if (bill.businessTypeData?.tableNumber) height += smallSize + 6;
    height += 10;
    height += 1 + 8;
    height += rowHeight;
    height += 1 + 6;

    itemNameLines.forEach(lines => {
      height += Math.max(1, lines.length) * rowHeight + 3;
    });

    height += 1 + 8;
    height += rowHeight;
    if (Number(bill.taxTotal || 0) > 0) height += rowHeight;
    if (Number(bill.discountTotal || 0) > 0) height += rowHeight;
    height += rowHeight + 4;
    height += 1 + 8;
    height += footerLines.length * (smallSize + 6);
    height += padding;

    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = Math.max(300, Math.ceil(height * scale));

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Unable to initialize print canvas');

    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, Math.ceil(height));
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'top';

    const xName = padding;
    const xCombo = xName + nameW + gap;
    const right = width - padding;

    const drawSep = (yPos: number) => {
      ctx.beginPath();
      ctx.moveTo(padding, yPos);
      ctx.lineTo(right, yPos);
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
    };

    const drawRight = (text: string, x: number, yPos: number, w: number, font: string) => {
      ctx.font = font;
      const tw = ctx.measureText(text).width;
      ctx.fillText(text, Math.max(x, x + w - tw), yPos);
    };

    let y = padding;

    ctx.font = `700 ${titleSize}px ${fontFamily}`;
    const businessName = String(settings?.businessName || 'My Business');
    const titleW = ctx.measureText(businessName).width;
    ctx.fillText(businessName, Math.max(padding, (width - titleW) / 2), y);
    y += titleSize + 8;

    ctx.font = `400 ${smallSize}px ${fontFamily}`;
    addressLines.forEach(line => {
      const lw = ctx.measureText(line).width;
      ctx.fillText(line, Math.max(padding, (width - lw) / 2), y);
      y += smallSize + 6;
    });
    if (settings?.taxNumber) {
      const line = 'GST: ' + settings.taxNumber;
      const lw = ctx.measureText(line).width;
      ctx.fillText(line, Math.max(padding, (width - lw) / 2), y);
      y += smallSize + 6;
    }
    if (settings?.phone) {
      const line = 'Ph: ' + settings.phone;
      const lw = ctx.measureText(line).width;
      ctx.fillText(line, Math.max(padding, (width - lw) / 2), y);
      y += smallSize + 6;
    }

    y += 8;
    ctx.fillText('Date: ' + new Date(bill.createdAt).toLocaleString('en-IN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    }), padding, y);
    y += smallSize + 6;
    ctx.fillText('Bill: ' + (bill.billNumber || '').slice(-5), padding, y);
    y += smallSize + 6;

    const btd = bill.businessTypeData || {};
    if (btd.tableNumber) {
      ctx.fillText('Table: ' + btd.tableNumber, padding, y);
      y += smallSize + 6;
    }

    y += 4;
    drawSep(y);
    y += 8;

    ctx.font = `700 ${bodySize}px ${fontFamily}`;
    ctx.fillText('Name', xName, y);
    drawRight('Qty X Rate', xCombo, y, comboW, `700 ${bodySize}px ${fontFamily}`);
    y += rowHeight;

    drawSep(y);
    y += 6;

    ctx.font = `400 ${bodySize}px ${fontFamily}`;
    items.forEach((item, i) => {
      const nameLines = itemNameLines[i];
      const qty = item.isLooseItem ? Number(item.quantity || 0).toFixed(2) : String(Math.round(item.quantity || 0));
      const rate = Number(item.unitPrice || 0).toFixed(2);
      const combo = `${qty} X ${rate}`;

      const rowY = y;
      nameLines.forEach((line, index) => {
        ctx.fillText(line, xName, rowY + (index * rowHeight));
      });

      drawRight(combo, xCombo, rowY, comboW, `400 ${bodySize}px ${fontFamily}`);

      y += Math.max(1, nameLines.length) * rowHeight + 3;
    });

    drawSep(y);
    y += 8;

    const drawTotalLine = (label: string, value: string, bold = false) => {
      ctx.font = `${bold ? 700 : 400} ${bodySize}px ${fontFamily}`;
      ctx.fillText(label, xName, y);
      drawRight(value, xCombo, y, comboW, `${bold ? 700 : 400} ${bodySize}px ${fontFamily}`);
      y += rowHeight;
    };

    drawTotalLine('Subtotal', Number(bill.subtotal || 0).toFixed(2));
    if (Number(bill.taxTotal || 0) > 0) {
      const rate = settings?.taxRates?.[0]?.rate || 0;
      drawTotalLine(`Tax (${rate}%)`, Number(bill.taxTotal || 0).toFixed(2));
    }
    if (Number(bill.discountTotal || 0) > 0) {
      drawTotalLine('Discount', '-' + Number(bill.discountTotal || 0).toFixed(2));
    }
    drawTotalLine('Grand Total', Number(bill.grandTotal || 0).toFixed(2), true);

    y += 2;
    drawSep(y);
    y += 8;

    ctx.font = `400 ${smallSize}px ${fontFamily}`;
    footerLines.forEach(line => {
      const lw = ctx.measureText(line).width;
      ctx.fillText(line, Math.max(padding, (width - lw) / 2), y);
      y += smallSize + 6;
    });

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
    const fontSize = paperSize === '2inch' ? 22 : 26;
    const lineHeight = paperSize === '2inch' ? 32 : 36;

    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');
    if (!measureCtx) throw new Error('Unable to initialize print canvas');
    measureCtx.font = `400 ${fontSize}px ${fontFamily}`;

    const expanded: string[] = [];
    for (const line of lines) {
      if (line === '-') {
        expanded.push('-');
        continue;
      }
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
      if (line === '-') {
        ctx.beginPath();
        ctx.moveTo(padding, y + Math.floor(lineHeight / 2));
        ctx.lineTo(width - padding, y + Math.floor(lineHeight / 2));
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#000000';
        ctx.stroke();
      } else {
        const isTitle = idx === 0;
        if (isTitle) {
          ctx.font = `700 ${fontSize + 2}px ${fontFamily}`;
          const titleWidth = ctx.measureText(line).width;
          ctx.fillText(line, Math.max(padding, (width - titleWidth) / 2), y);
          ctx.font = `400 ${fontSize}px ${fontFamily}`;
        } else {
          ctx.fillText(line, padding, y);
        }
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
