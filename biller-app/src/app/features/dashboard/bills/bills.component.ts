import { Component, OnInit, signal, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { fromEvent, debounceTime, takeUntil, Subject } from 'rxjs';

import { BillService } from '../../../core/services/bill.service';
import { SettingsService } from '../../../core/services/settings.service';
import { AuthService } from '../../../core/services/auth.service';
import { Bill, ReportData, ReportSummary } from '../../../core/models/bill.model';
import { BillDetailDialogComponent } from './bill-detail-dialog/bill-detail-dialog.component';

// jsPDF import for PDF generation
declare var jspdf: any;

@Component({
  selector: 'app-bills',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatTableModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatChipsModule,
    MatMenuModule,
    MatTooltipModule,
    MatTabsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
    MatExpansionModule,
    ScrollingModule
  ],
  templateUrl: './bills.component.html',
  styleUrl: './bills.component.scss'
})
export class BillsComponent implements OnInit {
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild('tableContainer') tableContainer!: ElementRef;

  // All available columns
  private allColumns = ['billNumber', 'createdAt', 'table', 'itemsCount', 'grandTotal', 'paymentMethod', 'paymentStatus', 'actions'];
  displayedColumns: string[] = [];
  
  dataSource = new MatTableDataSource<Bill>([]);
  loading = signal(false);
  loadingMore = signal(false);

  // Lazy loading state
  currentPage = signal(1);
  pageSize = 50;
  hasMore = signal(true);
  allBills = signal<Bill[]>([]);
  private destroy$ = new Subject<void>();

  // Filters
  startDate = signal<Date | null>(null);
  endDate = signal<Date | null>(null);
  paymentMethod = signal<string>('all');
  paymentStatus = signal<string>('all');

  // Report data
  reportData = signal<ReportData | null>(null);

  // Quick date presets - all available
  private allDatePresets = [
    { label: 'Today', value: 'today' },
    { label: 'Yesterday', value: 'yesterday' },
    { label: 'This Week', value: 'week' },
    { label: 'This Month', value: 'month' },
    { label: 'Custom', value: 'custom' }
  ];
  
  // Filtered presets based on user role
  get datePresets() {
    if (this.authService.isAdmin()) {
      return this.allDatePresets;
    }
    // Non-admin users only see Today and Yesterday
    return this.allDatePresets.filter(p => p.value === 'today' || p.value === 'yesterday');
  }
  
  selectedPreset = signal('today');

  constructor(
    private billService: BillService,
    public settingsService: SettingsService,
    public authService: AuthService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    // Update displayedColumns based on settings
    effect(() => {
      const settings = this.settingsService.settings();
      const tableColumns = settings.tableColumns?.bills;
      
      if (!tableColumns) {
        this.displayedColumns = [...this.allColumns];
      } else {
        this.displayedColumns = this.allColumns.filter(col => {
          const columnSetting = tableColumns.find(tc => tc.key === col);
          return columnSetting ? columnSetting.visible : true;
        });
      }
    });
  }

  ngOnInit(): void {
    // setDatePreset already calls loadBills() and loadReport() internally
    this.setDatePreset('today');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
    
    // Setup scroll listener for lazy loading
    if (this.tableContainer) {
      fromEvent(this.tableContainer.nativeElement, 'scroll')
        .pipe(
          debounceTime(200),
          takeUntil(this.destroy$)
        )
        .subscribe(() => this.onScroll());
    }
  }

  onScroll(): void {
    const element = this.tableContainer.nativeElement;
    const atBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 100;
    
    if (atBottom && !this.loadingMore() && this.hasMore() && !this.loading()) {
      this.loadBills(false);
    }
  }

  setDatePreset(preset: string): void {
    this.selectedPreset.set(preset);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    switch (preset) {
      case 'today':
        this.startDate.set(today);
        this.endDate.set(endOfToday);
        break;
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const endOfYesterday = new Date(yesterday);
        endOfYesterday.setHours(23, 59, 59, 999);
        this.startDate.set(yesterday);
        this.endDate.set(endOfYesterday);
        break;
      case 'week':
        const weekStart = new Date(today);
        weekStart.setDate(weekStart.getDate() - 7);
        this.startDate.set(weekStart);
        this.endDate.set(endOfToday);
        break;
      case 'month':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        this.startDate.set(monthStart);
        this.endDate.set(endOfToday);
        break;
    }

    if (preset !== 'custom') {
      this.loadBills(true);
      this.loadReport();
    }
  }

  loadBills(reset: boolean = false): void {
    if (reset) {
      this.currentPage.set(1);
      this.hasMore.set(true);
      this.allBills.set([]);
      this.loading.set(true);
    } else {
      this.loadingMore.set(true);
    }
    
    this.billService.getBills({
      startDate: this.startDate()?.toISOString(),
      endDate: this.endDate()?.toISOString(),
      paymentMethod: this.paymentMethod() !== 'all' ? this.paymentMethod() : undefined,
      paymentStatus: this.paymentStatus() !== 'all' ? this.paymentStatus() : undefined,
      page: this.currentPage(),
      limit: this.pageSize
    }).subscribe({
      next: (response) => {
        if (response.success) {
          const newBills = response.data.bills;
          
          if (reset) {
            this.allBills.set(newBills);
          } else {
            this.allBills.set([...this.allBills(), ...newBills]);
          }
          
          this.dataSource.data = this.allBills();
          this.hasMore.set(newBills.length === this.pageSize);
          
          if (!reset) {
            this.currentPage.update(p => p + 1);
          }
        }
        this.loading.set(false);
        this.loadingMore.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadingMore.set(false);
        this.snackBar.open('Failed to load bills', 'Close', { duration: 3000 });
      }
    });
  }

