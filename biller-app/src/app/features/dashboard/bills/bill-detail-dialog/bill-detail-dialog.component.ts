import { Component, Inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';

import { Bill, BillItem } from '../../../../core/models/bill.model';

@Component({
  selector: 'app-bill-detail-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDividerModule,
    CurrencyPipe,
    DatePipe
  ],
  template: `
    <div class="bill-detail-container">
      <!-- Header -->
      <div class="header" [class]="'status-' + data.paymentStatus">
        <div class="header-left">
          <div class="bill-number-section">
            <span class="label">Invoice</span>
            <span class="bill-number">{{ data.billNumber }}</span>
          </div>
        </div>
        <div class="header-right">
          <div class="status-badge" [class]="'status-' + data.paymentStatus">
            <mat-icon>{{ getStatusIcon() }}</mat-icon>
            {{ data.paymentStatus | titlecase }}
          </div>
          <button mat-icon-button class="close-btn" (click)="onClose()">
            <mat-icon>close</mat-icon>
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="content">
        <!-- Info Cards -->
        <div class="info-cards">
          <div class="info-card">
            <mat-icon class="card-icon">calendar_today</mat-icon>
            <div class="card-content">
              <span class="card-label">Date</span>
              <span class="card-value">{{ data.createdAt | date:'dd MMM yyyy' }}</span>
              <span class="card-sub">{{ data.createdAt | date:'hh:mm a' }}</span>
            </div>
          </div>

          <div class="info-card">
            <mat-icon class="card-icon">{{ getPaymentIcon() }}</mat-icon>
            <div class="card-content">
              <span class="card-label">Payment</span>
              <span class="card-value">{{ data.paymentMethod | titlecase }}</span>
            </div>
          </div>

          @if (data.customerName) {
            <div class="info-card wide">
              <mat-icon class="card-icon">person</mat-icon>
              <div class="card-content">
                <span class="card-label">Customer</span>
                <span class="card-value">{{ data.customerName }}</span>
                @if (data.customerPhone) {
                  <span class="card-sub">{{ data.customerPhone }}</span>
                }
              </div>
            </div>
          }
        </div>

        <!-- Items Section -->
        <div class="items-section">
          <div class="section-title">
            <mat-icon>receipt_long</mat-icon>
            <span>Items</span>
            <span class="item-count">{{ data.items.length }}</span>
          </div>

          <div class="items-table">
            <div class="items-header">
              <span class="col-name">Item</span>
              <span class="col-qty">Qty</span>
              <span class="col-price">Rate</span>
              <span class="col-total">Amount</span>
            </div>
            <div class="items-body">
              @for (item of data.items; track item.productId; let i = $index) {
                <div class="items-row" [class.alternate]="i % 2 === 1">
                  <span class="col-name">{{ item.name }}</span>
                  <span class="col-qty">{{ item.quantity }}</span>
                  <span class="col-price">{{ item.unitPrice | currency:'INR':'symbol':'1.0-0' }}</span>
                  <span class="col-total">{{ item.finalTotal | currency:'INR':'symbol':'1.0-0' }}</span>
                </div>
              }
            </div>
          </div>
        </div>

        <!-- Summary Section -->
        <div class="summary-section">
          <div class="summary-row">
            <span>Subtotal</span>
            <span>{{ data.subtotal | currency:'INR':'symbol':'1.2-2' }}</span>
          </div>

          @if (data.discountTotal > 0) {
            <div class="summary-row discount">
              <span><mat-icon>sell</mat-icon> Discount</span>
              <span>-{{ data.discountTotal | currency:'INR':'symbol':'1.2-2' }}</span>
            </div>
          }

          @if (data.taxTotal > 0) {
            <div class="summary-row">
              <span>Tax</span>
              <span>{{ data.taxTotal | currency:'INR':'symbol':'1.2-2' }}</span>
            </div>
          }

          <mat-divider></mat-divider>

          <div class="grand-total-row">
            <span>Grand Total</span>
            <span class="amount">{{ data.grandTotal | currency:'INR':'symbol':'1.2-2' }}</span>
          </div>

          @if (data.amountPaid !== data.grandTotal) {
            <div class="payment-info">
              <div class="summary-row paid">
                <span>Paid</span>
                <span>{{ data.amountPaid | currency:'INR':'symbol':'1.2-2' }}</span>
              </div>
              <div class="summary-row due">
                <span>Balance Due</span>
                <span>{{ data.grandTotal - data.amountPaid | currency:'INR':'symbol':'1.2-2' }}</span>
              </div>
            </div>
          }
        </div>

        <!-- Notes Section -->
        @if (data.notes) {
          <div class="notes-section">
            <div class="section-title small">
              <mat-icon>sticky_note_2</mat-icon>
              <span>Notes</span>
            </div>
            <p class="notes-text">{{ data.notes }}</p>
          </div>
        }
      </div>

      <!-- Footer Actions -->
      <div class="footer">
        <button mat-stroked-button (click)="onClose()">Close</button>
        <button mat-flat-button color="primary" (click)="onPrint()">
          <mat-icon>print</mat-icon>
          Print Receipt
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

    .bill-detail-container {
      display: flex;
      flex-direction: column;
      max-height: 90vh;
      overflow: hidden;
    }

    // Header
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px;
      background: linear-gradient(135deg, v.$light-primary 0%, darken(v.$light-primary, 10%) 100%);
      color: white;

      @include m.dark-theme {
        background: linear-gradient(135deg, v.$dark-primary 0%, darken(v.$dark-primary, 10%) 100%);
        color: #1a1a2e;
      }

      &.status-paid {
        background: linear-gradient(135deg, #43a047 0%, #2e7d32 100%);
      }

      &.status-pending {
        background: linear-gradient(135deg, #fb8c00 0%, #ef6c00 100%);
      }

      &.status-partial {
        background: linear-gradient(135deg, #1e88e5 0%, #1565c0 100%);
      }

      .header-left {
        .bill-number-section {
          display: flex;
          flex-direction: column;
          gap: 4px;

          .label {
            font-size: 12px;
            opacity: 0.9;
            text-transform: uppercase;
            letter-spacing: 1px;
          }

          .bill-number {
            font-size: 20px;
            font-weight: 700;
            font-family: 'Roboto Mono', monospace;
            letter-spacing: 0.5px;
          }
        }
      }

      .header-right {
        display: flex;
        align-items: center;
        gap: 12px;

        .status-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 20px;
          font-size: 13px;
          font-weight: 600;
          backdrop-filter: blur(4px);

          mat-icon {
            font-size: 16px;
            width: 16px;
            height: 16px;
          }
        }

        .close-btn {
          color: inherit;
          opacity: 0.8;

          &:hover {
            opacity: 1;
            background: rgba(255, 255, 255, 0.1);
          }
        }
      }
    }

    // Content
    .content {
      flex: 1;
      overflow-y: auto;
      padding: 20px 24px;
      background: #f8f9fa;

      @include m.dark-theme {
        background: #1a1a2e;
      }

      @include m.custom-scrollbar;
    }

    // Info Cards
    .info-cards {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-bottom: 20px;

      @media (max-width: 500px) {
        grid-template-columns: 1fr;
      }
    }

    .info-card {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 16px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);

      @include m.dark-theme {
        background: #252540;
      }

      &.wide {
        grid-column: span 2;

        @media (max-width: 500px) {
          grid-column: span 1;
        }
      }

      .card-icon {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(v.$light-primary, 0.1);
        border-radius: 10px;
        color: v.$light-primary;
        font-size: 18px;

        @include m.dark-theme {
          background: rgba(v.$dark-primary, 0.15);
          color: v.$dark-primary;
        }
      }

      .card-content {
        display: flex;
        flex-direction: column;
        gap: 2px;

        .card-label {
          font-size: 11px;
          color: v.$light-text-secondary;
          text-transform: uppercase;
          letter-spacing: 0.5px;

          @include m.dark-theme {
            color: rgba(255, 255, 255, 0.5);
          }
        }

        .card-value {
          font-size: 14px;
          font-weight: 600;
          color: v.$light-text-primary;

          @include m.dark-theme {
            color: white;
          }
        }

        .card-sub {
          font-size: 12px;
          color: v.$light-text-secondary;

          @include m.dark-theme {
            color: rgba(255, 255, 255, 0.5);
          }
        }
      }
    }

    // Section Title
    .section-title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      font-weight: 600;
      font-size: 14px;
      color: v.$light-text-primary;

      @include m.dark-theme {
        color: white;
      }

      &.small {
        font-size: 13px;
        margin-bottom: 8px;
      }

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: v.$light-primary;

        @include m.dark-theme {
          color: v.$dark-primary;
        }
      }

      .item-count {
        margin-left: auto;
        padding: 2px 10px;
        background: v.$light-primary;
        color: white;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 500;

        @include m.dark-theme {
          background: v.$dark-primary;
          color: #1a1a2e;
        }
      }
    }

    // Items Section
    .items-section {
      margin-bottom: 20px;

      .items-table {
        background: white;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);

        @include m.dark-theme {
          background: #252540;
        }
      }

      .items-header {
        display: grid;
        grid-template-columns: 2fr 0.6fr 1fr 1fr;
        padding: 12px 16px;
        background: v.$light-primary;
        color: white;
        font-weight: 600;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;

        @include m.dark-theme {
          background: v.$dark-primary;
          color: #1a1a2e;
        }

        .col-qty, .col-price, .col-total {
          text-align: right;
        }
      }

      .items-body {
        max-height: 180px;
        overflow-y: auto;
        @include m.custom-scrollbar;
      }

      .items-row {
        display: grid;
        grid-template-columns: 2fr 0.6fr 1fr 1fr;
        padding: 12px 16px;
        font-size: 13px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.05);

        @include m.dark-theme {
          border-color: rgba(255, 255, 255, 0.05);
          color: white;
        }

        &:last-child {
          border-bottom: none;
        }

        &.alternate {
          background: rgba(0, 0, 0, 0.02);

          @include m.dark-theme {
            background: rgba(255, 255, 255, 0.02);
          }
        }

        .col-name {
          font-weight: 500;
        }

        .col-qty {
          text-align: center;
        }

        .col-price, .col-total {
          text-align: right;
          font-family: 'Roboto Mono', monospace;
        }

        .col-total {
          font-weight: 600;
          color: v.$light-primary;

          @include m.dark-theme {
            color: v.$dark-primary;
          }
        }
      }
    }

    // Summary Section
    .summary-section {
      background: white;
      border-radius: 12px;
      padding: 16px 20px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);

      @include m.dark-theme {
        background: #252540;
      }

      mat-divider {
        margin: 12px 0;
      }

      .summary-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 0;
        font-size: 14px;
        color: v.$light-text-primary;

        @include m.dark-theme {
          color: white;
        }

        span:last-child {
          font-family: 'Roboto Mono', monospace;
        }

        &.discount {
          color: v.$light-success;

          @include m.dark-theme {
            color: v.$dark-success;
          }

          span:first-child {
            display: flex;
            align-items: center;
            gap: 4px;

            mat-icon {
              font-size: 14px;
              width: 14px;
              height: 14px;
            }
          }
        }

        &.paid {
          color: v.$light-success;

          @include m.dark-theme {
            color: v.$dark-success;
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

      .grand-total-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 0;
        font-size: 16px;
        font-weight: 700;
        color: v.$light-text-primary;

        @include m.dark-theme {
          color: white;
        }

        .amount {
          font-size: 20px;
          font-family: 'Roboto Mono', monospace;
          color: v.$light-primary;

          @include m.dark-theme {
            color: v.$dark-primary;
          }
        }
      }

      .payment-info {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px dashed rgba(0, 0, 0, 0.1);

        @include m.dark-theme {
          border-color: rgba(255, 255, 255, 0.1);
        }
      }
    }

    // Notes Section
    .notes-section {
      margin-top: 16px;
      background: white;
      border-radius: 12px;
      padding: 14px 16px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);

      @include m.dark-theme {
        background: #252540;
      }

      .notes-text {
        margin: 0;
        font-size: 13px;
        color: v.$light-text-secondary;
        font-style: italic;
        line-height: 1.5;

        @include m.dark-theme {
          color: rgba(255, 255, 255, 0.6);
        }
      }
    }

    // Footer
    .footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 16px 24px;
      background: white;
      border-top: 1px solid rgba(0, 0, 0, 0.08);

      @include m.dark-theme {
        background: #1a1a2e;
        border-color: rgba(255, 255, 255, 0.08);
      }

      button {
        min-width: 100px;
        height: 40px;
        font-weight: 500;

        mat-icon {
          margin-right: 6px;
        }
      }
    }

    // Responsive
    @media (max-width: 500px) {
      .header {
        padding: 16px;
      }

      .content {
        padding: 16px;
      }

      .footer {
        padding: 12px 16px;
      }

      .items-section .items-header,
      .items-section .items-row {
        grid-template-columns: 1.5fr 0.5fr 1fr 1fr;
        padding: 10px 12px;
        font-size: 12px;
      }
    }
  `]
})
export class BillDetailDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<BillDetailDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: Bill
  ) {}

  getStatusIcon(): string {
    switch (this.data.paymentStatus) {
      case 'paid': return 'check_circle';
      case 'pending': return 'schedule';
      case 'partial': return 'hourglass_empty';
      default: return 'help';
    }
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
    // Placeholder for print functionality
    window.print();
  }
}
