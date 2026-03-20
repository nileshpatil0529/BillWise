import { Component, OnInit, signal, computed, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatSelectModule } from '@angular/material/select';
import { MatRadioModule } from '@angular/material/radio';
import { MatDividerModule } from '@angular/material/divider';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatBadgeModule } from '@angular/material/badge';
import { debounceTime, Subject } from 'rxjs';

import { ProductService } from '../../../core/services/product.service';
import { BillService } from '../../../core/services/bill.service';
import { SettingsService } from '../../../core/services/settings.service';
import { BeepService } from '../../../core/services/beep.service';
import { CustomerService } from '../../../core/services/customer.service';
import { Product, CartItem } from '../../../core/models/product.model';
import { Customer } from '../../../core/models/customer.model';
import { BarcodeScannerDialogComponent, ScannerDialogData } from './barcode-scanner-dialog/barcode-scanner-dialog.component';
import { InlineScannerComponent } from './inline-scanner/inline-scanner.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatSelectModule,
    MatRadioModule,
    MatDividerModule,
    MatAutocompleteModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTooltipModule,
    MatChipsModule,
    MatBadgeModule,
    InlineScannerComponent
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit {
  @ViewChild('searchInput') searchInput!: ElementRef;
  @ViewChild('inlineScanner') inlineScanner!: InlineScannerComponent;

  searchQuery = signal('');
  searchResults = signal<Product[]>([]);
  searching = signal(false);
  highlightedProductId = signal<string | null>(null);
  
  // Inline scanner state
  showInlineScanner = signal(false);

  paymentMethod = signal<'cash' | 'card' | 'online' | 'debt'>('online');
  customerName = signal('');
  customerPhone = signal('');
  showAddCustomerButton = signal(false);
  private addCustomerTimeout: any = null;

  // Computed signal to check if Save Bill button should be disabled
  isSaveBillDisabled = computed(() => {
    if (this.billService.cartItems().length === 0) {
      return true;
    }
    // If payment method is debt, customer info is required
    if (this.paymentMethod() === 'debt') {
      return !this.customerName().trim() || !this.customerPhone().trim();
    }
    return false;
  });

  // customer search
  customerSuggestions = signal<Customer[]>([]);
  private customerSearchSubject = new Subject<string>();

  // Business type specific fields
  businessTypeForm: FormGroup;

  displayedColumns = ['sno', 'name', 'price', 'quantity', 'total', 'actions'];

  private searchSubject = new Subject<string>();

  constructor(
    public billService: BillService,
    public settingsService: SettingsService,
    private productService: ProductService,
    private snackBar: MatSnackBar,
    private fb: FormBuilder,
    private dialog: MatDialog,
    private beepService: BeepService,
    private customerService: CustomerService
  ) {
    this.businessTypeForm = this.fb.group({
      // Hotel fields
      roomNumber: [''],
      guestName: [''],
      serviceType: [''],
      // Clothing fields
      size: [''],
      color: [''],
      // Electronics fields
      serialNumber: [''],
      warranty: [''],
      // Grocery fields
      weight: ['']
    });
  }

  ngOnInit(): void {
    // Setup search with debounce - products loaded on search only
    this.searchSubject.pipe(
      debounceTime(300)
    ).subscribe(query => {
      if (query && query.length >= 2) {
        this.performSearch(query);
      } else {
        this.searchResults.set([]);
      }
    });

    // Setup customer search with debounce
    this.customerSearchSubject.pipe(
      debounceTime(300)
    ).subscribe(query => {
      if (query && query.length >= 2 && this.paymentMethod() === 'debt') {
        this.searchCustomers(query);
      } else {
        this.customerSuggestions.set([]);
      }
    });
  }

  private searchCustomers(query: string): void {
    // Clear any existing timeout
    if (this.addCustomerTimeout) {
      clearTimeout(this.addCustomerTimeout);
      this.addCustomerTimeout = null;
    }
    this.showAddCustomerButton.set(false);

    this.customerService.searchCustomers(query).subscribe({
      next: (response) => {
        this.customerSuggestions.set(response.data || []);
        
        // If no results and payment method is debt, show Add Customer button after 1 second
        if ((!response.data || response.data.length === 0) && 
            this.paymentMethod() === 'debt' && 
            this.customerName().trim() && 
            this.customerPhone().trim()) {
          this.addCustomerTimeout = setTimeout(() => {
            this.showAddCustomerButton.set(true);
          }, 1000);
        }
      },
      error: () => {
        this.customerSuggestions.set([]);
        
        // Show Add Customer button after 1 second on error too if all conditions are met
        if (this.paymentMethod() === 'debt' && 
            this.customerName().trim() && 
            this.customerPhone().trim()) {
          this.addCustomerTimeout = setTimeout(() => {
            this.showAddCustomerButton.set(true);
          }, 1000);
        }
      }
    });
  }

  onCustomerNameInput(value: string): void {
    this.customerName.set(value);
    this.customerSearchSubject.next(value);
    this.showAddCustomerButton.set(false);
    if (this.addCustomerTimeout) {
      clearTimeout(this.addCustomerTimeout);
      this.addCustomerTimeout = null;
    }
  }

  onCustomerPhoneInput(value: string): void {
    this.customerPhone.set(value);
    this.customerSearchSubject.next(value);
    this.showAddCustomerButton.set(false);
    if (this.addCustomerTimeout) {
      clearTimeout(this.addCustomerTimeout);
      this.addCustomerTimeout = null;
    }
  }

  oncustomerSelected(event: MatAutocompleteSelectedEvent): void {
    const customer = this.customerSuggestions().find(b => b.name === event.option.value);
    if (customer) {
      this.customerName.set(customer.name);
      this.customerPhone.set(customer.phone);
      this.customerSuggestions.set([]);
    }
  }

  oncustomerPhoneSelected(event: MatAutocompleteSelectedEvent): void {
    const customer = this.customerSuggestions().find(b => b.phone === event.option.value);
    if (customer) {
      this.customerName.set(customer.name);
      this.customerPhone.set(customer.phone);
      this.customerSuggestions.set([]);
    }
  }

  addCustomer(): void {
    const name = this.customerName().trim();
    const phone = this.customerPhone().trim();

    if (!name || !phone) {
      this.snackBar.open('Please enter both customer name and phone number', 'Close', { duration: 3000 });
      return;
    }

    this.customerService.createCustomer({ name, phone }).subscribe({
      next: (response) => {
        if (response.success) {
          this.snackBar.open('Customer added successfully', 'Close', { duration: 3000 });
          this.showAddCustomerButton.set(false);
          this.customerSuggestions.set([]);
        }
      },
      error: (error) => {
        this.snackBar.open(error.error?.message || 'Failed to add customer', 'Close', { duration: 3000 });
      }
    });
  }

  onPaymentMethodChange(value: 'cash' | 'card' | 'online' | 'debt'): void {
    this.paymentMethod.set(value);
    if (value !== 'debt') {
      this.customerSuggestions.set([]);
    }
  }

  onSearchInput(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.searchQuery.set(query);
    this.searchSubject.next(query);
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.searchSubject.next('');
  }

  onSearchEnter(event: Event): void {
    event.preventDefault();
    const query = this.searchQuery().trim();
    
    if (!query) return;
    
    // If only one result, add it directly
    if (this.searchResults().length === 1) {
      this.selectProduct(this.searchResults()[0]);
      return;
    }
    
    // Try to find exact match by barcode or productId
    const exactMatch = this.searchResults().find(p => 
      p.barcode === query || 
      p.productId === query ||
      p.barcode?.toLowerCase() === query.toLowerCase() ||
      p.productId.toLowerCase() === query.toLowerCase()
    );
    
    if (exactMatch) {
      this.selectProduct(exactMatch);
    } else if (this.searchResults().length > 0) {
      // If multiple results but no exact match, select first one
      this.selectProduct(this.searchResults()[0]);
    } else {
      // No results found, try direct barcode search
      this.addProductByBarcode(query);
    }
  }

  private performSearch(query: string): void {
    this.searching.set(true);
    this.productService.searchProducts(query).subscribe({
      next: (response) => {
        this.searchResults.set(response.data || []);
        this.searching.set(false);
      },
      error: () => {
        this.searching.set(false);
      }
    });
  }

  selectProduct(product: Product): void {
    this.billService.addToCart(product);
    this.searchQuery.set('');
    this.searchResults.set([]);
    
    // Highlight the added item
    this.highlightedProductId.set(product.productId);
    setTimeout(() => this.highlightedProductId.set(null), 1000);

    this.snackBar.open(`${product.name} added to cart`, 'Close', {
      duration: 2000
    });
  }

  updateQuantity(item: CartItem, change: number): void {
    const newQuantity = item.quantity + change;
    if (newQuantity > 0) {
      this.billService.updateCartItem(item.productId, { quantity: newQuantity });
    } else if (newQuantity === 0) {
      this.removeItem(item.productId);
    }
  }

  removeItem(productId: string): void {
    this.billService.removeFromCart(productId);
    this.snackBar.open('Item removed', 'Close', { duration: 2000 });
  }

  clearCart(): void {
    this.billService.clearCart();
    this.billService.billDiscount.set(0);
    this.customerName.set('');
    this.customerPhone.set('');
    this.businessTypeForm.reset();
    this.snackBar.open('Cart cleared', 'Close', { duration: 2000 });
  }

  saveBill(): void {
    if (this.billService.cartItems().length === 0) {
      this.snackBar.open('Cart is empty', 'Close', { 
        duration: 3000,
        panelClass: ['warning-snackbar']
      });
      return;
    }

    // Validate customer info for debt payment
    if (this.paymentMethod() === 'debt') {
      if (!this.customerName().trim()) {
        this.snackBar.open('Customer name is required for debt payment', 'Close', { 
          duration: 3000,
          panelClass: ['warning-snackbar']
        });
        return;
      }
      if (!this.customerPhone().trim()) {
        this.snackBar.open('Phone number is required for debt payment', 'Close', { 
          duration: 3000,
          panelClass: ['warning-snackbar']
        });
        return;
      }
    }

    const billData = {
      paymentMethod: this.paymentMethod(),
      paymentStatus: this.paymentMethod() === 'debt' ? 'pending' : 'paid',
      amountPaid: this.paymentMethod() === 'debt' ? 0 : this.billService.cartTotal(),
      customerName: this.customerName(),
      customerPhone: this.customerPhone(),
      businessTypeData: this.businessTypeForm.value,
      taxEnabled: this.settingsService.settings().taxEnabled
    };

    this.billService.createBill(billData).subscribe({
      next: (response) => {
        if (response.success) {
          this.snackBar.open(`Bill ${response.data.billNumber} saved successfully!`, 'Close', {
            duration: 3000,
            panelClass: ['success-snackbar']
          });
          this.clearCart();
        }
      },
      error: (error) => {
        this.snackBar.open('Failed to save bill', 'Close', {
          duration: 3000,
          panelClass: ['error-snackbar']
        });
      }
    });
  }

  openBarcodeScanner(): void {
    this.showInlineScanner.set(true);
  }

  closeInlineScanner(): void {
    this.showInlineScanner.set(false);
  }

  onScannerBarcodeScanned(barcode: string): void {
    // Search for product by barcode and auto-add to cart
    this.productService.searchProducts(barcode).subscribe({
      next: (response) => {
        const products: Product[] = response.data || [];
        const product = products.find((p: Product) => 
          p.productId === barcode || 
          p.barcode === barcode ||
          p.productId.toLowerCase() === barcode.toLowerCase()
        );

        if (product) {
          // Check if product already in cart
          const existingItem = this.billService.cartItems().find(item => item.productId === product.productId);
          
          if (existingItem) {
            // Increase quantity
            this.billService.updateCartItem(product.productId, { quantity: existingItem.quantity + 1 });
            this.beepService.playSuccess();
            this.snackBar.open(`${product.name} quantity increased`, 'Close', {
              duration: 2000,
              panelClass: ['success-snackbar']
            });
          } else {
            // Add new item
            this.selectProduct(product);
            this.snackBar.open(`${product.name} added to cart`, 'Close', {
              duration: 2000,
              panelClass: ['success-snackbar']
            });
          }
          this.inlineScanner?.setProductAdded();
        } else if (products.length > 0) {
          // Add first match if no exact match
          const firstProduct = products[0];
          const existingItem = this.billService.cartItems().find(item => item.productId === firstProduct.productId);
          
          if (existingItem) {
            this.billService.updateCartItem(firstProduct.productId, { quantity: existingItem.quantity + 1 });
            this.beepService.playSuccess();
            this.snackBar.open(`${firstProduct.name} quantity increased`, 'Close', {
              duration: 2000,
              panelClass: ['success-snackbar']
            });
          } else {
            this.selectProduct(firstProduct);
            this.snackBar.open(`${firstProduct.name} added to cart`, 'Close', {
              duration: 2000,
              panelClass: ['success-snackbar']
            });
          }
          this.inlineScanner?.setProductAdded();
        } else {
          this.inlineScanner?.setNotFound();
          this.snackBar.open(`Product not found for barcode: ${barcode}`, 'Close', {
            duration: 3000,
            panelClass: ['error-snackbar']
          });
        }
      },
      error: () => {
        this.inlineScanner?.setNotFound();
        this.snackBar.open('Failed to search product', 'Close', {
          duration: 3000
        });
      }
    });
  }

  onScannerProductAdded(product: Product): void {
    // This method is no longer needed as products are auto-added in onScannerBarcodeScanned
    // Kept for backward compatibility
  }

  private addProductByBarcode(barcode: string): void {
    // Trim whitespace and special characters
    const cleanBarcode = barcode.trim().replace(/[\r\n]/g, '');
    
    // Search for product by barcode/productId
    this.productService.searchProducts(cleanBarcode).subscribe({
      next: (response) => {
        const products: Product[] = response.data || [];
        
        // Try to find exact match by productId or barcode
        const product = products.find((p: Product) => 
          p.productId === cleanBarcode || 
          p.barcode === cleanBarcode ||
          p.productId.toLowerCase() === cleanBarcode.toLowerCase() ||
          p.barcode?.toLowerCase() === cleanBarcode.toLowerCase()
        );

        if (product) {
          this.beepService.playSuccess();
          this.selectProduct(product);
          this.snackBar.open(`${product.name} added to cart`, 'Close', {
            duration: 2000,
            panelClass: ['success-snackbar']
          });
        } else if (products.length > 0) {
          // Add first match if no exact match
          this.beepService.playSuccess();
          this.selectProduct(products[0]);
          this.snackBar.open(`${products[0].name} added to cart`, 'Close', {
            duration: 2000,
            panelClass: ['success-snackbar']
          });
        } else {
          this.beepService.playError();
          this.snackBar.open(`Product not found for barcode: ${barcode}`, 'Close', {
            duration: 3000,
            panelClass: ['error-snackbar']
          });
        }
      },
      error: () => {
        this.beepService.playError();
        this.snackBar.open('Failed to search product', 'Close', {
          duration: 3000,
          panelClass: ['error-snackbar']
        });
      }
    });
  }

  getItemTotal(item: CartItem): number {
    return item.unitPrice * item.quantity;
  }

  formatCurrency(amount: number): string {
    return this.settingsService.formatCurrency(amount);
  }

  getApplicationType(): string {
    return this.settingsService.settings().applicationType;
  }
}
