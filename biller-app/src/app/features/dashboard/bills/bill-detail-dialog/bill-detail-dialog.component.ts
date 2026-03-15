import { Component, Inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';

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
    CurrencyPipe,
    DatePipe
  ],
  template: `
    <div class="dialog-container">
      <div class="dialog-header">
        <span class="title">Bill Details</span>
        <mat-chip [class]="'status-' + data.paymentStatus">
          <mat-icon>{{ getStatusIcon() }}</mat-icon>
          {{ data.paymentStatus | titlecase }}
        </mat-chip>
      </div>

      <div class="dialog-body">
        <div class="bill-info">
          <div class="info-row">
            <span class="label">Bill Number:</span>
            <span class="value bill-number">{{ data.billNumber }}</span>
          </div>
          <div class="info-row">
            <span class="label">Date & Time:</span>
            <span class="value">{{ data.createdAt | date:'medium' }}</span>
          </div>
          @if (data.customerName) {
            <div class="info-row">
              <span class="label">Customer:</span>
              <span class="value">{{ data.customerName }}</span>
            </div>
          }
          @if (data.customerPhone) {
            <div class="info-row">
              <span class="label">Phone:</span>
              <span class="value">{{ data.customerPhone }}</span>
            </div>
          }
          <div class="info-row">
            <span class="label">Payment Method:</span>
            <span class="value">
              <mat-icon class="payment-icon">{{ getPaymentIcon() }}</mat-icon>
              {{ data.paymentMethod | titlecase }}
            </span>
          </div>
        </div>

        <div class="items-section">
          <h4>Items ({{ data.items.length }})</h4>
          <div class="items-table">
            <div class="items-header">
              <span class="col-name">Item</span>
              <span class="col-qty">Qty</span>
              <span class="col-price">Price</span>
              <span class="col-total">Total</span>
            </div>
            @for (item of data.items; track item.productId) {
              <div class="items-row">
                <span class="col-name">{{ item.name }}</span>
                <span class="col-qty">{{ item.quantity }}</span>
                <span class="col-price">{{ item.unitPrice | currency:'INR' }}</span>
                <span class="col-total">{{ item.finalTotal | currency:'INR' }}</span>
              </div>
            }
          </div>
        </div>

        <div class="totals-section">
          <div class="total-row">
            <span>Subtotal</span>
            <span>{{ data.subtotal | currency:'INR' }}</span>
          </div>
          @if (data.discountTotal > 0) {
            <div class="total-row discount">
              <span>Discount</span>
              <span>-{{ data.discountTotal | currency:'INR' }}</span>
            </div>
          }
          @if (data.taxTotal > 0) {
            <div class="total-row">
              <span>Tax</span>
              <span>{{ data.taxTotal | currency:'INR' }}</span>
            </div>
          }
          <div class="total-row grand-total">
            <span>Grand Total</span>
            <span>{{ data.grandTotal | currency:'INR' }}</span>
          </div>
          @if (data.amountPaid !== data.grandTotal) {
            <div class="total-row">
              <span>Paid Amount</span>
              <span>{{ data.amountPaid | currency:'INR' }}</span>
            </div>
            <div class="total-row due">
              <span>Due Amount</span>
              <span>{{ data.grandTotal - data.amountPaid | currency:'INR' }}</span>
            </div>
          }
        </div>

        @if (data.notes) {
          <div class="notes-section">
            <h4>Notes</h4>
            <p>{{ data.notes }}</p>
          </div>
        }
      </div>

      <div class="dialog-footer">
        <button mat-button (click)="onClose()">Close</button>
        <button mat-flat-button color="primary" (click)="onPrint()">
          <mat-icon>print</mat-icon>
          Print
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
      max-height: 85vh;
      width: 480px;
      max-width: 95vw;
      
      @include m.mobile {
        width: 100vw;
        max-width: 100vw;
        max-height: 100vh;
      }
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      flex-shrink: 0;
      
      @include m.mobile {
        padding: 10px 8px;
      }

      .title {
        font-size: 18px;
        font-weight: 600;
        
        @include m.dark-theme {
          color: white;
        }
      }

      mat-chip {
        mat-icon {
          font-size: 14px;
          width: 14px;
          height: 14px;
          margin-right: 4px;
        }

        &.status-paid {
          --mdc-chip-elevated-container-color: #{rgba(v.$light-success, 0.15)};
          --mdc-chip-label-text-color: #{v.$light-success};

          @include m.dark-theme {
            --mdc-chip-elevated-container-color: #{rgba(v.$dark-success, 0.2)};
            --mdc-chip-label-text-color: #{v.$dark-success};
          }
        }

        &.status-pending {
          --mdc-chip-elevated-container-color: #{rgba(v.$light-warning, 0.15)};
          --mdc-chip-label-text-color: #{v.$light-warning};

          @include m.dark-theme {
            --mdc-chip-elevated-container-color: #{rgba(v.$dark-warning, 0.2)};
            --mdc-chip-label-text-color: #{v.$dark-warning};
          }
        }

        &.status-partial {
          --mdc-chip-elevated-container-color: #{rgba(v.$light-primary, 0.15)};
          --mdc-chip-label-text-color: #{v.$light-primary};

          @include m.dark-theme {
            --mdc-chip-elevated-container-color: #{rgba(v.$dark-primary, 0.2)};
            --mdc-chip-label-text-color: #{v.$dark-primary};
          }
        }
      }
    }

    .dialog-body {
      flex: 1;
      overflow-y: auto;
      padding: 0 16px 16px;
      
      @include m.mobile {
        padding: 0 8px 12px;
      }
      
      &::-webkit-scrollbar {
        width: 6px;
      }
      
      &::-webkit-scrollbar-track {
        background: transparent;
      }
      
      &::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.2);
        border-radius: 3px;
        
        @include m.dark-theme {
          background: rgba(255, 255, 255, 0.2);
        }
      }
    }

    .bill-info {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 16px;

      .info-row {
        display: flex;
        justify-content: space-between;
        align-items: center;

        .label {
          color: v.$light-text-secondary;
          font-size: 13px;
          
          @include m.dark-theme {
            color: rgba(255, 255, 255, 0.6);
          }
        }

        .value {
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;

          @include m.dark-theme {
            color: white;
          }

          &.bill-number {
            font-family: 'Roboto Mono', monospace;
            color: v.$light-primary;
            font-weight: 600;

            @include m.dark-theme {
              color: v.$dark-primary;
            }
          }

          .payment-icon {
            font-size: 16px;
            width: 16px;
            height: 16px;
          }
        }
      }
    }

    .items-section {
      margin-bottom: 16px;
      
      h4 {
        margin: 0 0 8px;
        font-weight: 600;
        font-size: 13px;
        color: v.$light-text-primary;

        @include m.dark-theme {
          color: white;
        }
      }

      .items-table {
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 8px;
        overflow: hidden;

        @include m.dark-theme {
          border-color: rgba(255, 255, 255, 0.1);
        }

        .items-header,
        .items-row {
          display: grid;
          grid-template-columns: 2fr 0.6fr 1fr 1fr;
          padding: 8px 12px;
          gap: 8px;
          align-items: center;
          
          @include m.mobile {
            padding: 8px;
            gap: 4px;
          }
        }

        .items-header {
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

          .col-qty,
          .col-price,
          .col-total {
            text-align: right;
          }
        }

        .items-row {
          border-top: 1px solid rgba(0, 0, 0, 0.06);
          font-size: 13px;

          @include m.dark-theme {
            border-color: rgba(255, 255, 255, 0.06);
            color: white;
          }

          .col-name {
            font-weight: 500;
          }

          .col-qty {
            text-align: center;
          }

          .col-price,
          .col-total {
            text-align: right;
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
    }

    .totals-section {
      display: flex;
      flex-direction: column;
      gap: 4px;

      .total-row {
        display: flex;
        justify-content: space-between;
        font-size: 13px;

        @include m.dark-theme {
          color: white;
        }

        &.discount {
          color: v.$light-success;

          @include m.dark-theme {
            color: v.$dark-success;
          }
        }

        &.grand-total {
          font-size: 16px;
          font-weight: 700;
          padding-top: 8px;
          margin-top: 4px;
          border-top: 1px solid rgba(0, 0, 0, 0.1);

          @include m.dark-theme {
            border-color: rgba(255, 255, 255, 0.1);
            color: white;
          }
        }

        &.due {
          color: v.$light-warning;

          @include m.dark-theme {
            color: v.$dark-warning;
          }
        }
      }
    }

    .notes-section {
      margin-top: 16px;
      padding: 12px;
      background: rgba(0, 0, 0, 0.03);
      border-radius: 8px;
      
      @include m.dark-theme {
        background: rgba(255, 255, 255, 0.03);
      }
      
      h4 {
        margin: 0 0 6px;
        font-weight: 600;
        font-size: 13px;

        @include m.dark-theme {
          color: white;
        }
      }

      p {
        margin: 0;
        color: v.$light-text-secondary;
        font-style: italic;
        font-size: 13px;

        @include m.dark-theme {
          color: rgba(255, 255, 255, 0.6);
        }
      }
    }

    .dialog-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 16px;
      flex-shrink: 0;
      
      @include m.mobile {
        padding: 10px 8px;
      }
      
      button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 36px;
        
        mat-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
        }
      }
      
      button[color="primary"] {
        background: v.$light-primary;
        color: white;
        
        @include m.dark-theme {
          background: v.$dark-primary;
          color: #1a1a2e;
        }
      }
    }

    @media (max-width: v.$breakpoint-sm) {
      .dialog-container {
        width: 100%;
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
