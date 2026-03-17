import { Component, Inject, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
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

import { BorrowerService } from '../../../../core/services/borrower.service';
import { SettingsService } from '../../../../core/services/settings.service';
import { BorrowerWithDebts, BorrowerDebt } from '../../../../core/models/borrower.model';

export interface BorrowerDetailDialogData {
  borrowerId: string;
}

@Component({
  selector: 'app-borrower-detail-dialog',
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
        <p>Loading borrower details...</p>
      </div>
    } @else if (borrower()) {
      <div class="dialog-header">
        <div class="borrower-info">
          <h2 class="borrower-name">{{ borrower()!.name }}</h2>
          <span class="borrower-phone">
            <mat-icon>phone</mat-icon>
            {{ borrower()!.phone }}
          </span>
        </div>
        <div class="total-debt-container">
          <span class="debt-label">Total Debt</span>
          <mat-chip [class]="borrower()!.totalDebt > 0 ? 'status-pending' : 'status-paid'">
            {{ formatCurrency(borrower()!.totalDebt) }}
          </mat-chip>
        </div>
      </div>

      <mat-divider></mat-divider>

      <mat-dialog-content>
        <h3>Unpaid Bills</h3>

        @if (borrower()!.debts.length === 0) {
          <div class="empty-state">
            <mat-icon>check_circle</mat-icon>
            <p>No unpaid bills</p>
          </div>
        } @else {
          <table mat-table [dataSource]="borrower()!.debts" class="debts-table">
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
                          (click)="payDebt(debt)"
                          [disabled]="paying()">
                    <mat-icon>payments</mat-icon>
                  </button>
                </div>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
          </table>
        }
      </mat-dialog-content>

      <mat-dialog-actions>
        @if (borrower()!.debts.length > 0) {
          <button mat-raised-button color="primary" 
                  (click)="payAllDebts()" 
                  [disabled]="paying()"
                  matTooltip="Pay all remaining debts">
            <mat-icon>payments</mat-icon>
            Pay All ({{ formatCurrency(borrower()!.totalDebt) }})
          </button>
        }
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

    .borrower-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      flex: 1;

      .borrower-name {
        margin: 0;
        font-size: 20px;
        font-weight: 500;
        word-break: break-word;
      }

      .borrower-phone {
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
    }

    /* Responsive */
    @media (max-width: 480px) {
      .dialog-header {
        padding: 12px 16px;
      }

      .borrower-info .borrower-name {
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
export class BorrowerDetailDialogComponent implements OnInit {
  private borrowerService = inject(BorrowerService);
  private settingsService = inject(SettingsService);
  private snackBar = inject(MatSnackBar);

  borrower = signal<BorrowerWithDebts | null>(null);
  loading = signal(true);
  paying = signal(false);
  paymentAmounts: Map<string, number> = new Map();

  displayedColumns = ['remaining', 'date', 'pay'];

  constructor(
    private dialogRef: MatDialogRef<BorrowerDetailDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: BorrowerDetailDialogData
  ) {}

  ngOnInit(): void {
    this.loadBorrower();
  }

  loadBorrower(): void {
    this.loading.set(true);
    this.borrowerService.getBorrowerById(this.data.borrowerId).subscribe({
      next: (response) => {
        if (response.success) {
          this.borrower.set(response.data);
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

  payDebt(debt: BorrowerDebt): void {
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
    this.borrowerService.payDebt(this.data.borrowerId, debt.billId, amount).subscribe({
      next: (response) => {
        this.snackBar.open(response.message, 'Close', { duration: 3000 });
        this.loadBorrower();
        this.paying.set(false);
      },
      error: (error) => {
        this.snackBar.open(error.error?.message || 'Failed to process payment', 'Close', { duration: 3000 });
        this.paying.set(false);
      }
    });
  }

  payAllDebts(): void {
    const borrowerData = this.borrower();
    if (!borrowerData || borrowerData.debts.length === 0) return;

    this.paying.set(true);
    let completed = 0;
    const total = borrowerData.debts.length;

    borrowerData.debts.forEach(debt => {
      this.borrowerService.payDebt(this.data.borrowerId, debt.billId, debt.remainingAmount).subscribe({
        next: () => {
          completed++;
          if (completed === total) {
            this.snackBar.open('All debts paid successfully!', 'Close', { duration: 3000 });
            this.loadBorrower();
            this.paying.set(false);
          }
        },
        error: (error) => {
          completed++;
          this.snackBar.open(error.error?.message || 'Failed to process some payments', 'Close', { duration: 3000 });
          if (completed === total) {
            this.loadBorrower();
            this.paying.set(false);
          }
        }
      });
    });
  }
}
