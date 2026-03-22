import { Component, Inject, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Product } from '../../../../core/models/product.model';
import { BarcodeScannerDialogComponent } from '../../home/barcode-scanner-dialog/barcode-scanner-dialog.component';
import { SettingsService } from '../../../../core/services/settings.service';
import { ProductService } from '../../../../core/services/product.service';
import { Unit } from '../../../../core/models/settings.model';

interface DialogData {
  mode: 'add' | 'edit';
  product?: Product;
}

@Component({
  selector: 'app-product-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule,
    MatCheckboxModule
  ],
  template: `
    <h2 mat-dialog-title>{{ data.mode === 'add' ? 'Add New Product' : 'Edit Product' }}</h2>
    
    <mat-dialog-content>
      <form [formGroup]="productForm" class="product-form">
        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>Product Name</mat-label>
            <input matInput formControlName="name" placeholder="Enter product name">
            @if (productForm.get('name')?.hasError('required')) {
              <mat-error>Name is required</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Category</mat-label>
            <mat-select formControlName="category">
              @for (category of productService.categories(); track category) {
                <mat-option [value]="category">{{ category }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Description</mat-label>
          <textarea matInput formControlName="description" rows="2"></textarea>
        </mat-form-field>

        @if (settingsService.settings().scannerType === 'camera') {
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Barcode</mat-label>
            <input matInput formControlName="barcode" placeholder="Enter barcode (EAN, UPC, etc.)">
            <button mat-icon-button matSuffix (click)="scanBarcode()" matTooltip="Scan barcode" type="button">
              <mat-icon>qr_code_scanner</mat-icon>
            </button>
          </mat-form-field>

          @if (productForm.get('barcode')?.value) {
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Confirm Barcode</mat-label>
              <input matInput formControlName="confirmBarcode" placeholder="Scan barcode again to confirm">
              <button mat-icon-button matSuffix (click)="scanConfirmBarcode()" matTooltip="Scan to confirm" type="button">
                <mat-icon>qr_code_scanner</mat-icon>
              </button>
              @if (productForm.get('confirmBarcode')?.hasError('barcodeMismatch')) {
                <mat-error>Barcodes do not match</mat-error>
              }
            </mat-form-field>
          }
        }

        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>Unit Price</mat-label>
            <input matInput type="number" formControlName="unitPrice" min="1">
            @if (productForm.get('unitPrice')?.hasError('required')) {
              <mat-error>Price is required</mat-error>
            }
            @if (productForm.get('unitPrice')?.hasError('min')) {
              <mat-error>Price must be greater than 0</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Cost Price</mat-label>
            <input matInput type="number" formControlName="costPrice" min="0">
          </mat-form-field>
        </div>

        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>Stock Quantity</mat-label>
            <input matInput type="number" formControlName="stockQuantity" min="1">
            @if (productForm.get('stockQuantity')?.hasError('required')) {
              <mat-error>Stock is required</mat-error>
            }
            @if (productForm.get('stockQuantity')?.hasError('min')) {
              <mat-error>Stock must be greater than 0</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Low Stock Alert</mat-label>
            <input matInput type="number" formControlName="lowStockAlert" min="0">
          </mat-form-field>
        </div>

        <div class="form-row">
          <div class="toggle-field">
            <mat-slide-toggle formControlName="status" color="primary">
              Active
            </mat-slide-toggle>
          </div>
        </div>

        <!-- Loose Item Section (Grocery Mode Only) -->
        @if (isGroceryMode()) {
          <div class="loose-item-section">
            <div class="form-row">
              <div class="checkbox-field">
                <mat-checkbox formControlName="isLooseItem" color="primary" (change)="onLooseItemChange($event.checked)">
                  Loose Item (sold by weight/volume)
                </mat-checkbox>
              </div>
            </div>

            @if (productForm.get('isLooseItem')?.value) {
              <div class="form-row">
                <mat-form-field appearance="outline">
                  <mat-label>Unit</mat-label>
                  <mat-select formControlName="unit">
                    @for (unit of units(); track unit.id) {
                      <mat-option [value]="unit.symbol">{{ unit.name }} ({{ unit.symbol }})</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              </div>
            }
          </div>
        }

        <!-- Warranty Section (Electronics Mode Only) -->
        @if (isElectronicsMode()) {
          <div class="warranty-section">
            <mat-form-field appearance="outline">
              <mat-label>Warranty (months)</mat-label>
              <input matInput type="number" formControlName="warrantyMonths" min="0" placeholder="0 for no warranty">
              <mat-icon matSuffix>verified_user</mat-icon>
            </mat-form-field>
          </div>
        }
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button mat-raised-button color="primary" (click)="onSave()" [disabled]="productForm.invalid">
        {{ data.mode === 'add' ? 'Create' : 'Update' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content {
      min-width: 500px;
      max-width: 100%;
    }

    .product-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .form-row {
      display: flex;
      gap: 16px;

      > * {
        flex: 1;
      }
    }

    .full-width {
      width: 100%;
    }

    .toggle-field {
      display: flex;
      align-items: center;
      padding-top: 8px;
    }

    .checkbox-field {
      display: flex;
      align-items: center;
      padding: 8px 0;
    }

    .loose-item-section {
      margin-top: 8px;
      padding: 16px;
      border: 1px dashed rgba(0, 0, 0, 0.12);
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.02);
    }

    :host-context(.dark-theme) .loose-item-section {
      border-color: rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.02);
    }

    .warranty-section {
      margin-top: 8px;
      
      mat-form-field {
        width: 100%;
      }
    }

    @media (max-width: 600px) {
      mat-dialog-content {
        min-width: auto;
      }

      .form-row {
        flex-direction: column;
        gap: 0;
      }
    }
  `]
})
export class ProductDialogComponent {
  productForm: FormGroup;
  settingsService = inject(SettingsService);
  productService = inject(ProductService);
  units = signal<Unit[]>([]);

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<ProductDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private dialog: MatDialog
  ) {
    // Load categories if not already loaded
    if (this.productService.categories().length === 0) {
      this.productService.getCategories().subscribe();
    }
    
    // Load units for grocery mode
    const settings = this.settingsService.settings();
    if (settings.units) {
      this.units.set(settings.units);
    }
    
    const product = data.product;
    
    this.productForm = this.fb.group({
      name: [product?.name || '', Validators.required],
      category: [product?.category || 'General'],
      description: [product?.description || ''],
      barcode: [product?.barcode || ''],
      confirmBarcode: [product?.barcode || ''],
      unitPrice: [product?.unitPrice || '', [Validators.required, Validators.min(1)]],
      costPrice: [product?.costPrice || 0, Validators.min(0)],
      stockQuantity: [product?.stockQuantity || '', [Validators.required, Validators.min(1)]],
      lowStockAlert: [product?.lowStockAlert || 10, Validators.min(0)],
      status: [product?.status !== 'inactive'], // Default to active for new products
      isLooseItem: [product?.isLooseItem || false],
      unit: [product?.unit || 'pcs'],
      warrantyMonths: [product?.warrantyMonths || 0, Validators.min(0)]
    });

    // Add barcode match validator
    this.productForm.get('confirmBarcode')?.setValidators([this.barcodeMatchValidator.bind(this)]);
  }

  barcodeMatchValidator(control: AbstractControl): ValidationErrors | null {
    const barcode = this.productForm?.get('barcode')?.value;
    const confirmBarcode = control.value;
    
    if (barcode && confirmBarcode && barcode !== confirmBarcode) {
      return { barcodeMismatch: true };
    }
    return null;
  }

  isGroceryMode(): boolean {
    return this.settingsService.settings().applicationType === 'grocery';
  }

  isElectronicsMode(): boolean {
    return this.settingsService.settings().applicationType === 'electronics';
  }

  onLooseItemChange(isLooseItem: boolean): void {
    if (!isLooseItem) {
      this.productForm.patchValue({ unit: 'pcs' });
    } else if (!this.productForm.get('unit')?.value || this.productForm.get('unit')?.value === 'pcs') {
      // Default to kg for loose items
      this.productForm.patchValue({ unit: 'kg' });
    }
  }

  scanBarcode(): void {
    const scannerDialog = this.dialog.open(BarcodeScannerDialogComponent, {
      width: '450px',
      maxWidth: '95vw',
      maxHeight: '95vh',
      panelClass: 'barcode-scanner-dialog',
      data: {
        mode: 'single',
        title: 'Scan Product Barcode'
      }
    });

    scannerDialog.afterClosed().subscribe((barcode: string | null) => {
      if (barcode) {
        this.productForm.patchValue({ barcode });
        // Clear confirm barcode when new barcode is scanned
        this.productForm.patchValue({ confirmBarcode: '' });
        
        // Automatically open confirm barcode scanner after a brief delay
        setTimeout(() => {
          this.scanConfirmBarcode();
        }, 300);
      }
    });
  }

  scanConfirmBarcode(): void {
    const scannerDialog = this.dialog.open(BarcodeScannerDialogComponent, {
      width: '450px',
      maxWidth: '95vw',
      maxHeight: '95vh',
      panelClass: 'barcode-scanner-dialog',
      data: {
        mode: 'single',
        title: 'Confirm Barcode'
      }
    });

    scannerDialog.afterClosed().subscribe((barcode: string | null) => {
      if (barcode) {
        this.productForm.patchValue({ confirmBarcode: barcode });
        this.productForm.get('confirmBarcode')?.updateValueAndValidity();
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSave(): void {
    if (this.productForm.valid) {
      const formValue = this.productForm.value;
      // Remove confirmBarcode from the data sent to backend
      const { confirmBarcode, ...productData } = formValue;
      this.dialogRef.close({
        ...productData,
        status: formValue.status ? 'active' : 'inactive',
        // Include loose item fields for grocery mode
        isLooseItem: this.isGroceryMode() ? formValue.isLooseItem : false,
        unit: this.isGroceryMode() && formValue.isLooseItem ? formValue.unit : 'pcs',
        // Include warranty for electronics mode
        warrantyMonths: this.isElectronicsMode() ? (formValue.warrantyMonths || 0) : 0
      });
    }
  }
}
