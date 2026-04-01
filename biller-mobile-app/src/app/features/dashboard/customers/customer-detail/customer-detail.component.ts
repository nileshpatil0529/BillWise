import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';

import { CustomerService } from '../../../../core/services/customer.service';
import { SettingsService } from '../../../../core/services/settings.service';
import { BillService } from '../../../../core/services/bill.service';
import { CustomerWithDebts, CustomerDebt } from '../../../../core/models/customer.model';
import { Bill } from '../../../../core/models/bill.model';

// jsPDF import for PDF generation
declare var jspdf: any;

@Component({
  selector: 'app-customer-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDividerModule
  ],
  templateUrl: './customer-detail.component.html',
  styleUrl: './customer-detail.component.scss'
})
export class CustomerDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private customerService = inject(CustomerService);
  public settingsService = inject(SettingsService);
  private billService = inject(BillService);
  private snackBar = inject(MatSnackBar);

  customerId = '';
  customer = signal<CustomerWithDebts | null>(null);
  selectedBill = signal<Bill | null>(null);
  loading = signal(true);
  paying = signal(false);
  generatingPDF = signal(false);
  payAllAmount = signal(0);

  // Debts pagination state
  debtsPage = signal(1);
  hasMoreDebts = signal(false);
  loadingMoreDebts = signal(false);

  ngOnInit(): void {
    this.customerId = this.route.snapshot.paramMap.get('id') || '';
    if (this.customerId) {
      this.loadCustomer();
    } else {
      this.goBack();
    }
  }

  goBack(): void {
    this.location.back();
  }

  getInitials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  loadCustomer(): void {
    this.loading.set(true);
    this.customerService.getCustomerById(this.customerId).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.customer.set(response.data);
          this.payAllAmount.set(response.data.totalDebt);
          this.debtsPage.set(response.data.debtsPage || 1);
          this.hasMoreDebts.set(response.data.hasMoreDebts || false);
        }
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snackBar.open('Failed to load customer details', 'Close', { duration: 3000 });
        this.goBack();
      }
    });
  }

  onDebtsScroll(event: Event): void {
    const element = event.target as HTMLElement;
    const threshold = 50;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < threshold;

    if (atBottom && this.hasMoreDebts() && !this.loadingMoreDebts()) {
      this.loadMoreDebts();
    }
  }

  loadMoreDebts(): void {
    const customerData = this.customer();
    if (!customerData) return;

    this.loadingMoreDebts.set(true);
    const nextPage = this.debtsPage() + 1;

    this.customerService.getCustomerDebts(this.customerId, nextPage).subscribe({
      next: (response) => {
        if (response.success) {
          const updatedCustomer = {
            ...customerData,
            debts: [...customerData.debts, ...response.data.debts]
          };
          this.customer.set(updatedCustomer);
          this.debtsPage.set(response.data.page);
          this.hasMoreDebts.set(response.data.hasMore);
        }
        this.loadingMoreDebts.set(false);
      },
      error: () => {
        this.loadingMoreDebts.set(false);
        this.snackBar.open('Failed to load more debts', 'Close', { duration: 3000 });
      }
    });
  }

  viewBillDetails(debt: CustomerDebt): void {
    this.billService.getBillById(debt.billId).subscribe({
      next: (response) => {
        if (response.success) {
          this.selectedBill.set(response.data);
        }
      },
      error: () => {
        this.snackBar.open('Failed to load bill details', 'Close', { duration: 3000 });
      }
    });
  }

  closeBillView(): void {
    this.selectedBill.set(null);
  }

  printBill(bill: Bill): void {
    this.billService.printBill(bill.billId).subscribe({
      next: (response: any) => {
        // Success - no snackbar needed
      },
      error: () => {
        this.snackBar.open('Failed to print bill', 'Close', { duration: 3000 });
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

    let remainingPayment = amount;
    const paymentsToMake: { billId: string, amount: number }[] = [];

    for (const debt of customerData.debts) {
      if (remainingPayment <= 0) break;
      
      const paymentForThisDebt = Math.min(remainingPayment, debt.remainingAmount);
      paymentsToMake.push({ billId: debt.billId, amount: paymentForThisDebt });
      remainingPayment -= paymentForThisDebt;
    }

    let completed = 0;
    const total = paymentsToMake.length;
    let hasError = false;

    paymentsToMake.forEach(payment => {
      this.customerService.payDebt(this.customerId, payment.billId, payment.amount).subscribe({
        next: () => {
          completed++;
          if (completed === total) {
            if (!hasError) {
              // Payment successful - no snackbar needed
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

    this.fetchAllCustomerBills(customerData).then(allBills => {
      try {
        this.generatePDF(customerData, allBills);
        this.generatingPDF.set(false);
        // PDF generated successfully - no snackbar needed
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
    const limit = 100;
    let allBills: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const response: any = await this.customerService.getCustomerBills(this.customerId, page, limit).toPromise();
        
        if (response.success && response.data.bills.length > 0) {
          allBills = allBills.concat(response.data.bills);
          hasMore = response.data.hasMore;
          page++;
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

    const formatPdfCurrency = (amount: number): string => {
      return `Rs. ${amount.toFixed(2)}`;
    };

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(settings.businessName || 'Business Name', margin, yPos);
    
    yPos += 10;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 10;

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

    const unpaidBills = bills.filter(b => b.paymentStatus === 'pending' || b.paymentStatus === 'partial');

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
      headStyles: { fillColor: [41, 128, 185], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: { 0: { cellWidth: 80 }, 1: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: margin, right: margin }
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;

    if (yPos > pageHeight - 40) {
      doc.addPage();
      yPos = margin;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Bill Details', margin, yPos);
    yPos += 5;

    const allRows: any[] = [];
    
    unpaidBills.forEach((bill) => {
      const billNumberText = bill.billNumber || bill.billId.substring(0, 12);
      const billHeaderText = `${this.formatDate(bill.createdAt)} | ${bill.paymentMethod || 'N/A'}`;
      
      allRows.push([
        { content: billNumberText, colSpan: 2, styles: { fontStyle: 'bold', fillColor: [245, 245, 245] } },
        { content: billHeaderText, colSpan: 2, styles: { fontStyle: 'bold', fillColor: [245, 245, 245], halign: 'right' } }
      ]);

      if (bill.items && bill.items.length > 0) {
        bill.items.forEach((item: any) => {
          allRows.push([
            item.name || item.productName || 'N/A',
            item.quantity?.toString() || '0',
            formatPdfCurrency(item.unitPrice || 0),
            formatPdfCurrency(item.itemTotal || item.finalTotal || 0)
          ]);
        });
      }
    });

    (doc as any).autoTable({
      startY: yPos,
      head: [['ITEM', 'QTY', 'PRICE', 'TOTAL']],
      body: allRows,
      theme: 'grid',
      headStyles: { fillColor: [100, 181, 246], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'center', cellWidth: 25 },
        2: { halign: 'right', cellWidth: 40 },
        3: { halign: 'right', cellWidth: 40 }
      },
      margin: { left: margin, right: margin }
    });

    const fileName = `customer_${customer.name.replace(/\s+/g, '_')}_bills_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
  }

  getStatusClass(): string {
    const bill = this.selectedBill();
    if (!bill) return 'status-pending';
    switch (bill.paymentStatus) {
      case 'paid': return 'status-paid';
      case 'partial': return 'status-partial';
      default: return 'status-pending';
    }
  }

  getStatusText(): string {
    const bill = this.selectedBill();
    if (!bill) return 'Pending';
    switch (bill.paymentStatus) {
      case 'paid': return 'Paid';
      case 'partial': return 'Partial';
      default: return 'Pending';
    }
  }
}
