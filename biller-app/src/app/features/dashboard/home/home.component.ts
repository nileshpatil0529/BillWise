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
import { HotelService } from '../../../core/services/hotel.service';
import { Product, CartItem } from '../../../core/models/product.model';
import { Customer } from '../../../core/models/customer.model';
import { RestaurantTable } from '../../../core/models/hotel.model';
import { BarcodeScannerDialogComponent, ScannerDialogData } from './barcode-scanner-dialog/barcode-scanner-dialog.component';
import { InlineScannerComponent } from './inline-scanner/inline-scanner.component';

// Interface for tracking KOT printed quantities per product
interface KotPrintedQuantities {
  [productId: string]: number;
}

// Interface for new items to print in KOT
interface KotNewItem {
  productId: string;
  name: string;
  quantity: number; // Only the new quantity to print
  unitPrice: number;
}

// Interface for tracking attended table state
interface AttendedTableState {
  table: RestaurantTable;
  billId: string | null;
  billStatus: 'new' | 'draft' | 'kot-printed';
  cartItems: CartItem[];
  kotPrintedQuantities: KotPrintedQuantities;
  customerName: string;
  customerPhone: string;
}

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

  // Hotel mode state
  selectedTable = signal<RestaurantTable | null>(null);
  currentBillId = signal<string | null>(null);
  billStatus = signal<'new' | 'draft' | 'kot-printed'>('new');
  kotPrintedQuantities = signal<KotPrintedQuantities>({}); // Track quantities that have been KOT printed
  
  // Multi-table attendance state
  attendedTables = signal<AttendedTableState[]>([]);
  showAttendedTablesMenu = signal(false);

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
    public hotelService: HotelService,
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

    // Load tables if hotel mode
    if (this.isHotelMode()) {
      this.hotelService.loadTables().subscribe();
    }
  }

  // Check if current application type is hotel
  isHotelMode(): boolean {
    return this.settingsService.settings().applicationType === 'hotel';
  }

  // Check if table selection is required (hotel mode without selected table)
  needsTableSelection(): boolean {
    return this.isHotelMode() && !this.selectedTable();
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

  // ==================== HOTEL MODE METHODS ====================

  // Select a table/parcel
  selectTable(table: RestaurantTable): void {
    // Save current table state before switching (if any)
    if (this.selectedTable() && this.selectedTable()!.id !== table.id) {
      this.saveCurrentTableState();
    }
    
    // Check if this table is already in attended tables
    const existingState = this.attendedTables().find(t => t.table.id === table.id);
    if (existingState) {
      // Restore from attended tables
      this.restoreTableState(existingState);
      return;
    }
    
    if (table.status === 'occupied' && table.currentBillId) {
      // Load existing bill for this table
      this.loadExistingBill(table);
    } else {
      // Start new order for this table
      this.selectedTable.set(table);
      this.billStatus.set('new');
      this.currentBillId.set(null);
      this.kotPrintedQuantities.set({});
      this.customerName.set('');
      this.customerPhone.set('');
      this.billService.clearCart();
    }
  }

  // Load existing bill for occupied table
  private loadExistingBill(table: RestaurantTable): void {
    this.billService.getBillById(table.currentBillId!).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          const bill = response.data;
          this.selectedTable.set(table);
          this.currentBillId.set(bill.billId);
          this.billStatus.set(bill.kotPrintedAt ? 'kot-printed' : 'draft');
          
          // Load cart items from bill
          this.billService.clearCart();
          if (bill.items) {
            bill.items.forEach((item: any) => {
              // Cast to Product with minimal required fields
              const product = {
                productId: item.productId,
                name: item.name,
                unitPrice: item.unitPrice,
                category: item.category || 'General',
                stockQuantity: 9999,
                status: 'active' as const
              };
              // Add to cart with quantity
              for (let i = 0; i < item.quantity; i++) {
                this.billService.addToCart(product);
              }
              // Mark already KOT printed items with their quantities
              if (item.kotPrinted) {
                this.kotPrintedQuantities.update(quantities => {
                  return { ...quantities, [item.productId]: item.quantity };
                });
              }
            });
          }
          
          this.snackBar.open(`Loaded order for ${table.tableNumber}`, 'Close', { duration: 2000 });
        }
      },
      error: () => {
        this.snackBar.open('Failed to load existing order', 'Close', { duration: 3000 });
      }
    });
  }

  // Cancel table selection (save state and go to table selection)
  cancelTableSelection(): void {
    // Save current table state if there are items
    if (this.selectedTable() && this.billService.cartItems().length > 0) {
      this.saveCurrentTableState();
    }
    
    this.selectedTable.set(null);
    this.currentBillId.set(null);
    this.billStatus.set('new');
    this.kotPrintedQuantities.set({});
    this.changingTable.set(false);
    this.customerName.set('');
    this.customerPhone.set('');
    this.billService.clearCart();
  }
  
  // State for changing table
  changingTable = signal(false);
  
  // Start change table process
  startChangeTable(): void {
    this.changingTable.set(true);
  }
  
  // Cancel change table
  cancelChangeTable(): void {
    this.changingTable.set(false);
  }
  
  // Change to a new table (keeps cart items)
  changeToTable(newTable: RestaurantTable): void {
    const oldTable = this.selectedTable();
    if (!oldTable || newTable.id === oldTable.id) {
      this.changingTable.set(false);
      return;
    }
    
    // If new table is occupied (and not current table), we can't change to it
    if (newTable.status === 'occupied') {
      this.snackBar.open('Cannot change to an occupied table. Please select an available table.', 'Close', { duration: 3000 });
      return;
    }
    
    // Update the table on the bill if we have one
    if (this.currentBillId()) {
      const updateData = {
        tableId: newTable.id,
        businessTypeData: { tableNumber: newTable.tableNumber, tableType: newTable.tableType }
      };
      
      this.billService.updateBill(this.currentBillId()!, updateData).subscribe({
        next: (response) => {
          if (response.success) {
            // Update old table status to available
            this.hotelService.updateTableStatus(oldTable.id, 'available', undefined).subscribe();
            
            // Update new table status to occupied
            this.hotelService.updateTableStatus(newTable.id, 'occupied', this.currentBillId()!).subscribe();
            
            // Update attended tables state - replace old table with new table
            this.attendedTables.update(tables => {
              return tables.map(state => {
                if (state.table.id === oldTable.id) {
                  return { ...state, table: newTable };
                }
                return state;
              });
            });
            
            // Update local state
            this.selectedTable.set(newTable);
            this.changingTable.set(false);
            
            // Reload tables
            this.hotelService.loadTables().subscribe();
            
            const tableLabel = newTable.tableType === 'parcel' ? `Parcel ${newTable.tableNumber}` : `Table ${newTable.tableNumber}`;
            this.snackBar.open(`Changed to ${tableLabel}`, 'Close', { duration: 2000 });
          }
        },
        error: () => {
          this.snackBar.open('Failed to change table', 'Close', { duration: 3000 });
        }
      });
    } else {
      // No bill yet, just switch table - update attended tables if exists
      this.attendedTables.update(tables => {
        return tables.map(state => {
          if (state.table.id === oldTable.id) {
            return { ...state, table: newTable };
          }
          return state;
        });
      });
      
      this.selectedTable.set(newTable);
      this.changingTable.set(false);
      
      const tableLabel = newTable.tableType === 'parcel' ? `Parcel ${newTable.tableNumber}` : `Table ${newTable.tableNumber}`;
      this.snackBar.open(`Selected ${tableLabel}`, 'Close', { duration: 2000 });
    }
  }

  // Multi-table attendance methods
  
  // Save current table state before switching
  private saveCurrentTableState(): void {
    const table = this.selectedTable();
    if (!table) return;
    
    const currentState: AttendedTableState = {
      table: table,
      billId: this.currentBillId(),
      billStatus: this.billStatus(),
      cartItems: [...this.billService.cartItems()],
      kotPrintedQuantities: { ...this.kotPrintedQuantities() },
      customerName: this.customerName(),
      customerPhone: this.customerPhone()
    };
    
    // Update or add to attended tables
    this.attendedTables.update(tables => {
      const existingIndex = tables.findIndex(t => t.table.id === table.id);
      if (existingIndex >= 0) {
        const updated = [...tables];
        updated[existingIndex] = currentState;
        return updated;
      } else {
        return [...tables, currentState];
      }
    });
  }
  
  // Restore table state when switching back
  private restoreTableState(state: AttendedTableState): void {
    this.selectedTable.set(state.table);
    this.currentBillId.set(state.billId);
    this.billStatus.set(state.billStatus);
    this.kotPrintedQuantities.set({ ...state.kotPrintedQuantities });
    this.customerName.set(state.customerName);
    this.customerPhone.set(state.customerPhone);
    
    // Restore cart items
    this.billService.clearCart();
    state.cartItems.forEach(item => {
      const product = {
        productId: item.productId,
        name: item.name,
        unitPrice: item.unitPrice,
        category: item.category || 'General',
        stockQuantity: 9999,
        status: 'active' as const
      };
      for (let i = 0; i < item.quantity; i++) {
        this.billService.addToCart(product);
      }
    });
  }
  
  // Switch to another attended table
  switchToAttendedTable(tableId: number): void {
    // Save current state first
    this.saveCurrentTableState();
    
    // Find the table state
    const tableState = this.attendedTables().find(t => t.table.id === tableId);
    if (tableState) {
      this.restoreTableState(tableState);
    }
    
    this.showAttendedTablesMenu.set(false);
  }
  
  // Toggle attended tables menu
  toggleAttendedTablesMenu(): void {
    this.showAttendedTablesMenu.update(v => !v);
  }
  
  // Close attended tables menu
  closeAttendedTablesMenu(): void {
    this.showAttendedTablesMenu.set(false);
  }
  
  // Attend a new table (from selection)
  attendNewTable(table: RestaurantTable): void {
    // Save current table state if any
    if (this.selectedTable()) {
      this.saveCurrentTableState();
    }
    
    // Clear current state for new table
    this.billService.clearCart();
    this.currentBillId.set(null);
    this.billStatus.set('new');
    this.kotPrintedQuantities.set({});
    this.customerName.set('');
    this.customerPhone.set('');
    
    // Select the new table (which will load existing order if occupied)
    this.selectTable(table);
  }
  
  // Remove table from attended list (when bill is completed or cancelled)
  removeFromAttendedTables(tableId: number): void {
    this.attendedTables.update(tables => tables.filter(t => t.table.id !== tableId));
  }
  
  // Get attended table count
  getAttendedTableCount(): number {
    const currentTable = this.selectedTable();
    const attendedCount = this.attendedTables().filter(t => t.table.id !== currentTable?.id).length;
    return currentTable ? attendedCount + 1 : attendedCount;
  }

  // Get new items (items with quantities not yet KOT printed)
  getNewItems(): KotNewItem[] {
    const kotPrinted = this.kotPrintedQuantities();
    const newItems: KotNewItem[] = [];
    
    this.billService.cartItems().forEach(item => {
      const printedQty = kotPrinted[item.productId] || 0;
      const newQty = item.quantity - printedQty;
      
      if (newQty > 0) {
        newItems.push({
          productId: item.productId,
          name: item.name,
          quantity: newQty,
          unitPrice: item.unitPrice
        });
      }
    });
    
    return newItems;
  }
  
  // Check if item has been fully KOT printed
  isItemKotPrinted(productId: string): boolean {
    const kotPrinted = this.kotPrintedQuantities();
    const cartItem = this.billService.cartItems().find(i => i.productId === productId);
    if (!cartItem) return false;
    
    const printedQty = kotPrinted[productId] || 0;
    return printedQty >= cartItem.quantity;
  }
  
  // Check if any items have been KOT printed
  hasKotPrintedItems(): boolean {
    return Object.keys(this.kotPrintedQuantities()).length > 0;
  }

  // Print KOT (Kitchen Order Ticket)
  printKOT(): void {
    const newItems = this.getNewItems();
    if (newItems.length === 0) {
      this.snackBar.open('No new items to print', 'Close', { duration: 3000 });
      return;
    }

    const table = this.selectedTable();
    if (!table) return;

    // Save/update bill first
    const billData = {
      tableId: table.id,
      billStatus: 'draft' as const,
      paymentMethod: this.paymentMethod(),
      paymentStatus: 'pending' as const,
      amountPaid: 0,
      customerName: this.customerName(),
      customerPhone: this.customerPhone(),
      businessTypeData: { tableNumber: table.tableNumber, tableType: table.tableType },
      taxEnabled: this.settingsService.settings().taxEnabled,
      kotItems: newItems.map(item => item.productId) // Mark these items as KOT printed
    };

    if (this.currentBillId()) {
      // Update existing bill with new items
      this.billService.updateBill(this.currentBillId()!, billData).subscribe({
        next: (response) => {
          if (response.success) {
            this.printKOTReceipt(newItems);
            // Update KOT printed quantities
            this.updateKotPrintedQuantities(newItems);
            this.billStatus.set('kot-printed');
          }
        },
        error: () => {
          this.snackBar.open('Failed to save order', 'Close', { duration: 3000 });
        }
      });
    } else {
      // Create new bill
      this.billService.createBill(billData).subscribe({
        next: (response) => {
          if (response.success) {
            this.currentBillId.set(response.data.billId);
            this.printKOTReceipt(newItems);
            // Update KOT printed quantities
            this.updateKotPrintedQuantities(newItems);
            this.billStatus.set('kot-printed');
            
            // Update table status
            this.hotelService.updateTableStatus(table.id, 'occupied', response.data.billId).subscribe();
          }
        },
        error: () => {
          this.snackBar.open('Failed to save order', 'Close', { duration: 3000 });
        }
      });
    }
  }
  
  // Update KOT printed quantities after printing
  private updateKotPrintedQuantities(printedItems: KotNewItem[]): void {
    this.kotPrintedQuantities.update(quantities => {
      const updated = { ...quantities };
      printedItems.forEach(item => {
        updated[item.productId] = (updated[item.productId] || 0) + item.quantity;
      });
      return updated;
    });
  }

  // Print KOT receipt (simplified - only items and tip)
  private printKOTReceipt(items: KotNewItem[]): void {
    const table = this.selectedTable();
    const tableLabel = table?.tableType === 'parcel' 
      ? `Parcel ${table?.tableNumber}` 
      : `Table ${table?.tableNumber}`;
    
    let kotContent = `
=== KITCHEN ORDER TICKET ===
${tableLabel}
Time: ${new Date().toLocaleTimeString()}
----------------------------
ITEMS:
${items.map(item => `${item.quantity}x ${item.name}`).join('\n')}`;
    
    kotContent += `\n----------------------------`;
    
    console.log(kotContent);
    this.snackBar.open('KOT sent to kitchen!', 'Close', { duration: 3000 });
  }

  // Complete bill and pay
  completeBill(): void {
    if (!this.currentBillId()) {
      this.snackBar.open('Please print KOT first', 'Close', { duration: 3000 });
      return;
    }

    const table = this.selectedTable();
    
    const billData = {
      billStatus: 'completed' as const,
      paymentMethod: this.paymentMethod(),
      paymentStatus: 'paid' as const,
      amountPaid: this.billService.cartTotal(),
      customerName: this.customerName(),
      customerPhone: this.customerPhone()
    };

    this.billService.updateBill(this.currentBillId()!, billData).subscribe({
      next: (response) => {
        if (response.success) {
          this.snackBar.open('Bill completed successfully!', 'Close', { duration: 3000 });
          
          // Update table status to available
          if (table) {
            this.hotelService.updateTableStatus(table.id, 'available', undefined).subscribe();
            // Remove from attended tables
            this.removeFromAttendedTables(table.id);
          }
          
          // Reset state
          this.cancelTableSelection();
          
          // Reload tables
          this.hotelService.loadTables().subscribe();
        }
      },
      error: () => {
        this.snackBar.open('Failed to complete bill', 'Close', { duration: 3000 });
      }
    });
  }

  // Get available tables for selection
  getAvailableTables(): RestaurantTable[] {
    return this.hotelService.tables().filter(t => t.status === 'available');
  }

  // Get occupied tables
  getOccupiedTables(): RestaurantTable[] {
    return this.hotelService.tables().filter(t => t.status === 'occupied');
  }

  // Get dine-in tables
  getDineInTables(): RestaurantTable[] {
    return this.hotelService.tables().filter(t => t.tableType === 'dine-in');
  }

  // Get parcel/takeaway
  getParcelTables(): RestaurantTable[] {
    return this.hotelService.tables().filter(t => t.tableType === 'parcel');
  }
}
