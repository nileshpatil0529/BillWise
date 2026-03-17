import { Component, Inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Borrower } from '../../../../core/models/borrower.model';

export interface BorrowerDialogData {
  borrower: Borrower | null;
}

@Component({
  selector: 'app-borrower-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>{{ data.borrower ? 'edit' : 'person_add' }}</mat-icon>
      {{ data.borrower ? 'Edit Borrower' : 'Add Borrower' }}
    </h2>
    
    <mat-dialog-content>
      <form [formGroup]="form" class="borrower-form">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Name</mat-label>
          <input matInput formControlName="name" placeholder="Enter borrower name">
          <mat-icon matPrefix>person</mat-icon>
          @if (form.get('name')?.hasError('required')) {
            <mat-error>Name is required</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Phone Number</mat-label>
          <input matInput formControlName="phone" placeholder="Enter phone number">
          <mat-icon matPrefix>phone</mat-icon>
          @if (form.get('phone')?.hasError('required')) {
            <mat-error>Phone number is required</mat-error>
          }
          @if (form.get('phone')?.hasError('pattern')) {
            <mat-error>Enter a valid phone number</mat-error>
          }
        </mat-form-field>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-raised-button color="primary" [disabled]="form.invalid" (click)="save()">
        <mat-icon>{{ data.borrower ? 'save' : 'add' }}</mat-icon>
        {{ data.borrower ? 'Save' : 'Add' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    h2[mat-dialog-title] {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      
      mat-icon {
        color: var(--mat-primary);
      }
    }

    .borrower-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 300px;
      padding-top: 16px;
    }

    .full-width {
      width: 100%;
    }

    mat-dialog-actions {
      padding: 16px 0 0;
    }
  `]
})
export class BorrowerDialogComponent {
  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<BorrowerDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: BorrowerDialogData
  ) {
    this.form = this.fb.group({
      name: [data.borrower?.name || '', [Validators.required]],
      phone: [data.borrower?.phone || '', [Validators.required, Validators.pattern(/^[+]?[\d\s-]{10,15}$/)]]
    });
  }

  save(): void {
    if (this.form.valid) {
      this.dialogRef.close(this.form.value);
    }
  }
}
