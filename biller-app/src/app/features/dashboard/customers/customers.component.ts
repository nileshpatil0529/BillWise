import { Component, OnInit, signal, effect, ViewChild, AfterViewInit, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { debounceTime, Subject, fromEvent, takeUntil } from 'rxjs';

import { CustomerService } from '../../../core/services/customer.service';
import { SettingsService } from '../../../core/services/settings.service';
import { Customer } from '../../../core/models/customer.model';
import { CustomerDialogComponent } from './customer-dialog/customer-dialog.component';
import { CustomerDetailDialogComponent } from './customer-detail-dialog/customer-detail-dialog.component';

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatTableModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatChipsModule,
    ScrollingModule
  ],
  templateUrl: './customers.component.html',
  styleUrl: './customers.component.scss'
})
export class CustomersComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild('tableContainer') tableContainer!: ElementRef;

  // All available columns
  private allColumns = ['name', 'phone', 'totalDebt', 'actions'];
  displayedColumns: string[] = [];
  
  dataSource = new MatTableDataSource<Customer>([]);
  loading = signal(false);
  loadingMore = signal(false);
  searchQuery = signal('');

  // Lazy loading state
  currentPage = signal(1);
  pageSize = 50;
  hasMore = signal(true);
  allCustomers = signal<Customer[]>([]);

  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private customerService: CustomerService,
    public settingsService: SettingsService
  ) {
    // Update displayedColumns based on settings
    effect(() => {
      const settings = this.settingsService.settings();
      const tableColumns = settings.tableColumns?.customers;
      
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

  // Check if mobile mode is enabled
  isMobileMode(): boolean {
    return this.settingsService.settings().viewMode === 'mobile';
  }

  ngOnInit(): void {
    this.loadCustomers(true);

    // Setup search with debounce
    this.searchSubject.pipe(
      debounceTime(300),
      takeUntil(this.destroy$)
    ).subscribe(query => {
      this.searchQuery.set(query);
      if (query && query.length >= 2) {
        this.searchCustomers(query);
      } else {
        this.loadCustomers(true);
      }
    });
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
    
    if (atBottom && !this.loadingMore() && this.hasMore() && !this.loading() && !this.searchQuery()) {
      this.loadCustomers(false);
    }
  }

  loadCustomers(reset: boolean = false): void {
    if (reset) {
      this.currentPage.set(1);
      this.hasMore.set(true);
      this.allCustomers.set([]);
      this.loading.set(true);
    } else {
      this.loadingMore.set(true);
    }

    this.customerService.getCustomers().subscribe({
      next: (response) => {
        if (response.success) {
          const customers = response.data;
          
          if (reset) {
            this.allCustomers.set(customers);
          } else {
            this.allCustomers.set([...this.allCustomers(), ...customers]);
          }
          
          this.dataSource.data = this.allCustomers();
          this.hasMore.set(customers.length === this.pageSize);
          
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
      }
    });
  }

  onSearchInput(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.searchQuery.set(query);
    this.searchSubject.next(query);
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.loadCustomers();
  }

  private searchCustomers(query: string): void {
    this.loading.set(true);
    this.customerService.searchCustomers(query).subscribe({
      next: (response) => {
        if (response.success) {
          this.dataSource.data = response.data;
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

  openAddDialog(): void {
    const dialogRef = this.dialog.open(CustomerDialogComponent, {
      width: '400px',
      data: { customer: null }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.customerService.createCustomer(result).subscribe({
          next: (response) => {
            if (response.success) {
              this.snackBar.open('Customer added successfully', 'Close', { duration: 3000 });
              this.loadCustomers(true);
            }
          },
          error: (error) => {
            this.snackBar.open(error.error?.message || 'Failed to add customer', 'Close', { duration: 3000 });
          }
        });
      }
    });
  }

  openEditDialog(event: Event, customer: Customer): void {
    event.stopPropagation();
    const dialogRef = this.dialog.open(CustomerDialogComponent, {
      width: '400px',
      data: { customer }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.customerService.updateCustomer(customer.customerId, result).subscribe({
          next: () => {
            this.snackBar.open('Customer updated successfully', 'Close', { duration: 3000 });
            this.loadCustomers(true);
          },
          error: (error) => {
            this.snackBar.open(error.error?.message || 'Failed to update customer', 'Close', { duration: 3000 });
          }
        });
      }
    });
  }

  viewCustomerDetails(customer: Customer): void {
    const isMobile = window.innerWidth <= 768;
    this.dialog.open(CustomerDetailDialogComponent, {
      width: isMobile ? '100vw' : '90vw',
      maxWidth: isMobile ? '100vw' : '1200px',
      height: isMobile ? '100vh' : '85vh',
      maxHeight: isMobile ? '100vh' : '85vh',
      panelClass: 'customer-detail-dialog',
      data: { customerId: customer.customerId }
    }).afterClosed().subscribe(() => {
      this.loadCustomers(true);
    });
  }

  deleteCustomer(event: Event, customer: Customer): void {
    event.stopPropagation();
    if (confirm(`Are you sure you want to delete ${customer.name}?`)) {
      this.customerService.deleteCustomer(customer.customerId).subscribe({
        next: () => {
          this.snackBar.open('Customer deleted successfully', 'Close', { duration: 3000 });
          this.loadCustomers(true);
        },
        error: (error) => {
          this.snackBar.open(error.error?.message || 'Failed to delete customer', 'Close', { duration: 3000 });
        }
      });
    }
  }
}
