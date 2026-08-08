import { Component, Inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { Bill } from '../../../../core/models/bill.model';
import { RestaurantTable } from '../../../../core/models/hotel.model';
import { BillService } from '../../../../core/services/bill.service';
import { HotelService } from '../../../../core/services/hotel.service';
import { SettingsService } from '../../../../core/services/settings.service';

export interface TableActionDialogData {
  bill?: Bill;
  billId?: string;
  table?: RestaurantTable;
}

export interface TableActionDialogResult {
  settled?: boolean;
  saved?: boolean;
}

const PAYMENT_OPTIONS = [
  { value: 'cash',   label: 'Cash',       icon: 'payments' },
  { value: 'card',   label: 'Card',       icon: 'credit_card' },
  { value: 'online', label: 'Online/UPI', icon: 'qr_code_scanner' }
] as const;

@Component({
  selector: 'app-table-action-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  template: `
<div class="tad">

  <!-- Single merged header: table info + total + close -->
  <div class="tad-header">
    <div class="tad-header-top">
      <div class="tad-table-name">
        @if (table) {
          <mat-icon>{{ table.tableType === 'parcel' ? 'takeout_dining' : 'table_restaurant' }}</mat-icon>
          <span>{{ table.tableType === 'parcel' ? 'Parcel' : 'Table' }} {{ table.tableNumber }}</span>
        } @else {
          <mat-icon>receipt_long</mat-icon>
          <span>Bill Details</span>
        }
      </div>
      <span class="tad-badge tad-badge-{{ tableStatus }}">
        <mat-icon>{{ statusIcon }}</mat-icon>{{ statusLabel }}
      </span>
      <button mat-icon-button class="tad-x" (click)="onClose()">
        <mat-icon>close</mat-icon>
      </button>
    </div>
    @if (!loading() && bill(); as b) {
      <div class="tad-total-row">
        <span class="tad-total-label">Total Bill Amount</span>
        <span class="tad-total-amount">{{ settingsService.formatCurrency(b.grandTotal) }}</span>
      </div>
    }
  </div>

  @if (loading()) {
    <div class="tad-spinner"><mat-spinner diameter="36"></mat-spinner></div>
  }

  @if (!loading() && bill(); as b) {
    <mat-divider></mat-divider>
    <div class="tad-pay-section">
      <p class="tad-section-label">Select Payment Method</p>
      <div class="tad-pay-cards">
        @for (opt of paymentOptions; track opt.value) {
          <div class="tad-pay-card"
               [class.tad-pay-selected]="selectedPaymentMethod === opt.value"
               (click)="selectedPaymentMethod = opt.value">
            <mat-icon>{{ opt.icon }}</mat-icon>
            <span>{{ opt.label }}</span>
          </div>
        }
      </div>
    </div>
    <div class="tad-footer">
      @if (tableStatus === 'pending') {
        <button mat-stroked-button (click)="printBill()" [disabled]="saving()">
          <mat-icon>print</mat-icon> Print Bill
        </button>
        <button mat-flat-button color="primary" (click)="saveBill()" [disabled]="saving()">
          <mat-icon>save</mat-icon> Save Bill
        </button>
      }
      @if (tableStatus === 'unsettled') {
        <button mat-flat-button color="primary" (click)="settleTable()" [disabled]="saving()">
          <mat-icon>check_circle</mat-icon> Settle Table
        </button>
      }
      @if (tableStatus === 'paid') {
        <button mat-stroked-button (click)="printBill()" [disabled]="saving()">
          <mat-icon>print</mat-icon> Print Bill
        </button>
        <button mat-flat-button color="primary" (click)="savePaymentMethod()" [disabled]="saving()">
          <mat-icon>save</mat-icon> Save
        </button>
      }
    </div>
  }

</div>
  `,
  styles: [`
.tad { width: 460px; max-width: 95vw; display: flex; flex-direction: column; overflow: hidden; border-radius: 12px; }

/* ── Header (merged topbar + total) ── */
.tad-header {
  padding: 16px 16px 14px;
  background: #fff;
  border-bottom: 2px solid #e0e0e0;
}
:host-context(.dark-theme) .tad-header {
  background: #1e1e1e;
  border-bottom-color: rgba(255,255,255,0.12);
}

.tad-header-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.tad-table-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 16px;
  flex: 1;
  color: #212121;
}
.tad-table-name mat-icon { font-size: 20px; height: 20px; width: 20px; color: #555; }
:host-context(.dark-theme) .tad-table-name { color: rgba(255,255,255,0.87); }
:host-context(.dark-theme) .tad-table-name mat-icon { color: rgba(255,255,255,0.6); }

.tad-badge { display: inline-flex; align-items: center; gap: 3px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; white-space: nowrap; }
.tad-badge mat-icon { font-size: 13px; height: 13px; width: 13px; }
.tad-badge-pending   { background: #fff3e0; color: #e65100; }
.tad-badge-unsettled { background: #fffde7; color: #f57f17; }
.tad-badge-paid      { background: #e8f5e9; color: #2e7d32; }
:host-context(.dark-theme) .tad-badge-pending   { background: rgba(230,81,0,.22);   color: #ffab40; }
:host-context(.dark-theme) .tad-badge-unsettled { background: rgba(245,127,23,.22); color: #ffd740; }
:host-context(.dark-theme) .tad-badge-paid      { background: rgba(76,175,80,.22);  color: #66bb6a; }

.tad-x { flex-shrink: 0; }

/* ── Total amount (inside header, no background) ── */
.tad-total-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 4px 2px 0;
}
.tad-total-label { font-size: 12px; color: #757575; font-weight: 500; }
.tad-total-amount { font-size: 28px; font-weight: 800; color: #1565c0; letter-spacing: -.5px; }
:host-context(.dark-theme) .tad-total-label { color: rgba(255,255,255,0.5); }
:host-context(.dark-theme) .tad-total-amount { color: #90caf9; }

/* ── Loading ── */
.tad-spinner { display: flex; justify-content: center; padding: 40px; }

/* ── Payment method cards ── */
.tad-pay-section { padding: 14px 20px 10px; }
.tad-section-label { font-size: 11px; font-weight: 700; color: #9e9e9e; text-transform: uppercase; letter-spacing: .5px; margin: 0 0 10px; }

.tad-pay-cards { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }

.tad-pay-card { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 14px 8px; border-radius: 10px; border: 2px solid #e0e0e0; background: #fff; cursor: pointer; transition: border-color .15s, background .15s, box-shadow .15s; font-size: 12px; font-weight: 500; color: #555; text-align: center; user-select: none; width: 110px; min-width: 100px; }
.tad-pay-card mat-icon { font-size: 22px; height: 22px; width: 22px; color: #757575; }
.tad-pay-card:hover { border-color: #90caf9; background: #f3f8ff; }
.tad-pay-card.tad-pay-selected { border-color: #1565c0; background: #e3f2fd; color: #0d47a1; box-shadow: 0 2px 8px rgba(21,101,192,.2); }
.tad-pay-card.tad-pay-selected mat-icon { color: #1565c0; }

:host-context(.dark-theme) .tad-pay-card { background: #2d2d2d; border-color: rgba(255,255,255,0.14); color: rgba(255,255,255,0.7); }
:host-context(.dark-theme) .tad-pay-card mat-icon { color: rgba(255,255,255,0.5); }
:host-context(.dark-theme) .tad-pay-card:hover { border-color: #90caf9; background: rgba(144,202,249,.08); }
:host-context(.dark-theme) .tad-pay-card.tad-pay-selected { border-color: #90caf9; background: rgba(144,202,249,.15); color: #90caf9; box-shadow: 0 2px 8px rgba(144,202,249,.2); }
:host-context(.dark-theme) .tad-pay-card.tad-pay-selected mat-icon { color: #90caf9; }

/* ── Footer ── */
.tad-footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 20px 16px; border-top: 1px solid #e0e0e0; flex-wrap: wrap; }
:host-context(.dark-theme) .tad-footer { border-top-color: rgba(255,255,255,0.12); }
  `]
})
export class TableActionDialogComponent implements OnInit {
  bill = signal<Bill | null>(null);
  loading = signal(false);
  saving = signal(false);
  selectedPaymentMethod: string = 'cash';
  readonly paymentOptions = PAYMENT_OPTIONS;

  get table(): RestaurantTable | undefined { return this.data.table; }

  get tableStatus(): 'pending' | 'unsettled' | 'paid' {
    if (this.table?.status === 'unsettled') return 'unsettled';
    if (this.table?.status === 'occupied') return 'pending';
    const b = this.bill();
    if (b?.paymentStatus === 'paid') return 'paid';
    if (b?.billStatus === 'draft' || b?.billStatus === 'kot-printed') return 'pending';
    return 'paid';
  }

  get statusLabel(): string {
    const map = { pending: 'Pending', unsettled: 'Unsettled', paid: 'Paid' };
    return map[this.tableStatus];
  }

  get statusIcon(): string {
    const map = { pending: 'pending_actions', unsettled: 'hourglass_empty', paid: 'check_circle' };
    return map[this.tableStatus];
  }

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: TableActionDialogData,
    private dialogRef: MatDialogRef<TableActionDialogComponent>,
    private billService: BillService,
    private hotelService: HotelService,
    public settingsService: SettingsService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    if (this.data.bill) {
      this.bill.set(this.data.bill);
      this.selectedPaymentMethod = this.data.bill.paymentMethod || 'cash';
    } else if (this.data.billId) {
      this.loading.set(true);
      this.billService.getBillById(this.data.billId).subscribe({
        next: (res: any) => {
          this.bill.set(res.data);
          this.selectedPaymentMethod = res.data.paymentMethod || 'cash';
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.snackBar.open('Failed to load bill details', 'OK', { duration: 3000 });
        }
      });
    }
  }

  printBill(): void {
    const b = this.bill();
    if (!b) return;
    this.saving.set(true);
    this.billService.printBill(b.billId).subscribe({
      next: () => {
        this.saving.set(false);
        this.snackBar.open('Bill sent to printer', 'OK', { duration: 2000 });
      },
      error: (err: any) => {
        this.saving.set(false);
        this.snackBar.open(err.error?.message || 'Print failed', 'OK', { duration: 3000 });
      }
    });
  }

  saveBill(): void {
    const b = this.bill();
    if (!b) return;
    this.saving.set(true);
    this.billService.updateBill(b.billId, {
      paymentMethod: this.selectedPaymentMethod as any,
      paymentStatus: 'paid',
      amountPaid: b.grandTotal,
      billStatus: 'completed'
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.snackBar.open('Bill saved', 'OK', { duration: 2000 });
        this.dialogRef.close({ saved: true });
      },
      error: (err: any) => {
        this.saving.set(false);
        this.snackBar.open(err.error?.message || 'Save failed', 'OK', { duration: 3000 });
      }
    });
  }

  settleTable(): void {
    const b = this.bill();
    if (!b) return;
    this.saving.set(true);
    this.billService.updateBill(b.billId, {
      paymentMethod: this.selectedPaymentMethod as any,
      paymentStatus: 'paid',
      amountPaid: b.grandTotal,
      billStatus: 'completed'
    }).subscribe({
      next: () => {
        const tableId = this.data.table?.id ?? b.tableId;
        if (tableId) {
          this.hotelService.settleTable(tableId).subscribe({
            next: () => {
              this.saving.set(false);
              this.snackBar.open('Table settled successfully', 'OK', { duration: 2000 });
              this.dialogRef.close({ settled: true });
            },
            error: (err: any) => {
              this.saving.set(false);
              this.snackBar.open(err.error?.message || 'Failed to settle table', 'OK', { duration: 3000 });
            }
          });
        } else {
          this.saving.set(false);
          this.dialogRef.close({ settled: true });
        }
      },
      error: (err: any) => {
        this.saving.set(false);
        this.snackBar.open(err.error?.message || 'Failed to update bill', 'OK', { duration: 3000 });
      }
    });
  }

  savePaymentMethod(): void {
    const b = this.bill();
    if (!b) return;
    this.saving.set(true);
    this.billService.updateBill(b.billId, {
      paymentMethod: this.selectedPaymentMethod as any
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.snackBar.open('Payment method updated', 'OK', { duration: 2000 });
        this.dialogRef.close({ saved: true });
      },
      error: (err: any) => {
        this.saving.set(false);
        this.snackBar.open(err.error?.message || 'Failed to save', 'OK', { duration: 3000 });
      }
    });
  }

  onClose(): void { this.dialogRef.close(); }
}