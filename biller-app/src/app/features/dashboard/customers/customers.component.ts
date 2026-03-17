import { Component, OnInit, signal, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
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
import { debounceTime, Subject } from 'rxjs';

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
    MatPaginatorModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatChipsModule
  ],
  templateUrl: './customers.component.html',
  styleUrl: './customers.component.scss'
})
export class CustomersComponent implements OnInit, AfterViewInit {
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  displayedColumns = ['name', 'phone', 'totalDebt', 'actions'];
  dataSource = new MatTableDataSource<Customer>([]);
  loading = signal(false);
  searchQuery = signal('');

  private searchSubject = new Subject<string>();

  constructor(
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private customerService: CustomerService,
    public settingsService: SettingsService
  ) {}

  ngOnInit(): void {
    this.loadCustomers();

    // Setup search with debounce
    this.searchSubject.pipe(
      debounceTime(300)
    ).subscribe(query => {
      if (query && query.length >= 2) {
        this.searchCustomers(query);
      } else {
        this.loadCustomers();
      }
    });
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  loadCustomers(): void {
    this.loading.set(true);
    this.customerService.getCustomers().subscribe({
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
              this.loadCustomers();
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
            this.loadCustomers();
          },
          error: (error) => {
            this.snackBar.open(error.error?.message || 'Failed to update customer', 'Close', { duration: 3000 });
          }
        });
      }
    });
  }

  viewCustomerDetails(customer: Customer): void {
    this.dialog.open(CustomerDetailDialogComponent, {
      width: '100%',
      maxWidth: '600px',
      maxHeight: '80vh',
      data: { customerId: customer.customerId }
    }).afterClosed().subscribe(() => {
      this.loadCustomers();
    });
  }

  deleteCustomer(event: Event, customer: Customer): void {
    event.stopPropagation();
    if (confirm(`Are you sure you want to delete ${customer.name}?`)) {
      this.customerService.deleteCustomer(customer.customerId).subscribe({
        next: () => {
          this.snackBar.open('Customer deleted successfully', 'Close', { duration: 3000 });
          this.loadCustomers();
        },
        error: (error) => {
          this.snackBar.open(error.error?.message || 'Failed to delete customer', 'Close', { duration: 3000 });
        }
      });
    }
  }
}
