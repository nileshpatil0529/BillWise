import { Component, Inject, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { CustomerService } from '../../../../core/services/customer.service';
import { SettingsService } from '../../../../core/services/settings.service';
import { BillService } from '../../../../core/services/bill.service';
import { CustomerWithDebts, CustomerDebt } from '../../../../core/models/customer.model';
import { BillDetailDialogComponent } from '../../bills/bill-detail-dialog/bill-detail-dialog.component';

// jsPDF import for PDF generation
declare var jspdf: any;

export interface CustomerDetailDialogData {
  customerId: string;
}

@Component({
  selector: 'app-customer-detail-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  template: `
    @if (loading()) {
      <div class="loading-container">
        <mat-spinner diameter="40"></mat-spinner>
      </div>
    } @else if (customer()) {
      <div class="dialog-container">
        <!-- Header with Avatar -->
        <div class="customer-header">
          <div class="avatar">
            <span>{{ getInitials(customer()!.name) }}</span>
          </div>
          <div class="customer-info">
            <h2 class="customer-name">{{ customer()!.name }}</h2>
            <a class="customer-phone" [href]="'tel:' + customer()!.phone">
              <mat-icon>phone</mat-icon>
              {{ customer()!.phone }}
            </a>
          </div>
          <button mat-icon-button class="close-btn" mat-dialog-close>
            <mat-icon>close</mat-icon>
          </button>
        </div>

        <!-- Debt Summary Card -->
        <div class="debt-card" [class.no-debt]="customer()!.totalDebt === 0">
          <div class="debt-icon">
            @if (customer()!.totalDebt > 0) {
              <mat-icon>account_balance_wallet</mat-icon>
            } @else {
              <mat-icon>check_circle</mat-icon>
            }
          </div>
          <div class="debt-info">
            <span class="debt-label">{{ customer()!.totalDebt > 0 ? 'Outstanding Balance' : 'Account Status' }}</span>
            <span class="debt-value">{{ customer()!.totalDebt > 0 ? formatCurrency(customer()!.totalDebt) : 'All Clear!' }}</span>
          </div>
        </div>

        <!-- Payment Section (if has debt) -->
        @if (customer()!.debts.length > 0) {
          <div class="payment-section">
            <div class="payment-header">
              <span class="section-title">Record Payment</span>
            </div>
            <div class="payment-form">
              <mat-form-field appearance="outline" class="payment-input">
                <mat-label>Amount</mat-label>
                <span matTextPrefix>{{ settingsService.settings().currency }}&nbsp;</span>
                <input matInput 
                       type="number" 
                       [ngModel]="payAllAmount()"
                       (ngModelChange)="payAllAmount.set($event)"
                       [max]="customer()!.totalDebt"
                       min="0"
                       step="0.01">
              </mat-form-field>
              <button mat-flat-button color="primary" 
                      (click)="payAllDebts()" 
                      [disabled]="paying() || payAllAmount() <= 0"
                      class="pay-button">
                @if (paying()) {
                  <mat-spinner diameter="20"></mat-spinner>
                } @else {
                  <ng-container>
                    <mat-icon>payments</mat-icon>
                    Pay
                  </ng-container>
                }
              </button>
            </div>
          </div>
        }

        <!-- Unpaid Bills Section -->
        <div class="bills-section">
          <span class="section-title">Unpaid Bills</span>
          
          @if (customer()!.debts.length === 0) {
            <div class="empty-state">
              <div class="empty-icon">
                <mat-icon>verified</mat-icon>
              </div>
              <span class="empty-text">No pending bills</span>
              <span class="empty-subtext">This customer has no outstanding payments</span>
            </div>
          } @else {
            <div class="bills-list">
              @for (debt of customer()!.debts; track debt.billId) {
                <div class="bill-item" (click)="viewBillDetails(debt)">
                  <div class="bill-info">
                    <span class="bill-date">{{ formatDate(debt.createdAt) }}</span>
                    <span class="bill-id">Bill #{{ debt.billId.slice(-6) }}</span>
                  </div>
                  <div class="bill-amount">
                    <span class="amount">{{ formatCurrency(debt.remainingAmount) }}</span>
                    <mat-icon class="chevron">chevron_right</mat-icon>
                  </div>
                </div>
              }
            </div>
          }
        </div>

        <!-- Bottom Actions -->
        <div class="bottom-actions">
          <button mat-stroked-button 
                  class="pdf-btn"
                  (click)="downloadCustomerBillsPDF()" 
                  [disabled]="generatingPDF() || customer()!.debts.length === 0">
            @if (generatingPDF()) {
              <mat-spinner diameter="18"></mat-spinner>
            } @else {
              <mat-icon>picture_as_pdf</mat-icon>
            }
            PDF Report
          </button>
          <button mat-flat-button color="primary" mat-dialog-close class="close-main-btn">
            Done
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    @use '../../../../../styles/variables' as v;
    @use '../../../../../styles/mixins' as m;

    :host {
      display: block;
      height: 100%;
    }

    .loading-container {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 200px;
    }

    .dialog-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--mat-dialog-container-background-color);
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
    }

    .avatar {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;

      span {
        font-size: 20px;
        font-weight: 600;
        text-transform: uppercase;
      }
    }

    .customer-info {
      flex: 1;
      min-width: 0;

      .customer-name {
        margin: 0;
        font-size: 18px;
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

    .close-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      color: rgba(255, 255, 255, 0.8);

      mat-icon {
        font-size: 22px;
      }
    }

    // ============================================
    // DEBT CARD
    // ============================================

    .debt-card {
      display: flex;
      align-items: center;
      gap: 16px;
      margin: 16px;
      padding: 20px;
      background: linear-gradient(135deg, #ff9800, #f57c00);
      border-radius: 12px;
      color: white;

      &.no-debt {
        background: linear-gradient(135deg, #4caf50, #388e3c);
      }

      .debt-icon {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.2);
        display: flex;
        align-items: center;
        justify-content: center;

        mat-icon {
          font-size: 26px;
          width: 26px;
          height: 26px;
        }
      }

      .debt-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;

        .debt-label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          opacity: 0.9;
        }

        .debt-value {
          font-size: 24px;
          font-weight: 700;
        }
      }
    }

    // ============================================
    // PAYMENT SECTION
    // ============================================

    .payment-section {
      margin: 0 16px 16px;
      padding: 16px;
      background: rgba(0, 0, 0, 0.03);
      border-radius: 12px;

      @include m.dark-theme {
        background: rgba(255, 255, 255, 0.05);
      }

      .payment-header {
        margin-bottom: 12px;
      }

      .payment-form {
        display: flex;
        gap: 12px;
        align-items: flex-start;

        .payment-input {
          flex: 1;

          ::ng-deep .mat-mdc-form-field-subscript-wrapper {
            display: none;
          }

          ::ng-deep .mat-mdc-text-field-wrapper {
            background: white;

            @include m.dark-theme {
              background: #424242;
            }
          }
        }

        .pay-button {
          height: 56px;
          min-width: 90px;
          display: flex;
          align-items: center;
          gap: 6px;

          mat-icon {
            font-size: 20px;
            width: 20px;
            height: 20px;
          }
        }
      }
    }

    .section-title {
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--mdc-theme-text-secondary-on-background);
    }

    // ============================================
    // BILLS SECTION
    // ============================================

    .bills-section {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 0 16px;
      min-height: 0;
      overflow: hidden;

      .section-title {
        margin-bottom: 12px;
        flex-shrink: 0;
      }
    }

    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;

      .empty-icon {
        width: 72px;
        height: 72px;
        border-radius: 50%;
        background: rgba(76, 175, 80, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 16px;

        mat-icon {
          font-size: 40px;
          width: 40px;
          height: 40px;
          color: #4caf50;
        }
      }

      .empty-text {
        font-size: 16px;
        font-weight: 600;
        color: inherit;
        margin-bottom: 4px;
      }

      .empty-subtext {
        font-size: 13px;
        color: var(--mdc-theme-text-secondary-on-background);
        text-align: center;
      }
    }

    .bills-list {
      flex: 1;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .bill-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      background: var(--mat-card-background-color, white);
      border-radius: 8px;
      cursor: pointer;
      transition: transform 0.1s ease;

      @include m.dark-theme {
        background: #2d2d2d;
      }

      &:active {
        transform: scale(0.98);
      }

      .bill-info {
        display: flex;
        flex-direction: column;
        gap: 2px;

        .bill-date {
          font-size: 14px;
          font-weight: 500;
        }

        .bill-id {
          font-size: 11px;
          color: var(--mdc-theme-text-secondary-on-background);
          font-family: monospace;
        }
      }

      .bill-amount {
        display: flex;
        align-items: center;
        gap: 4px;

        .amount {
          font-size: 15px;
          font-weight: 600;
          color: #f57c00;
        }

        .chevron {
          font-size: 20px;
          width: 20px;
          height: 20px;
          color: var(--mdc-theme-text-secondary-on-background);
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
        height: 48px;
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

      .pdf-btn {
        &:disabled {
          opacity: 0.5;
        }
      }
    }

    // ============================================
    // RESPONSIVE
    // ============================================

    @media (max-width: 768px) {
      ::ng-deep .customer-detail-dialog .mat-mdc-dialog-container {
        margin: 0 !important;
        max-width: 100vw !important;
        max-height: 100vh !important;
        border-radius: 0 !important;
      }
    }
  `]
})
export class CustomerDetailDialogComponent implements OnInit {
  private customerService = inject(CustomerService);
  public settingsService = inject(SettingsService);
  private billService = inject(BillService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  customer = signal<CustomerWithDebts | null>(null);
  loading = signal(true);
  paying = signal(false);
  generatingPDF = signal(false);
  payAllAmount = signal(0);

  constructor(
    private dialogRef: MatDialogRef<CustomerDetailDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CustomerDetailDialogData
  ) {}

  ngOnInit(): void {
    this.loadCustomer();
  }

  getInitials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  viewBillDetails(debt: CustomerDebt): void {
    // Fetch full bill details
    this.billService.getBillById(debt.billId).subscribe({
      next: (response) => {
        if (response.success) {
          this.dialog.open(BillDetailDialogComponent, {
            data: response.data,
            panelClass: 'bill-detail-dialog'
          });
        }
      },
      error: () => {
        this.snackBar.open('Failed to load bill details', 'Close', { duration: 3000 });
      }
    });
  }

  loadCustomer(): void {
    this.loading.set(true);
    this.customerService.getCustomerById(this.data.customerId).subscribe({
      next: (response) => {
        if (response.success) {
          this.customer.set(response.data);
          // Set default payment amount to total debt
          this.payAllAmount.set(response.data.totalDebt);
        }
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  formatCurrency(amount: number): string {
    return `${this.settingsService.settings().currency}${amount.toFixed(2)}`;
  }

  formatDate(dateString: string): string {
    const d = new Date(dateString);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  payAllDebts(): void {
    const customerData = this.customer();
    const amount = this.payAllAmount();
    
    if (!customerData || customerData.debts.length === 0) return;

    if (amount <= 0) {
      this.snackBar.open('Please enter a valid payment amount', 'Close', { duration: 3000 });
      return;
    }

    if (amount > customerData.totalDebt) {
      this.snackBar.open('Payment amount cannot exceed total debt', 'Close', { duration: 3000 });
      return;
    }

    this.paying.set(true);

    // Process payment by distributing amount across debts
    let remainingPayment = amount;
    const paymentsToMake: { billId: string, amount: number }[] = [];

    for (const debt of customerData.debts) {
      if (remainingPayment <= 0) break;
      
      const paymentForThisDebt = Math.min(remainingPayment, debt.remainingAmount);
      paymentsToMake.push({ billId: debt.billId, amount: paymentForThisDebt });
      remainingPayment -= paymentForThisDebt;
    }

    // Execute all payments
    let completed = 0;
    const total = paymentsToMake.length;
    let hasError = false;

    paymentsToMake.forEach(payment => {
      this.customerService.payDebt(this.data.customerId, payment.billId, payment.amount).subscribe({
        next: () => {
          completed++;
          if (completed === total) {
            if (!hasError) {
              this.snackBar.open('Payment processed successfully!', 'Close', { duration: 3000 });
            }
            this.loadCustomer();
            this.paying.set(false);
          }
        },
        error: (error) => {
          hasError = true;
          completed++;
          this.snackBar.open(error.error?.message || 'Failed to process payment', 'Close', { duration: 3000 });
          if (completed === total) {
            this.loadCustomer();
            this.paying.set(false);
          }
        }
      });
    });
  }

  downloadCustomerBillsPDF(): void {
    const customerData = this.customer();
    if (!customerData) return;

    this.generatingPDF.set(true);
    this.snackBar.open('Preparing PDF report...', '', { duration: 2000 });

    // Fetch all bills with efficient pagination
    this.fetchAllCustomerBills(customerData).then(allBills => {
      try {
        this.generatePDF(customerData, allBills);
        this.generatingPDF.set(false);
        this.snackBar.open('PDF generated successfully!', 'Close', { duration: 3000 });
      } catch (error) {
        console.error('PDF generation error:', error);
        this.generatingPDF.set(false);
        this.snackBar.open('Failed to generate PDF', 'Close', { duration: 3000 });
      }
    }).catch(error => {
      console.error('Failed to fetch bills:', error);
      this.generatingPDF.set(false);
      this.snackBar.open('Failed to fetch bill data', 'Close', { duration: 3000 });
    });
  }

  private async fetchAllCustomerBills(customer: CustomerWithDebts): Promise<any[]> {
    const limit = 100; // Fetch 100 bills at a time
    let allBills: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const response: any = await this.customerService.getCustomerBills(this.data.customerId, page, limit).toPromise();
        
        if (response.success && response.data.bills.length > 0) {
          allBills = allBills.concat(response.data.bills);
          hasMore = response.data.hasMore;
          page++;
          
          // Show progress
          if (hasMore) {
            this.snackBar.open(`Fetched ${allBills.length} bills...`, '', { duration: 1000 });
          }
        } else {
          hasMore = false;
        }
      } catch (error) {
        console.error('Error fetching bills page:', page, error);
        throw error;
      }
    }

    return allBills;
  }

  private generatePDF(customer: CustomerWithDebts, bills: any[]): void {
    const doc = new jspdf.jsPDF();
    const settings = this.settingsService.settings();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    let yPos = margin;

    // Helper function for PDF currency
    const formatPdfCurrency = (amount: number): string => {
      return `Rs. ${amount.toFixed(2)}`;
    };

    // ===== HEADER =====
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(settings.businessName || 'Business Name', margin, yPos);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    let rightY = yPos - 3;
    if (settings.phone) {
      doc.text(settings.phone, pageWidth - margin, rightY, { align: 'right' });
      rightY += 3.5;
    }
    if (settings.email) {
      doc.text(settings.email, pageWidth - margin, rightY, { align: 'right' });
    }
    
    yPos += 10;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 10;

    // ===== CUSTOMER DETAILS =====
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Customer Bills Report', margin, yPos);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${this.formatDate(new Date().toISOString())}`, pageWidth - margin, yPos, { align: 'right' });
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Customer: ${customer.name}`, margin, yPos);
    yPos += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(`Phone: ${customer.phone}`, margin, yPos);
    yPos += 10;

    // Filter only pending and partial bills
    const unpaidBills = bills.filter(b => b.paymentStatus === 'pending' || b.paymentStatus === 'partial');

    // ===== SUMMARY =====
    const totalPaid = unpaidBills.reduce((sum, b) => sum + (b.amountPaid || 0), 0);
    const totalPending = unpaidBills.reduce((sum, b) => sum + ((b.grandTotal || 0) - (b.amountPaid || 0)), 0);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary', margin, yPos);
    yPos += 5;

    (doc as any).autoTable({
      startY: yPos,
      head: [['Metric', 'Value']],
      body: [
        ['Total Pending Amount', formatPdfCurrency(totalPending)],
        ['Total Paid Amount', formatPdfCurrency(totalPaid)],
        ['Number of Bills', unpaidBills.length.toString()]
      ],
      theme: 'grid',
      headStyles: { 
        fillColor: [41, 128, 185],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9
      },
      styles: { 
        fontSize: 9,
        cellPadding: 3
      },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: margin, right: margin }
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;

    // ===== BILL ITEMS TABLE =====
    // Check if we need a new page
    if (yPos > pageHeight - 40) {
      doc.addPage();
      yPos = margin;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Bill Details', margin, yPos);
    yPos += 5;

    // Prepare all rows (bill headers + items)
    const allRows: any[] = [];
    
    unpaidBills.forEach((bill, index) => {
      // Add bill header row
      const billNumberText = bill.billNumber || bill.billId.substring(0, 12);
      const billHeaderText = `${this.formatDate(bill.createdAt)} | ${bill.paymentMethod || 'N/A'}`;
      
      allRows.push([
        { content: billNumberText, colSpan: 2, styles: { fontStyle: 'bold', fillColor: [245, 245, 245] } },
        { content: billHeaderText, colSpan: 2, styles: { fontStyle: 'bold', fillColor: [245, 245, 245], halign: 'right' } }
      ]);

      // Add item rows
      if (bill.items && bill.items.length > 0) {
        bill.items.forEach((item: any) => {
          allRows.push([
            item.name || item.productName || 'N/A',
            item.quantity?.toString() || '0',
            formatPdfCurrency(item.unitPrice || 0),
            formatPdfCurrency(item.itemTotal || item.finalTotal || 0)
          ]);
        });
      } else {
        allRows.push([
          { content: 'No items available', colSpan: 4, styles: { textColor: [120, 120, 120], fontStyle: 'italic' } }
        ]);
      }
    });

    (doc as any).autoTable({
      startY: yPos,
      head: [['ITEM', 'QTY', 'PRICE', 'TOTAL']],
      body: allRows,
      theme: 'grid',
      headStyles: { 
        fillColor: [100, 181, 246],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'left'
      },
      styles: { 
        fontSize: 8,
        cellPadding: 3,
        textColor: [0, 0, 0]
      },
      columnStyles: {
        0: { cellWidth: 'auto', halign: 'left' },
        1: { halign: 'center', cellWidth: 25 },
        2: { halign: 'right', cellWidth: 40 },
        3: { halign: 'right', cellWidth: 40 }
      },
      margin: { left: margin, right: margin },
      tableWidth: 'auto',
      didDrawPage: (data: any) => {
        // Add page numbers
        const pageCount = doc.internal.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(
          `Page ${data.pageNumber} of ${pageCount}`,
          pageWidth / 2,
          pageHeight - 10,
          { align: 'center' }
        );
      }
    });

    // ===== FOOTER =====
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 120, 120);
      if (settings.taxNumber) {
        doc.text(`Tax No: ${settings.taxNumber}`, margin, pageHeight - 5);
      }
    }

    // Save the PDF
    const fileName = `customer_${customer.name.replace(/\s+/g, '_')}_bills_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
  }
}
