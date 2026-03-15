import { Component, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ProductService } from '../../../core/services/product.service';
import { SettingsService } from '../../../core/services/settings.service';
import { Product } from '../../../core/models/product.model';
import { ProductDialogComponent } from './product-dialog/product-dialog.component';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatSlideToggleModule,
    MatChipsModule,
    MatMenuModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './products.component.html',
  styleUrl: './products.component.scss'
})
export class ProductsComponent implements OnInit {
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  displayedColumns = ['productId', 'name', 'barcode', 'category', 'unitPrice', 'stockQuantity', 'status', 'actions'];
  dataSource = new MatTableDataSource<Product>([]);
  loading = signal(false);
  searchQuery = signal('');
  selectedCategory = signal('');

  constructor(
    public productService: ProductService,
    public settingsService: SettingsService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadProducts();
    this.productService.getCategories().subscribe();
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  loadProducts(): void {
    this.loading.set(true);
    this.productService.getProducts({
      category: this.selectedCategory() || undefined,
      search: this.searchQuery() || undefined
    }).subscribe({
      next: (response) => {
        if (response.success) {
          this.dataSource.data = response.data.products;
        }
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snackBar.open('Failed to load products', 'Close', { duration: 3000 });
      }
    });
  }

  applyFilter(event: Event): void {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  openAddDialog(): void {
    const dialogRef = this.dialog.open(ProductDialogComponent, {
      width: '600px',
      data: { mode: 'add' }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.productService.createProduct(result).subscribe({
          next: (response) => {
            if (response.success) {
              const message = response.updated 
                ? response.message 
                : 'Product created successfully';
              this.snackBar.open(message, 'Close', { 
                duration: 3000,
                panelClass: ['success-snackbar']
              });
              this.loadProducts();
            }
          },
          error: () => {
            this.snackBar.open('Failed to create product', 'Close', { duration: 3000 });
          }
        });
      }
    });
  }

  openEditDialog(product: Product): void {
    const dialogRef = this.dialog.open(ProductDialogComponent, {
      width: '600px',
      data: { mode: 'edit', product }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.productService.updateProduct(product.productId, result).subscribe({
          next: (response) => {
            if (response.success) {
              this.snackBar.open('Product updated successfully', 'Close', { 
                duration: 3000,
                panelClass: ['success-snackbar']
              });
              this.loadProducts();
            }
          },
          error: () => {
            this.snackBar.open('Failed to update product', 'Close', { duration: 3000 });
          }
        });
      }
    });
  }

  deleteProduct(product: Product): void {
    if (confirm(`Are you sure you want to delete "${product.name}"?`)) {
      this.productService.deleteProduct(product.productId).subscribe({
        next: (response) => {
          if (response.success) {
            this.snackBar.open('Product deleted successfully', 'Close', { 
              duration: 3000,
              panelClass: ['success-snackbar']
            });
            this.loadProducts();
          }
        },
        error: () => {
          this.snackBar.open('Failed to delete product', 'Close', { duration: 3000 });
        }
      });
    }
  }

  exportProducts(): void {
    this.productService.exportProducts().subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `products_${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.snackBar.open('Products exported successfully', 'Close', { duration: 3000 });
      },
      error: () => {
        this.snackBar.open('Failed to export products', 'Close', { duration: 3000 });
      }
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.productService.importProducts(file).subscribe({
        next: (response) => {
          if (response.success) {
            this.snackBar.open(`Imported ${response.data.imported} products`, 'Close', { 
              duration: 3000,
              panelClass: ['success-snackbar']
            });
            this.loadProducts();
          }
        },
        error: () => {
          this.snackBar.open('Failed to import products', 'Close', { duration: 3000 });
        }
      });
      input.value = '';
    }
  }

  formatCurrency(amount: number): string {
    return this.settingsService.formatCurrency(amount);
  }
}
