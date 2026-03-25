import { Component, Inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { Bill, BillItem } from '../../../../core/models/bill.model';
import { BillService } from '../../../../core/services/bill.service';
import { SettingsService } from '../../../../core/services/settings.service';

@Component({
  selector: 'app-bill-detail-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    DatePipe
  ],
  template: `
    <div class="dialog-container">
      <!-- Header with Customer Info or Bill Header -->
      @if (data.customerName) {
        <div class="customer-header">
          <div class="avatar">
            <span>{{ getInitials(data.customerName) }}</span>
          </div>
          <div class="customer-info">
            <span class="customer-name">{{ data.customerName }}</span>
            @if (data.customerPhone) {
              <a class="customer-phone" [href]="'tel:' + data.customerPhone">
                <mat-icon>phone</mat-icon>
                {{ data.customerPhone }}
              </a>
            }
          </div>
          <button mat-icon-button class="close-btn" (click)="onClose()">
            <mat-icon>close</mat-icon>
          </button>
        </div>
      } @else {
        <div class="simple-header">
          <span class="title">Bill Details</span>
          <button mat-icon-button class="close-btn" (click)="onClose()">
            <mat-icon>close</mat-icon>
          </button>
        </div>
      }

      <!-- Bill Info Card -->
      <div class="bill-card">
        <div class="bill-row">
          <span class="bill-label">Bill #</span>
          <span class="bill-number">{{ data.billNumber }}</span>
        </div>
        <div class="bill-row">
          <span class="bill-label">Date</span>
          <span class="bill-value">{{ data.createdAt | date:'dd MMM yyyy, HH:mm' }}</span>
        </div>
        <div class="bill-row">
          <span class="bill-label">Payment</span>
          <span class="bill-value payment">
            <mat-icon>{{ getPaymentIcon() }}</mat-icon>
            {{ data.paymentMethod | titlecase }}
          </span>
        </div>
        <div class="bill-row">
          <span class="bill-label">Status</span>
          <span class="status-badge" [class]="'status-' + data.paymentStatus">
            {{ data.paymentStatus | titlecase }}
          </span>
        </div>
      </div>

      <!-- Items Section -->
      <div class="items-section">
        <span class="section-title">Items ({{ data.items.length }})</span>
        <div class="items-list">
          @for (item of data.items; track item.productId) {
            <div class="item-row">
              <div class="item-info">
                <span class="item-name">{{ item.name }}</span>
                <span class="item-meta">{{ item.quantity }} × {{ formatCurrency(item.unitPrice) }}</span>
              </div>
              <span class="item-total">{{ formatCurrency(item.finalTotal) }}</span>
            </div>
          }
        </div>
      </div>

      <!-- Totals Section -->
      <div class="totals-section">
        <div class="total-row">
          <span>Subtotal</span>
          <span>{{ formatCurrency(data.subtotal) }}</span>
        </div>
        @if (data.discountTotal > 0) {
          <div class="total-row discount">
            <span>Discount</span>
            <span>-{{ formatCurrency(data.discountTotal) }}</span>
          </div>
        }
        @if (data.taxTotal > 0) {
          <div class="total-row">
            <span>Tax</span>
            <span>{{ formatCurrency(data.taxTotal) }}</span>
          </div>
        }
        <div class="total-row grand">
          <span>Grand Total</span>
          <span>{{ formatCurrency(data.grandTotal) }}</span>
        </div>
        @if (data.amountPaid !== data.grandTotal) {
          <div class="total-row">
            <span>Paid Amount</span>
            <span>{{ formatCurrency(data.amountPaid) }}</span>
          </div>
          <div class="total-row due">
            <span>Due Amount</span>
            <span>{{ formatCurrency(data.grandTotal - data.amountPaid) }}</span>
          </div>
        }
      </div>

      @if (data.notes) {
        <div class="notes-section">
          <span class="section-title">Notes</span>
          <p>{{ data.notes }}</p>
        </div>
      }

      <!-- Bottom Actions -->
      <div class="bottom-actions">
        <button mat-stroked-button (click)="onClose()">
          Close
        </button>
        <button mat-flat-button color="primary" (click)="onPrint()" [disabled]="printing">
          @if (printing) {
            <span>Printing...</span>
          } @else {
            <ng-container>
              <mat-icon>print</mat-icon>
              Print
            </ng-container>
          }
        </button>
      </div>
    </div>
  `,
  styles: [`
    @use '../../../../../styles/variables' as v;
    @use '../../../../../styles/mixins' as m;

    :host {
      display: block;
    }

    .dialog-container {
      display: flex;
      flex-direction: column;
      max-height: 90vh;
      width: 420px;
      max-width: 100vw;
      background: var(--mat-dialog-container-background-color);

      @media (max-width: 600px) {
        width: 100%;
        max-width: 100%;
        max-height: 100dvh;
      }
    }

    // ============================================
    // CUSTOMER HEADER
    // ============================================

    .customer-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      background: linear-gradient(135deg, #1976d2, #1565c0);
      color: white;
      position: relative;

      @include m.dark-theme {
        background: linear-gradient(135deg, #424242, #303030);
      }

      .avatar {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;

        span {
          font-size: 18px;
          font-weight: 600;
          text-transform: uppercase;
        }
      }

      .customer-info {
        flex: 1;
        min-width: 0;

        .customer-name {
          display: block;
          font-size: 17px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .customer-phone {
          display: flex;
          align-items: center;
          gap: 4px;
          color: rgba(255, 255, 255, 0.85);
          font-size: 13px;
          text-decoration: none;
          margin-top: 2px;

          mat-icon {
            font-size: 14px;
            width: 14px;
            height: 14px;
          }
        }
      }
    }

    .simple-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid var(--mat-divider-color);

      .title {
        font-size: 18px;
        font-weight: 600;

        @include m.dark-theme {
          color: white;
        }
      }
    }

    .close-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      color: rgba(255, 255, 255, 0.8);

      .simple-header & {
        position: static;
        color: inherit;
      }
    }

    // ============================================
    // BILL CARD
    // ============================================

    .bill-card {
      margin: 16px;
      padding: 16px;
      background: rgba(0, 0, 0, 0.03);
      border-radius: 12px;

      @include m.dark-theme {
        background: rgba(255, 255, 255, 0.05);
      }

      .bill-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 0;

        &:not(:last-child) {
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);

          @include m.dark-theme {
            border-color: rgba(255, 255, 255, 0.06);
          }
        }
      }

      .bill-label {
        font-size: 13px;
        color: v.$light-text-secondary;

        @include m.dark-theme {
          color: v.$dark-text-secondary;
        }
      }

      .bill-number {
        font-family: monospace;
        font-size: 13px;
        font-weight: 600;
        color: v.$light-primary;

        @include m.dark-theme {
          color: v.$dark-primary;
        }
      }

      .bill-value {
        font-size: 13px;
        font-weight: 500;

        @include m.dark-theme {
          color: white;
        }

        &.payment {
          display: flex;
          align-items: center;
          gap: 6px;

          mat-icon {
            font-size: 16px;
            width: 16px;
            height: 16px;
          }
        }
      }

      .status-badge {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        padding: 4px 10px;
        border-radius: 12px;

        &.status-paid {
          background: rgba(76, 175, 80, 0.15);
          color: #4caf50;
        }

        &.status-pending {
          background: rgba(255, 152, 0, 0.15);
          color: #ff9800;
        }

        &.status-partial {
          background: rgba(33, 150, 243, 0.15);
          color: #2196f3;
        }
      }
    }

    // ============================================
    // ITEMS SECTION
    // ============================================

    .section-title {
      display: block;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: v.$light-text-secondary;
      margin-bottom: 12px;
      padding: 0 16px;

      @include m.dark-theme {
        color: v.$dark-text-secondary;
      }
    }

    .items-section {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .items-list {
      flex: 1;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      max-height: 200px;
      margin: 0 16px;
      border: 1px solid v.$light-divider;
      border-radius: 8px;

      @include m.dark-theme {
        border-color: v.$dark-divider;
      }
    }

    .item-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px;

      &:not(:last-child) {
        border-bottom: 1px solid v.$light-divider;

        @include m.dark-theme {
          border-color: v.$dark-divider;
        }
      }

      .item-info {
        flex: 1;
        min-width: 0;

        .item-name {
          display: block;
          font-size: 14px;
          font-weight: 500;

          @include m.dark-theme {
            color: white;
          }
        }

        .item-meta {
          font-size: 12px;
          color: v.$light-text-secondary;

          @include m.dark-theme {
            color: v.$dark-text-secondary;
          }
        }
      }

      .item-total {
        font-size: 14px;
        font-weight: 600;
        color: v.$light-primary;
        flex-shrink: 0;

        @include m.dark-theme {
          color: v.$dark-primary;
        }
      }
    }

    // ============================================
    // TOTALS SECTION
    // ============================================

    .totals-section {
      margin: 16px;
      padding: 16px;
      background: rgba(0, 0, 0, 0.03);
      border-radius: 12px;

      @include m.dark-theme {
        background: rgba(255, 255, 255, 0.05);
      }

      .total-row {
        display: flex;
        justify-content: space-between;
        font-size: 13px;
        padding: 4px 0;

        @include m.dark-theme {
          color: white;
        }

        &.discount {
          color: v.$light-success;

          @include m.dark-theme {
            color: v.$dark-success;
          }
        }

        &.grand {
          font-size: 16px;
          font-weight: 700;
          padding-top: 12px;
          margin-top: 8px;
          border-top: 1px solid v.$light-divider;

          @include m.dark-theme {
            border-color: v.$dark-divider;
          }
        }

        &.due {
          color: v.$light-warning;
          font-weight: 600;

          @include m.dark-theme {
            color: v.$dark-warning;
          }
        }
      }
    }

    // ============================================
    // NOTES SECTION
    // ============================================

    .notes-section {
      margin: 0 16px 16px;
      padding: 12px;
      background: rgba(0, 0, 0, 0.03);
      border-radius: 8px;

      @include m.dark-theme {
        background: rgba(255, 255, 255, 0.05);
      }

      .section-title {
        padding: 0;
        margin-bottom: 8px;
      }

      p {
        margin: 0;
        font-size: 13px;
        color: v.$light-text-secondary;
        font-style: italic;

        @include m.dark-theme {
          color: v.$dark-text-secondary;
        }
      }
    }

    // ============================================
    // BOTTOM ACTIONS
    // ============================================

    .bottom-actions {
      display: flex;
      gap: 12px;
      padding: 16px;
      border-top: 1px solid var(--mat-divider-color);
      flex-shrink: 0;

      button {
        flex: 1;
        height: 44px;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;

        mat-icon {
          font-size: 20px;
          width: 20px;
          height: 20px;
        }
      }
    }

    // ============================================
    // RESPONSIVE
    // ============================================

    @media (max-width: 480px) {
      .dialog-container {
        width: 100vw;
        max-height: 100vh;
        border-radius: 0;
      }

      .bill-card,
      .totals-section,
      .notes-section {
        margin-left: 12px;
        margin-right: 12px;
      }

      .section-title,
      .items-list {
        margin-left: 12px;
        margin-right: 12px;
      }
    }
  `]
})
export class BillDetailDialogComponent {
  printing = false;

  constructor(
    public dialogRef: MatDialogRef<BillDetailDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Bill,
    private billService: BillService,
    private settingsService: SettingsService,
    private snackBar: MatSnackBar
  ) {}

  getInitials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  formatCurrency(amount: number): string {
    return `${this.settingsService.settings().currency}${amount.toFixed(2)}`;
  }

  getPaymentIcon(): string {
    switch (this.data.paymentMethod) {
      case 'cash': return 'payments';
      case 'card': return 'credit_card';
      case 'online': return 'qr_code';
      case 'debt': return 'account_balance_wallet';
      default: return 'payment';
    }
  }

  onClose(): void {
    this.dialogRef.close();
  }

  onPrint(): void {
    this.printing = true;
    this.billService.printBill(this.data.billId).subscribe({
      next: (response: any) => {
        this.printing = false;
        if (response.success) {
          this.snackBar.open('Bill sent to printer', 'Close', { duration: 3000 });
        }
      },
      error: (error: any) => {
        this.printing = false;
        const message = error.error?.message || 'Failed to print bill';
        this.snackBar.open(message, 'Close', { duration: 5000 });
      }
    });
  }
}