  loadReport(): void {
    this.billService.getReport(
      this.startDate()?.toISOString(),
      this.endDate()?.toISOString()
    ).subscribe({
      next: (response) => {
        if (response.success) {
          this.reportData.set(response.data);
        }
      }
    });
  }

  applyFilters(): void {
    this.loadBills(true);
    this.loadReport();
  }

  viewBill(bill: Bill): void {
    this.dialog.open(BillDetailDialogComponent, {
      data: bill,
      panelClass: 'bill-detail-dialog'
    });
  }

  printBill(bill: Bill): void {
    this.loading.set(true);
    this.billService.printBill(bill.billId).subscribe({
      next: (response: any) => {
        this.loading.set(false);
        if (response.success) {
          this.snackBar.open(
            `Bill ${bill.billNumber} sent to printer successfully`,
            'Close',
            { duration: 3000, panelClass: ['success-snackbar'] }
          );
        }
      },
      error: (error: any) => {
        this.loading.set(false);
        const message = error.error?.message || 'Failed to print bill';
        this.snackBar.open(message, 'Close', { duration: 5000 });
      }
    });
  }

  downloadReport(): void {
    try {
      const report = this.reportData();
      if (!report) return;

      const doc = new jspdf.jsPDF();
      const settings = this.settingsService.settings();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      let yPos = margin;
      
      // Helper function for PDF currency (use Rs. instead of ₹ for PDF compatibility)
      const formatPdfCurrency = (amount: number): string => {
        return `Rs. ${amount.toFixed(2)}`;
      };
      
      // ===== HEADER =====
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(settings.businessName || 'Business Name', margin, yPos);
      
      // Business details on right side
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 80);
      let rightY = yPos - 5;
      if (settings.phone) {
        doc.text(settings.phone, pageWidth - margin, rightY, { align: 'right' });
        rightY += 4;
      }
      if (settings.email) {
        doc.text(settings.email, pageWidth - margin, rightY, { align: 'right' });
        rightY += 4;
      }
      if (settings.address) {
        doc.text(settings.address, pageWidth - margin, rightY, { align: 'right' });
      }
      
      yPos += 10;
      
      // Divider line
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 15;
      
      // ===== REPORT TITLE =====
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('Sales Report', margin, yPos);
      
      // Date range
      const dateRange = `${this.formatDateString(this.startDate())} - ${this.formatDateString(this.endDate())}`;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(dateRange, pageWidth - margin, yPos, { align: 'right' });
      yPos += 15;
      
      // ===== SUMMARY TABLE =====
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Summary', margin, yPos);
      yPos += 5;
      
      const avgBill = report.summary.totalBills > 0 ? report.summary.totalSales / report.summary.totalBills : 0;
      
      (doc as any).autoTable({
        startY: yPos,
        head: [['Description', 'Value']],
        body: [
          ['Total Sales', formatPdfCurrency(report.summary.totalSales)],
          ['Total Bills', report.summary.totalBills.toString()],
          ['Average Bill Value', formatPdfCurrency(avgBill)],
          ['Tax Collected', formatPdfCurrency(report.summary.totalTax)]
        ],
        theme: 'grid',
        headStyles: { 
          fillColor: [50, 50, 50],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 10
        },
        styles: { 
          fontSize: 10,
          cellPadding: 5,
          textColor: [0, 0, 0]
        },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: margin, right: margin }
      });
      
      yPos = (doc as any).lastAutoTable.finalY + 15;
      
      // ===== PAYMENT METHODS TABLE =====
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Payment Methods', margin, yPos);
      yPos += 5;
      
      (doc as any).autoTable({
        startY: yPos,
        head: [['Payment Method', 'Amount']],
        body: [
          ['UPI/Online', formatPdfCurrency(report.summary.onlineSales)],
          ['Cash', formatPdfCurrency(report.summary.cashSales)],
          ['Card', formatPdfCurrency(report.summary.cardSales)],
          ['Debt (Pending)', formatPdfCurrency(report.summary.debtAmount)]
        ],
        theme: 'grid',
        headStyles: { 
          fillColor: [50, 50, 50],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 10
        },
        styles: { 
          fontSize: 10,
          cellPadding: 5,
          textColor: [0, 0, 0]
        },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: margin, right: margin }
      });
      
      // ===== FOOTER =====
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 120, 120);
      doc.text(`Generated: ${this.formatDateString(new Date())}`, margin, pageHeight - 15);
      if (settings.taxNumber) {
        doc.text(`Tax No: ${settings.taxNumber}`, pageWidth - margin, pageHeight - 15, { align: 'right' });
      }
      
      doc.save(`sales_report_${new Date().toISOString().split('T')[0]}.pdf`);
      this.snackBar.open('Report downloaded successfully', 'Close', { duration: 2000 });
    } catch (error) {
      console.error('Report generation error:', error);
      this.snackBar.open('Failed to generate report', 'Close', { duration: 3000 });
    }
  }

  formatCurrency(amount: number): string {
    return this.settingsService.formatCurrency(amount);
  }

  formatDateString(date: Date | null | undefined): string {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  getPaymentMethodIcon(method: string): string {
    switch (method) {
      case 'cash': return 'payments';
      case 'card': return 'credit_card';
      case 'online': return 'smartphone';
      case 'debt': return 'account_balance';
      default: return 'payment';
    }
  }

  getPaymentStatusClass(status: string): string {
    switch (status) {
      case 'paid': return 'status-paid';
      case 'pending': return 'status-pending';
      case 'partial': return 'status-partial';
      default: return '';
    }
  }
}
