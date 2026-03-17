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

import { BorrowerService } from '../../../core/services/borrower.service';
import { SettingsService } from '../../../core/services/settings.service';
import { Borrower } from '../../../core/models/borrower.model';
import { BorrowerDialogComponent } from './borrower-dialog/borrower-dialog.component';
import { BorrowerDetailDialogComponent } from './borrower-detail-dialog/borrower-detail-dialog.component';

@Component({
  selector: 'app-borrowers',
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
  templateUrl: './borrowers.component.html',
  styleUrl: './borrowers.component.scss'
})
export class BorrowersComponent implements OnInit, AfterViewInit {
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  displayedColumns = ['name', 'phone', 'totalDebt', 'actions'];
  dataSource = new MatTableDataSource<Borrower>([]);
  loading = signal(false);
  searchQuery = signal('');

  private searchSubject = new Subject<string>();

  constructor(
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private borrowerService: BorrowerService,
    public settingsService: SettingsService
  ) {}

  ngOnInit(): void {
    this.loadBorrowers();

    // Setup search with debounce
    this.searchSubject.pipe(
      debounceTime(300)
    ).subscribe(query => {
      if (query && query.length >= 2) {
        this.searchBorrowers(query);
      } else {
        this.loadBorrowers();
      }
    });
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  loadBorrowers(): void {
    this.loading.set(true);
    this.borrowerService.getBorrowers().subscribe({
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
    this.loadBorrowers();
  }

  private searchBorrowers(query: string): void {
    this.loading.set(true);
    this.borrowerService.searchBorrowers(query).subscribe({
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
    const dialogRef = this.dialog.open(BorrowerDialogComponent, {
      width: '400px',
      data: { borrower: null }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.borrowerService.createBorrower(result).subscribe({
          next: (response) => {
            if (response.success) {
              this.snackBar.open('Borrower added successfully', 'Close', { duration: 3000 });
              this.loadBorrowers();
            }
          },
          error: (error) => {
            this.snackBar.open(error.error?.message || 'Failed to add borrower', 'Close', { duration: 3000 });
          }
        });
      }
    });
  }

  openEditDialog(event: Event, borrower: Borrower): void {
    event.stopPropagation();
    const dialogRef = this.dialog.open(BorrowerDialogComponent, {
      width: '400px',
      data: { borrower }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.borrowerService.updateBorrower(borrower.borrowerId, result).subscribe({
          next: () => {
            this.snackBar.open('Borrower updated successfully', 'Close', { duration: 3000 });
            this.loadBorrowers();
          },
          error: (error) => {
            this.snackBar.open(error.error?.message || 'Failed to update borrower', 'Close', { duration: 3000 });
          }
        });
      }
    });
  }

  viewBorrowerDetails(borrower: Borrower): void {
    this.dialog.open(BorrowerDetailDialogComponent, {
      width: '100%',
      maxWidth: '600px',
      maxHeight: '80vh',
      data: { borrowerId: borrower.borrowerId }
    }).afterClosed().subscribe(() => {
      this.loadBorrowers();
    });
  }

  deleteBorrower(event: Event, borrower: Borrower): void {
    event.stopPropagation();
    if (confirm(`Are you sure you want to delete ${borrower.name}?`)) {
      this.borrowerService.deleteBorrower(borrower.borrowerId).subscribe({
        next: () => {
          this.snackBar.open('Borrower deleted successfully', 'Close', { duration: 3000 });
          this.loadBorrowers();
        },
        error: (error) => {
          this.snackBar.open(error.error?.message || 'Failed to delete borrower', 'Close', { duration: 3000 });
        }
      });
    }
  }
}
