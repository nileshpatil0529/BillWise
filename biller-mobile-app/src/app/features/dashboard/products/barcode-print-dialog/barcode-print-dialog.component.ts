import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Product } from '../../../../core/models/product.model';

@Component({
  selector: 'app-barcode-print-dialog',
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
  templateUrl: './barcode-print-dialog.component.html',
  styleUrl: './barcode-print-dialog.component.scss'
})
export class BarcodePrintDialogComponent {
  printForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<BarcodePrintDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { product: Product }
  ) {
    this.printForm = this.fb.group({
      quantity: [1, [Validators.required, Validators.min(1), Validators.max(100)]]
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onPrint(): void {
    if (this.printForm.valid) {
      this.dialogRef.close({
        quantity: this.printForm.value.quantity,
        product: this.data.product
      });
    }
  }
}
