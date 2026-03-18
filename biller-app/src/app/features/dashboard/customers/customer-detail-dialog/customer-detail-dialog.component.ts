import { Component, Inject, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { CustomerService } from '../../../../core/services/customer.service';
import { SettingsService } from '../../../../core/services/settings.service';
import { BillService } from '../../../../core/services/bill.service';
import { CustomerWithDebts, CustomerDebt } from '../../../../core/models/customer.model';
import { BillDetailDialogComponent } from '../../bills/bill-detail-dialog/bill-detail-dialog.component';
import { forkJoin } from 'rxjs';

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
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatDividerModule,
    MatSnackBarModule,
    MatTooltipModule
  ],
  template: `
    @if (loading()) {
      <div class="loading-container">
        <mat-spinner diameter="40"></mat-spinner>
        <p>Loading customer details...</p>
      </div>
    } @else if (customer()) {
      <div class="dialog-header">
        <div class="customer-info">
          <h2 class="customer-name">{{ customer()!.name }}</h2>
          <span class="customer-phone">
            <mat-icon>phone</mat-icon>
            {{ customer()!.phone }}
          </span>
        </div>
        <div class="total-debt-container">
          <span class="debt-label">Total Debt</span>
          <mat-chip [class]="customer()!.totalDebt > 0 ? 'status-pending' : 'status-paid'">
            {{ formatCurrency(customer()!.totalDebt) }}
          </mat-chip>
        </div>
      </div>

      <mat-divider></mat-divider>

      <mat-dialog-content>
        <h3>Unpaid Bills</h3>

        @if (customer()!.debts.length === 0) {
          <div class="empty-state">
            <mat-icon>check_circle</mat-icon>
            <p>No unpaid bills</p>
          </div>
        } @else {
          <table mat-table [dataSource]="customer()!.debts" class="debts-table">
            <!-- Remaining Column -->
            <ng-container matColumnDef="remaining">
              <th mat-header-cell *matHeaderCellDef>Remaining</th>
              <td mat-cell *matCellDef="let debt" class="remaining-cell">
                {{ formatCurrency(debt.remainingAmount) }}
              </td>
            </ng-container>

            <!-- Date Column -->
            <ng-container matColumnDef="date">
              <th mat-header-cell *matHeaderCellDef>Date</th>
              <td mat-cell *matCellDef="let debt">{{ formatDate(debt.createdAt) }}</td>
            </ng-container>

            <!-- Pay Column -->
            <ng-container matColumnDef="pay">
              <th mat-header-cell *matHeaderCellDef>Pay</th>
              <td mat-cell *matCellDef="let debt">
                <div class="pay-cell">
                  <mat-form-field appearance="outline" class="pay-input">
                    <input matInput 
                           type="number" 
                           [value]="debt.remainingAmount"
                           (input)="setPaymentAmount(debt.billId, $any($event.target).value)"
                           [max]="debt.remainingAmount"
                           min="0">
                  </mat-form-field>
                  <button mat-icon-button color="primary" 
                          (click)="payDebt(debt); $event.stopPropagation()"
                          [disabled]="paying()"
                          matTooltip="Pay debt">
                    <mat-icon>payments</mat-icon>
                  </button>
                </div>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns;" 
                (click)="viewBillDetails(row)"
                class="clickable-row"
                matTooltip="Click to view bill details"></tr>
          </table>
        }
      </mat-dialog-content>

      <mat-dialog-actions>
        @if (customer()!.debts.length > 0) {
          <button mat-raised-button color="primary" 
                  (click)="payAllDebts()" 
                  [disabled]="paying()"
                  matTooltip="Pay all remaining debts">
            <mat-icon>payments</mat-icon>
            Pay All ({{ formatCurrency(customer()!.totalDebt) }})
          </button>
        }
        <button mat-raised-button color="accent" 
                class="pdf-button"
                (click)="downloadCustomerBillsPDF()" 
                [disabled]="generatingPDF()"
                matTooltip="Download detailed PDF report of all customer bills">
          <span class="button-content">
            @if (generatingPDF()) {
              <mat-spinner diameter="20"></mat-spinner>
              <span>Generating...</span>
            } @else {
              <mat-icon>picture_as_pdf</mat-icon>
              <span>PDF Report</span>
            }
          </span>
        </button>
        <span class="spacer"></span>
        <button mat-raised-button mat-dialog-close>Close</button>
      </mat-dialog-actions>
    }
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      max-width: 600px;
    }

    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 16px 24px;
      gap: 16px;
      flex-wrap: wrap;
    }

    .customer-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      flex: 1;

      .customer-name {
        margin: 0;
        font-size: 20px;
        font-weight: 500;
        word-break: break-word;
      }

      .customer-phone {
        display: flex;
        align-items: center;
        gap: 4px;
        color: var(--mdc-theme-text-secondary-on-background);
        font-size: 14px;

        mat-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
          flex-shrink: 0;
        }
      }
    }

    .total-debt-container {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
      flex-shrink: 0;

      .debt-label {
        font-size: 12px;
        color: var(--mdc-theme-text-secondary-on-background);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
    }

    h3 {
      margin: 16px 0 8px;
      font-size: 16px;
      font-weight: 500;
    }

    mat-dialog-content {
      padding-top: 0;
      min-height: 100px;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px;
      gap: 16px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px;
      color: var(--mdc-theme-text-secondary-on-background);

      mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        color: #4caf50;
      }
    }

    .table-container {
      overflow-x: auto;
    }

    .debts-table {
      width: 100%;
      min-width: 280px;

      .mat-mdc-row {
        &.clickable-row {
          cursor: pointer;
          transition: background-color 0.2s ease;

          &:hover {
            background-color: rgba(0, 0, 0, 0.04);
          }
        }
      }

      .remaining-cell {
        color: #f44336;
        font-weight: 500;
      }

      .pay-cell {
        display: flex;
        align-items: center;
        gap: 4px;

        .pay-input {
          width: 80px;

          ::ng-deep .mat-mdc-form-field-subscript-wrapper {
            display: none;
          }

          input {
            text-align: right;
          }
        }
      }
    }

    mat-chip {
      &.status-paid {
        --mdc-chip-elevated-container-color: rgba(76, 175, 80, 0.15);
        --mdc-chip-label-text-color: #4caf50;
      }

      &.status-pending {
        --mdc-chip-elevated-container-color: rgba(255, 152, 0, 0.15);
        --mdc-chip-label-text-color: #ff9800;
      }
    }

    mat-dialog-actions {
      display: flex;
      align-items: center;
      padding: 16px 24px;
      border-top: 1px solid var(--mat-divider-color);
      flex-wrap: wrap;
      gap: 8px;

      .spacer {
        flex: 1;
      }

      .pdf-button {
        .button-content {
          display: flex;
          align-items: center;
          gap: 8px;
        }
      }
    }

    /* Responsive */
    @media (max-width: 480px) {
      .dialog-header {
        padding: 12px 16px;
      }

      .customer-info .customer-name {
        font-size: 18px;
      }

      mat-dialog-content {
        padding: 0 16px 16px;
      }

      mat-dialog-actions {
        padding: 12px 16px;
      }

      .debts-table .pay-cell .pay-input {
        width: 60px;
      }
    }
  `]
})
export class CustomerDetailDialogComponent implements OnInit {
  private customerService = inject(CustomerService);
  private settingsService = inject(SettingsService);
  private billService = inject(BillService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  customer = signal<CustomerWithDebts | null>(null);
  loading = signal(true);
  paying = signal(false);
  generatingPDF = signal(false);
  paymentAmounts: Map<string, number> = new Map();

  displayedColumns = ['remaining', 'date', 'pay'];

  constructor(
    private dialogRef: MatDialogRef<CustomerDetailDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CustomerDetailDialogData
  ) {}

  ngOnInit(): void {
    this.loadCustomer();
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
          // Initialize payment amounts
          response.data.debts.forEach(debt => {
            this.paymentAmounts.set(debt.billId, debt.remainingAmount);
          });
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
    return new Date(dateString).toLocaleDateString();
  }

  setPaymentAmount(billId: string, value: string): void {
    const amount = parseFloat(value) || 0;
    this.paymentAmounts.set(billId, amount);
  }

  payDebt(debt: CustomerDebt): void {
    const amount = this.paymentAmounts.get(debt.billId) || 0;
    
    if (amount <= 0) {
      this.snackBar.open('Please enter a valid amount', 'Close', { duration: 3000 });
      return;
    }

    if (amount > debt.remainingAmount) {
      this.snackBar.open('Amount cannot exceed remaining debt', 'Close', { duration: 3000 });
      return;
    }

    this.paying.set(true);
    this.customerService.payDebt(this.data.customerId, debt.billId, amount).subscribe({
      next: (response) => {
        this.snackBar.open(response.message, 'Close', { duration: 3000 });
        this.loadCustomer();
        this.paying.set(false);
      },
      error: (error) => {
        this.snackBar.open(error.error?.message || 'Failed to process payment', 'Close', { duration: 3000 });
        this.paying.set(false);
      }
    });
  }

  payAllDebts(): void {
    const customerData = this.customer();
    if (!customerData || customerData.debts.length === 0) return;

    this.paying.set(true);
    let completed = 0;
    const total = customerData.debts.length;

    customerData.debts.forEach(debt => {
      this.customerService.payDebt(this.data.customerId, debt.billId, debt.remainingAmount).subscribe({
        next: () => {
          completed++;
          if (completed === total) {
            this.snackBar.open('All debts paid successfully!', 'Close', { duration: 3000 });
            this.loadCustomer();
            this.paying.set(false);
          }
        },
        error: (error) => {
          completed++;
          this.snackBar.open(error.error?.message || 'Failed to process some payments', 'Close', { duration: 3000 });
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
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - margin, yPos, { align: 'right' });
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
      const billHeaderText = `${new Date(bill.createdAt).toLocaleDateString()} | ${bill.paymentMethod || 'N/A'}`;
      
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
