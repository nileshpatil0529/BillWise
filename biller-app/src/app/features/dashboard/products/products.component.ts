import { Component, OnInit, OnDestroy, signal, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
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
import { ScrollingModule } from '@angular/cdk/scrolling';
import { Subject, debounceTime, distinctUntilChanged, takeUntil, fromEvent } from 'rxjs';

import { ProductService } from '../../../core/services/product.service';
import { SettingsService } from '../../../core/services/settings.service';
import { BeepService } from '../../../core/services/beep.service';
import { Product } from '../../../core/models/product.model';
import { ProductDialogComponent } from './product-dialog/product-dialog.component';
import { BarcodePrintDialogComponent } from './barcode-print-dialog/barcode-print-dialog.component';
import { BarcodeScannerDialogComponent } from '../home/barcode-scanner-dialog/barcode-scanner-dialog.component';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
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
    MatProgressSpinnerModule,
    ScrollingModule
  ],
  templateUrl: './products.component.html',
  styleUrl: './products.component.scss'
})
export class ProductsComponent implements OnInit, OnDestroy {
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild('tableContainer') tableContainer!: ElementRef;

  // All available columns
  private allColumns = ['productId', 'name', 'barcode', 'category', 'unitPrice', 'stockQuantity', 'status', 'actions'];
  displayedColumns: string[] = [];
  
  dataSource = new MatTableDataSource<Product>([]);
  loading = signal(false);
  loadingMore = signal(false);
  searchQuery = signal('');
  selectedCategory = signal('');

  // Lazy loading state
  currentPage = signal(1);
  pageSize = 50; // Load 50 items at a time
  hasMore = signal(true);
  allProducts = signal<Product[]>([]);

  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    public productService: ProductService,
    public settingsService: SettingsService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private beepService: BeepService
  ) {
    // Update displayedColumns based on settings
    effect(() => {
      const settings = this.settingsService.settings();
      const tableColumns = settings.tableColumns?.products;
      
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
    // Load categories and initial products
    this.productService.getCategories().subscribe();
    this.loadProducts(true);
    
    // Setup search with debounce
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(query => {
      this.searchQuery.set(query);
      this.loadProducts(true); // Reset and reload
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
    
    if (atBottom && !this.loadingMore() && this.hasMore() && !this.loading()) {
      this.loadProducts(false);
    }
  }

  loadProducts(reset: boolean = false): void {
    if (reset) {
      this.currentPage.set(1);
      this.hasMore.set(true);
      this.allProducts.set([]);
      this.loading.set(true);
    } else {
      this.loadingMore.set(true);
    }

    this.productService.getProducts({
      category: this.selectedCategory() || undefined,
      search: this.searchQuery() || undefined,
      page: this.currentPage(),
      limit: this.pageSize
    }).subscribe({
      next: (response) => {
        if (response.success) {
          const newProducts = response.data.products;
          
          if (reset) {
            this.allProducts.set(newProducts);
          } else {
            this.allProducts.set([...this.allProducts(), ...newProducts]);
          }
          
          this.dataSource.data = this.allProducts();
          this.hasMore.set(newProducts.length === this.pageSize);
          
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
        this.snackBar.open('Failed to load products', 'Close', { duration: 3000 });
      }
    });
  }

  applyFilter(event: Event): void {
    const filterValue = (event.target as HTMLInputElement).value;
    this.searchSubject.next(filterValue.trim());
  }

  onCategoryChange(): void {
    this.loadProducts(true); // Reset and reload
  }

  openAddDialog(barcode?: string): void {
    const initialProduct = barcode ? { barcode, confirmBarcode: barcode } as Partial<Product> : undefined;
    const dialogRef = this.dialog.open(ProductDialogComponent, {
      width: '600px',
      data: { mode: 'add', product: initialProduct as Product }
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
              this.loadProducts(true);
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
              this.loadProducts(true);
            }
          },
          error: () => {
            this.snackBar.open('Failed to update product', 'Close', { duration: 3000 });
          }
        });
      }
    });
  }

  openBarcodeScanner(): void {
    const dialogRef = this.dialog.open(BarcodeScannerDialogComponent, {
      width: '500px',
      maxWidth: '90vw',
      data: { mode: 'single', title: 'Scan Product Barcode' }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.handleScannedBarcode(result);
      }
    });
  }

  handleScannedBarcode(barcode: string): void {
    this.beepService.playSuccess();
    this.loading.set(true);

    // Search for product with this barcode
    this.productService.searchProducts(barcode).subscribe({
      next: (response) => {
        this.loading.set(false);
        const products: Product[] = response.data || [];
        
        // Find exact barcode match
        const product = products.find((p: Product) => 
          p.barcode === barcode
        );

        if (product) {
          // Product exists - open edit dialog
          this.snackBar.open(`Product found: ${product.name}`, 'Close', { 
            duration: 2000,
            panelClass: ['success-snackbar']
          });
          this.openEditDialog(product);
        } else {
          // Product not found - open add dialog with barcode prefilled
          this.snackBar.open('Product not found. Opening add dialog...', 'Close', { 
            duration: 2000,
            panelClass: ['info-snackbar']
          });
          this.openAddDialog(barcode);
        }
      },
      error: () => {
        this.loading.set(false);
        this.snackBar.open('Error searching for product. Opening add dialog...', 'Close', { 
          duration: 3000 
        });
        this.openAddDialog(barcode);
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
            this.loadProducts(true);
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
            this.loadProducts(true);
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

  openPrintBarcodeDialog(product: Product): void {
    const dialogRef = this.dialog.open(BarcodePrintDialogComponent, {
      width: '500px',
      data: { product }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && product.barcode) {
        this.loading.set(true);
        this.productService.printBarcode(product.barcode, result.quantity).subscribe({
          next: (response: any) => {
            this.loading.set(false);
            if (response.success) {
              this.snackBar.open(
                `Sent ${result.quantity} barcode(s) to printer successfully`,
                'Close',
                { duration: 3000, panelClass: ['success-snackbar'] }
              );
            }
          },
          error: (error: any) => {
            this.loading.set(false);
            const message = error.error?.message || 'Failed to print barcode';
            this.snackBar.open(message, 'Close', { duration: 5000 });
          }
        });
      }
    });
  }
}
