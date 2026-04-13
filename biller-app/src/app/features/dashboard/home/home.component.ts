import { Component, OnInit, OnDestroy, signal, computed, ViewChild, ElementRef, inject, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
import { MatMenuModule } from '@angular/material/menu';
import { debounceTime, Subject, Subscription } from 'rxjs';

import { ProductService } from '../../../core/services/product.service';
import { BillService } from '../../../core/services/bill.service';
import { SettingsService } from '../../../core/services/settings.service';
import { BeepService } from '../../../core/services/beep.service';
import { CustomerService } from '../../../core/services/customer.service';
import { HotelService } from '../../../core/services/hotel.service';
import { TranslateService } from '../../../core/services/translate.service';
import { BarcodeScannerService } from '../../../core/services/barcode-scanner.service';
import { SocketService } from '../../../core/services/socket.service';
import { Product, CartItem } from '../../../core/models/product.model';
import { Customer } from '../../../core/models/customer.model';
import { RestaurantTable } from '../../../core/models/hotel.model';
import { Unit } from '../../../core/models/settings.model';

// Interface for tracking attended table state
interface AttendedTableState {
  table: RestaurantTable;
  billId: string | null;
  billStatus: 'new' | 'draft' | 'kot-printed';
  cartItems: CartItem[];
  customerName: string;
  customerPhone: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
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
    MatMenuModule
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit, OnDestroy {
  @ViewChild('searchInput') searchInput!: ElementRef;

  searchQuery = signal('');
  searchResults = signal<Product[]>([]);
  searching = signal(false);
  highlightedProductId = signal<string | null>(null);

  // Barcode scanner subscription
  private scannerSubscription: Subscription | null = null;

  // Hotel mode state
  selectedTable = signal<RestaurantTable | null>(null);
  currentBillId = signal<string | null>(null);
  billStatus = signal<'new' | 'draft' | 'kot-printed'>('new');
  hotelModeInitialized = signal(false); // Flag to track if hotel mode has finished initializing
  savedCartSnapshot = signal<string>(''); // JSON snapshot of last saved cart state
  tableSelectionDismissed = signal(false); // Flag to track if user dismissed table selection popup
  private socketListenersSetup = false; // Flag to prevent duplicate listener registration
  
  // Multi-table attendance state
  attendedTables = signal<AttendedTableState[]>([]);

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

  // Cart table columns - dynamically includes 'note' for hotel mode, 'warranty' for electronics mode
  get displayedColumns(): string[] {
    if (this.isHotelMode()) {
      return ['sno', 'name', 'price', 'quantity', 'note', 'total', 'actions'];
    }
    if (this.isElectronicsMode()) {
      return ['sno', 'name', 'price', 'quantity', 'warranty', 'total', 'actions'];
    }
    return ['sno', 'name', 'price', 'quantity', 'total', 'actions'];
  }

  private searchSubject = new Subject<string>();

  constructor(
    public billService: BillService,
    public settingsService: SettingsService,
    public hotelService: HotelService,
    public translateService: TranslateService,
    private productService: ProductService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private beepService: BeepService,
    private customerService: CustomerService,
    private barcodeScannerService: BarcodeScannerService,
    private socketService: SocketService
  ) {
  }

  ngOnDestroy(): void {
    // Cleanup scanner subscription
    if (this.scannerSubscription) {
      this.scannerSubscription.unsubscribe();
    }

    // Cleanup socket listeners
    if (this.isHotelMode()) {
      this.socketService.off('table-updated');
      this.socketService.off('tables-refresh-needed');
      this.socketService.off('bill-created');
      this.socketService.off('bill-updated');
      this.socketService.off('kot-printed');
    }
  }

  ngOnInit(): void {
    // Subscribe to barcode scanner events (USB scanner like Brontix)
    if (this.settingsService.settings().scannerType === 'usb') {
      this.scannerSubscription = this.barcodeScannerService.scan$.subscribe(scanResult => {
        this.handleBarcodeScan(scanResult.barcode);
      });
      // Ensure scanner is listening
      if (!this.barcodeScannerService.isListening()) {
        this.barcodeScannerService.startListening();
      }
    }

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
      console.log('🏨 Hotel mode detected');
      this.hotelService.loadTables().subscribe({
        next: () => {
          // Restore last selected table if any
          this.restoreLastSelectedTable();
        }
      });
      this.hotelService.loadItemNotes().subscribe();

      // Setup socket listeners after socket connects
      this.trySetupSocketListeners();
    } else {
      console.log('⚠️ Not in hotel mode, socket listeners NOT set up');
    }
  }

  // Try to setup socket listeners, will retry when socket connects
  private trySetupSocketListeners(): void {
    if (this.socketListenersSetup) {
      console.log('⚠️ Socket listeners already set up, skipping');
      return;
    }

    if (this.socketService.connected()) {
      console.log('✅ Socket is connected, setting up listeners now...');
      this.setupSocketListeners();
      this.socketListenersSetup = true;
    } else {
      console.log('⏳ Socket not connected yet, will retry in 1 second...');
      setTimeout(() => this.trySetupSocketListeners(), 1000);
    }
  }

  // Restore last selected table from localStorage
  private restoreLastSelectedTable(): void {
    const savedTableId = localStorage.getItem('lastSelectedTableId');
    if (savedTableId) {
      const tableId = parseInt(savedTableId, 10);
      const table = this.hotelService.tables().find(t => t.id === tableId);
      if (table && table.status === 'occupied') {
        // Auto-select the occupied table - this will set hotelModeInitialized after loading bill
        this.selectTableWithInit(table);
        return;
      } else {
        // Clear saved table if not found or not occupied
        localStorage.removeItem('lastSelectedTableId');
      }
    }
    // No saved table or table not found - mark as initialized
    this.hotelModeInitialized.set(true);
  }

  // Select table and mark hotel mode as initialized
  private selectTableWithInit(table: RestaurantTable): void {
    if (table.status === 'occupied' && table.currentBillId) {
      // Load existing bill for this table
      this.billService.getBillById(table.currentBillId).subscribe({
        next: (response) => {
          if (response.success && response.data) {
            const bill = response.data;
            this.selectedTable.set(table);
            this.saveSelectedTable(table.id);
            this.currentBillId.set(bill.billId);
            this.billStatus.set(bill.kotPrintedAt ? 'kot-printed' : 'draft');
            
            // Load cart items from bill
            this.billService.clearCart();
            if (bill.items) {
              const cartItems = bill.items.map((item: any) => ({
                productId: item.productId,
                name: item.name,
                unitPrice: item.unitPrice,
                category: item.category || 'General',
                stockQuantity: 9999,
                status: 'active' as const,
                quantity: item.quantity,
                discount: 0,
                discountType: 'fixed' as const,
                lineTotal: item.unitPrice * item.quantity,
                note: item.note // Preserve note when loading existing bill
              }));
              this.billService.cartItems.set(cartItems);
            }
          }
          this.hotelModeInitialized.set(true);
        },
        error: () => {
          this.hotelModeInitialized.set(true);
        }
      });
    } else {
      this.selectedTable.set(table);
      this.saveSelectedTable(table.id);
      this.hotelModeInitialized.set(true);
    }
  }

  // Save selected table to localStorage
  private saveSelectedTable(tableId: number | null): void {
    if (tableId) {
      localStorage.setItem('lastSelectedTableId', tableId.toString());
    } else {
      localStorage.removeItem('lastSelectedTableId');
    }
  }

  // Check if current application type is hotel
  isHotelMode(): boolean {
    return this.settingsService.settings().applicationType === 'hotel';
  }

  // Check if current application type is electronics
  isElectronicsMode(): boolean {
    return this.settingsService.settings().applicationType === 'electronics';
  }

  // Get display name based on receipt language setting (Hindi if selected and available, else English)
  getDisplayName(item: { name: string; nameHi?: string }): string {
    const settings = this.settingsService.settings();
    if (settings.receiptLanguage === 'hi' && item.nameHi) {
      return item.nameHi;
    }
    return item.name;
  }

  // Check if table selection is required (hotel mode without selected table)
  needsTableSelection(): boolean {
    // Don't show table selection until hotel mode is initialized
    if (!this.hotelModeInitialized()) return false;
    // Don't show if user has dismissed it
    if (this.tableSelectionDismissed()) return false;
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
          this.showAddCustomerButton.set(false);
          this.customerSuggestions.set([]);;
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
    
    // Skip if a barcode scan was just processed (prevents duplicate adds)
    if (this.barcodeScannerService.wasScanProcessedRecently(300)) {
      this.clearSearch();
      return;
    }
    
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
        // Adjust stock quantities based on cart contents
        const products = (response.data || []).map((product: Product) => ({
          ...product,
          stockQuantity: product.stockQuantity - this.getCartQuantity(product.productId)
        }));
        this.searchResults.set(products);
        this.searching.set(false);
      },
      error: () => {
        this.searching.set(false);
      }
    });
  }

  selectProduct(product: Product): void {
    // stockQuantity is already adjusted (original - cart qty) from search/barcode scan
    // Check if no stock available (skip for hotel mode - hotels don't track inventory)
    const isHotel = this.isHotelMode();
    if (!isHotel && product.stockQuantity <= 0) {
      this.beepService.playError();
      this.openOutOfStockDialog(product);
      this.searchQuery.set('');
      this.searchResults.set([]);
      return;
    }

    // Check if it's a loose item in grocery mode - need to prompt for quantity
    const isGroceryMode = this.settingsService.settings().applicationType === 'grocery';
    if (isGroceryMode && product.isLooseItem) {
      this.openLooseItemDialog(product);
      return;
    }

    this.billService.addToCart(product);
    this.searchQuery.set('');
    this.searchResults.set([]);
    
    // Highlight the added item
    this.highlightedProductId.set(product.productId);
    setTimeout(() => this.highlightedProductId.set(null), 1000);
  }

  // Helper to get current quantity in cart for a product
  getCartQuantity(productId: string): number {
    const cartItem = this.billService.cartItems().find(item => item.productId === productId);
    return cartItem ? cartItem.quantity : 0;
  }

  // Out of stock dialog
  showOutOfStockDialog = signal(false);
  outOfStockProduct = signal<Product | null>(null);

  openOutOfStockDialog(product: Product): void {
    this.outOfStockProduct.set(product);
    this.showOutOfStockDialog.set(true);
  }

  closeOutOfStockDialog(): void {
    this.showOutOfStockDialog.set(false);
    this.outOfStockProduct.set(null);
  }

  // Open dialog to enter quantity for loose items
  looseItemQuantity = signal<number>(0);
  selectedLooseProduct = signal<Product | null>(null);
  showLooseItemDialog = signal(false);
  
  openLooseItemDialog(product: Product): void {
    this.selectedLooseProduct.set(product);
    this.looseItemQuantity.set(0);
    this.showLooseItemDialog.set(true);
    this.searchQuery.set('');
    this.searchResults.set([]);
  }

  closeLooseItemDialog(): void {
    this.showLooseItemDialog.set(false);
    this.selectedLooseProduct.set(null);
    this.looseItemQuantity.set(0);
  }

  addLooseItemToCart(): void {
    const product = this.selectedLooseProduct();
    const quantity = this.looseItemQuantity();
    
    if (!product || quantity <= 0) {
      this.snackBar.open('Please enter a valid quantity', 'Close', { duration: 2000 });
      return;
    }

    // Check if total quantity would exceed stock
    const currentCartQty = this.getCartQuantity(product.productId);
    const totalQty = currentCartQty + quantity;
    if (totalQty > product.stockQuantity) {
      this.beepService.playError();
      const available = product.stockQuantity - currentCartQty;
      this.snackBar.open(
        `Only ${available.toFixed(2)} ${product.unit || 'pcs'} available (${currentCartQty.toFixed(2)} already in cart)`, 
        'Close', 
        { duration: 3000, panelClass: ['warning-snackbar'] }
      );
      return;
    }

    this.billService.addLooseItemToCart(product, quantity);
    
    // Highlight the added item
    this.highlightedProductId.set(product.productId);
    setTimeout(() => this.highlightedProductId.set(null), 1000);

    this.closeLooseItemDialog();
  }

  getLooseItemUnit(): string {
    return this.selectedLooseProduct()?.unit || 'pcs';
  }

  getLooseItemTotal(): number {
    const product = this.selectedLooseProduct();
    if (!product) return 0;
    return this.looseItemQuantity() * product.unitPrice;
  }

  onLooseQuantityChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.looseItemQuantity.set(parseFloat(value) || 0);
  }

  updateQuantity(item: CartItem, change: number): void {
    const newQuantity = item.quantity + change;
    // For loose items, use 0.01 as minimum, for regular items use 1
    const minQuantity = item.isLooseItem ? 0.01 : 1;
    
    // Check stock limit when increasing quantity (skip for hotel mode)
    if (change > 0 && !this.isHotelMode() && newQuantity > item.stockQuantity) {
      this.beepService.playError();
      this.snackBar.open(`Only ${item.stockQuantity} available in stock`, 'Close', {
        duration: 3000,
        panelClass: ['warning-snackbar']
      });
      return;
    }
    
    if (newQuantity >= minQuantity) {
      this.billService.updateCartItem(item.productId, { quantity: newQuantity });
    } else if (newQuantity <= 0) {
      this.removeItem(item.productId);
    }
  }

  removeItem(productId: string): void {
    this.billService.removeFromCart(productId);
  }

  updateItemNote(item: CartItem, note: string): void {
    this.billService.updateCartItem(item.productId, { note: note || undefined });
  }

  clearCart(): void {
    // Mark table as available if in hotel mode
    if (this.isHotelMode() && this.selectedTable()) {
      const currentTable = this.selectedTable();
      this.hotelService.updateTableStatus(currentTable!.id, 'available', undefined).subscribe({
        next: () => {
          // Reload tables to reflect the change
          this.hotelService.loadTables().subscribe();
        },
        error: (err) => {
          console.error('Error updating table status:', err);
        }
      });
    }

    // Clear cart items from backend and reset UI
    this.billService.clearCart();
    this.billService.billDiscount.set(0);
    this.customerName.set('');
    this.customerPhone.set('');
    this.selectedTable.set(null);
    this.currentBillId.set(null);
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
      taxEnabled: this.settingsService.settings().taxEnabled
    };

    this.billService.createBill(billData).subscribe({
      next: (response) => {
        if (response.success) {
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

  saveBillAndPrint(): void {
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
      taxEnabled: this.settingsService.settings().taxEnabled
    };

    this.billService.createBill(billData).subscribe({
      next: (response) => {
        if (response.success && response.data?.billId) {
          // Print the bill
          this.billService.printBill(response.data.billId).subscribe({
            next: () => {
              this.snackBar.open('Bill saved and printed successfully', 'Close', { duration: 3000 });
              this.clearCart();
            },
            error: () => {
              this.snackBar.open('Bill saved but printing failed', 'Close', { duration: 3000 });
              this.clearCart();
            }
          });
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

  private addProductByBarcode(barcode: string): void {
    // Trim whitespace and special characters
    const cleanBarcode = barcode.trim().replace(/[\r\n]/g, '');
    
    // Search for product by barcode/productId
    this.productService.searchProducts(cleanBarcode).subscribe({
      next: (response) => {
        const products: Product[] = response.data || [];
        
        // Try to find exact match by productId or barcode
        let product = products.find((p: Product) => 
          p.productId === cleanBarcode || 
          p.barcode === cleanBarcode ||
          p.productId.toLowerCase() === cleanBarcode.toLowerCase() ||
          p.barcode?.toLowerCase() === cleanBarcode.toLowerCase()
        );

        // If no exact match, use first result
        if (!product && products.length > 0) {
          product = products[0];
        }

        if (product) {
          // Adjust stock quantity based on cart contents
          const adjustedProduct = {
            ...product,
            stockQuantity: product.stockQuantity - this.getCartQuantity(product.productId)
          };
          
          const isHotel = this.isHotelMode();
          if (!isHotel && adjustedProduct.stockQuantity <= 0) {
            this.beepService.playError();
            this.openOutOfStockDialog(adjustedProduct);
          } else {
            this.beepService.playSuccess();
            this.selectProduct(adjustedProduct);
          }
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

  /**
   * Handle barcode scan from USB scanner (Brontix 1D/2D)
   * Searches for product by barcode and adds to cart automatically
   */
  private handleBarcodeScan(barcode: string): void {
    const cleanBarcode = barcode.trim().replace(/[\r\n]/g, '');
    
    if (cleanBarcode.length < 3) {
      return; // Too short to be a valid barcode
    }

    // Clear search input (scanner types in the input field)
    this.clearSearch();

    // Search for product by barcode
    this.productService.searchProducts(cleanBarcode).subscribe({
      next: (response) => {
        const products: Product[] = response.data || [];
        
        // Try exact match first by barcode field
        let product = products.find((p: Product) => 
          p.barcode === cleanBarcode || 
          p.barcode?.toLowerCase() === cleanBarcode.toLowerCase()
        );
        
        // If no exact barcode match, try productId
        if (!product) {
          product = products.find((p: Product) =>
            p.productId === cleanBarcode ||
            p.productId.toLowerCase() === cleanBarcode.toLowerCase()
          );
        }

        // If no exact match, use first result
        if (!product && products.length > 0) {
          product = products[0];
        }

        if (product) {
          // Adjust stock quantity based on cart contents (same as search)
          const adjustedProduct = {
            ...product,
            stockQuantity: product.stockQuantity - this.getCartQuantity(product.productId)
          };
          
          const isHotel = this.isHotelMode();
          if (!isHotel && adjustedProduct.stockQuantity <= 0) {
            this.beepService.playError();
            this.openOutOfStockDialog(adjustedProduct);
          } else {
            this.beepService.playSuccess();
            this.selectProduct(adjustedProduct);
          }
        } else {
          this.beepService.playError();
          this.snackBar.open(`Product not found: ${cleanBarcode}`, 'Close', {
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
      this.saveSelectedTable(table.id);
      this.billStatus.set('new');
      this.currentBillId.set(null);
      this.customerName.set('');
      this.customerPhone.set('');
      this.billService.clearCart();
      this.savedCartSnapshot.set('[]'); // Initialize empty snapshot for new order
      
      // Mark table as occupied immediately (billId will be assigned when bill is saved)
      this.hotelService.updateTableStatus(table.id, 'occupied', undefined).subscribe({
        next: () => {
          console.log(`✅ Table ${table.tableNumber} marked as occupied`);
        },
        error: (err) => {
          console.error('Failed to mark table as occupied:', err);
        }
      });
    }
  }

  // Load existing bill for occupied table
  private loadExistingBill(table: RestaurantTable): void {
    this.billService.getBillById(table.currentBillId!).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          const bill = response.data;
          const isAlreadyTrackingThisBill = this.currentBillId() === bill.billId;
          
          this.selectedTable.set(table);
          this.saveSelectedTable(table.id);
          this.currentBillId.set(bill.billId);
          this.billStatus.set(bill.kotPrintedAt ? 'kot-printed' : 'draft');
          
          // Load cart items from bill
          this.billService.clearCart();
          if (bill.items) {
            const cartItems = bill.items.map((item: any) => ({
              productId: item.productId,
              name: item.name,
              unitPrice: item.unitPrice,
              category: item.category || 'General',
              stockQuantity: 9999,
              status: 'active' as const,
              quantity: item.quantity,
              discount: 0,
              discountType: 'fixed' as const,
              lineTotal: item.unitPrice * item.quantity,
              note: item.note // Preserve note when loading existing bill
            }));
            this.billService.cartItems.set(cartItems);
          }
          // Update snapshot after loading bill items
          this.updateCartSnapshot();
        }
      },
      error: () => {
        this.snackBar.open('Failed to load existing order', 'Close', { duration: 3000 });
      }
    });
  }

  // Dismiss table selection popup
  dismissTableSelection(): void {
    this.tableSelectionDismissed.set(true);
  }

  // Cancel table selection (save state and go to table selection)
  cancelTableSelection(): void {
    // Save current table state if there are items
    if (this.selectedTable() && this.billService.cartItems().length > 0) {
      this.saveCurrentTableState();
    }
    
    this.selectedTable.set(null);
    this.saveSelectedTable(null);
    this.tableSelectionDismissed.set(false); // Reset dismissed flag when canceling
    this.currentBillId.set(null);
    this.billStatus.set('new');
    this.changingTable.set(false);
    this.customerName.set('');
    this.customerPhone.set('');
    this.billService.clearCart();
    this.savedCartSnapshot.set(''); // Reset snapshot
  }
  
  // State for changing table
  changingTable = signal(false);
  tableMode = signal<'change-table' | 'attend-new' | 'switch-table'>('change-table');
  
  // Start change table process
  startChangeTable(): void {
    this.changingTable.set(true);
    this.tableMode.set('change-table'); // Default to Change Table mode
  }
  
  // Set table mode
  setTableMode(mode: 'change-table' | 'attend-new' | 'switch-table'): void {
    this.tableMode.set(mode);
  }
  
  // Handle table click based on mode
  handleTableClick(table: RestaurantTable): void {
    const mode = this.tableMode();
    
    if (mode === 'change-table') {
      // Change Table mode - switch to work on another occupied table
      this.changeToTable(table);
    } else if (mode === 'attend-new') {
      // Attend New Table mode - start fresh order on available table
      this.selectTable(table);
      this.cancelChangeTable();
    } else if (mode === 'switch-table') {
      // Switch Table mode - move current order to another available table
      this.switchToTable(table);
    }
  }
  
  // Cancel change table
  cancelChangeTable(): void {
    this.changingTable.set(false);
    this.tableMode.set('change-table');
  }
  
  // Switch current table to another available table (keeps cart items and updates backend)
  switchToTable(newTable: RestaurantTable): void {
    const oldTable = this.selectedTable();
    if (!oldTable) {
      return;
    }
    
    if (newTable.id === oldTable.id) {
      return; // Same table
    }
    
    // Save current table state
    this.saveCurrentTableState();
    
    // If we have an active bill, update it in the backend
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
            
            // Update new table status to occupied with current bill
            this.hotelService.updateTableStatus(newTable.id, 'occupied', this.currentBillId()!).subscribe();
            
            // Update attended tables state
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
            this.saveSelectedTable(newTable.id);
            
            // Close the overlay
            this.cancelChangeTable();
            
            // Reload tables to get fresh status
            this.hotelService.loadTables().subscribe({
              next: () => {
                const refreshedTable = this.hotelService.tables().find(t => t.id === newTable.id);
                if (refreshedTable) {
                  this.selectedTable.set(refreshedTable);
                }
              }
            });
            
            this.snackBar.open(`Switched to ${newTable.tableNumber}`, 'Close', { duration: 2000 });
          }
        },
        error: () => {
          this.snackBar.open('Failed to switch table', 'Close', { duration: 3000 });
        }
      });
    } else {
      // No bill yet, just update local state
      this.selectedTable.set(newTable);
      this.saveSelectedTable(newTable.id);
      
      // Close the overlay
      this.cancelChangeTable();
      
      this.snackBar.open(`Switched to ${newTable.tableNumber}`, 'Close', { duration: 2000 });
    }
  }

  // Change to a new table (switch to work on occupied table's order)
  changeToTable(newTable: RestaurantTable): void {
    const oldTable = this.selectedTable();
    if (!oldTable || newTable.id === oldTable.id) {
      this.changingTable.set(false);
      return;
    }
    
    // If new table is occupied, switch to work on that table's order
    if (newTable.status === 'occupied') {
      // Save current table state first if we have a selected table
      if (this.selectedTable()) {
        this.saveCurrentTableState();
      }
      
      // Select the occupied table (will load its existing bill)
      this.selectTable(newTable);
      
      // Close the overlay
      this.cancelChangeTable();
      return;
    }
    
    // If new table is available, move current order to that table
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
            this.saveSelectedTable(newTable.id);
            this.changingTable.set(false);
            
            // Reload tables and update selectedTable reference
            this.hotelService.loadTables().subscribe({
              next: () => {
                // Update selectedTable to the fresh reference from the reloaded tables
                const refreshedTable = this.hotelService.tables().find(t => t.id === newTable.id);
                if (refreshedTable) {
                  this.selectedTable.set(refreshedTable);
                }
              }
            });
            
            // Table changed successfully - no snackbar feedback needed
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
      this.saveSelectedTable(newTable.id);
      this.changingTable.set(false);
      
      // Table selected successfully - no snackbar feedback needed
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
    this.saveSelectedTable(state.table.id);
    this.currentBillId.set(state.billId);
    this.billStatus.set(state.billStatus);
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
    // Update snapshot after restoring cart
    this.updateCartSnapshot();
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

  // Check if Pay button should be disabled
  isPayButtonDisabled(): boolean {
    // Pay is disabled if cart is empty
    // Pay is enabled if cart has items
    return this.billService.cartItems().length === 0;
  }

  // Check if cart has unsaved changes
  hasUnsavedChanges(): boolean {
    const currentSnapshot = JSON.stringify(this.billService.cartItems());
    return currentSnapshot !== this.savedCartSnapshot();
  }

  // Update saved cart snapshot
  private updateCartSnapshot(): void {
    this.savedCartSnapshot.set(JSON.stringify(this.billService.cartItems()));
  }

  // Save order without printing KOT (for quantity changes or just saving)
  saveOrder(): void {
    const table = this.selectedTable();
    if (!table) return;

    // Check if there are any changes to save
    if (this.billService.cartItems().length === 0) {
      this.snackBar.open('No items to save', 'Close', { duration: 3000 });
      return;
    }

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
      items: this.billService.cartItems().map(item => ({
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        note: item.note
      }))
    };

    if (this.currentBillId()) {
      // Update existing bill - include items for saving
      const updateData = {
        ...billData,
        items: this.billService.cartItems().map(item => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          note: item.note
        }))
      } as any;
      this.billService.updateBill(this.currentBillId()!, updateData).subscribe({
        next: (response) => {
          if (response.success) {
            this.updateCartSnapshot(); // Update snapshot after successful save
            this.snackBar.open('Order saved successfully', 'Close', { duration: 2000 });
            // Reload tables to update grandTotal
            this.hotelService.loadTables().subscribe();
          }
        },
        error: () => {
          this.snackBar.open('Failed to save order', 'Close', { duration: 3000 });
        }
      });
    } else {
      // Create new bill with items
      this.billService.createBill({ ...billData, items: billData.items } as any).subscribe({
        next: (response) => {
          if (response.success) {
            this.currentBillId.set(response.data.billId);
            this.updateCartSnapshot(); // Update snapshot after successful save
            this.snackBar.open('Order saved successfully', 'Close', { duration: 2000 });
            
            // Update table status and reload tables
            this.hotelService.updateTableStatus(table.id, 'occupied', response.data.billId).subscribe({
              next: () => {
                this.hotelService.loadTables().subscribe();
              }
            });
          }
        },
        error: () => {
          this.snackBar.open('Failed to save order', 'Close', { duration: 3000 });
        }
      });
    }
  }

  // Print KOT (Kitchen Order Ticket) - Save and Print
  printKOT(): void {
    if (this.billService.cartItems().length === 0) {
      this.snackBar.open('No items to print', 'Close', { duration: 3000 });
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
      items: this.billService.cartItems().map(item => ({
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        note: item.note
      }))
    };

    if (this.currentBillId()) {
      // Update existing bill with ALL items
      const updateData = {
        ...billData,
        items: this.billService.cartItems().map(item => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          note: item.note
        }))
      } as any;
      this.billService.updateBill(this.currentBillId()!, updateData).subscribe({
        next: (response) => {
          if (response.success) {
            // Data saved successfully - update snapshot and reload tables
            this.updateCartSnapshot();
            this.hotelService.loadTables().subscribe();
            
            // Now try to print KOT via thermal printer
            this.billService.printKOT(this.currentBillId()!).subscribe({
              next: (printResponse) => {
                if (printResponse.success) {
                  this.snackBar.open('Order saved and KOT printed successfully', 'Close', { duration: 2000 });
                  this.billStatus.set('kot-printed');
                }
              },
              error: (err) => {
                const message = err.error?.message || 'Failed to print KOT';
                this.snackBar.open(`Order saved but ${message}. Please retry printing.`, 'Close', { duration: 5000 });
                // Bill is saved, just print failed - user can retry
              }
            });
          }
        },
        error: () => {
          this.snackBar.open('Failed to save order', 'Close', { duration: 3000 });
        }
      });
    } else {
      // Create new bill with items
      this.billService.createBill({ ...billData, items: billData.items } as any).subscribe({
        next: (response) => {
          if (response.success) {
            this.currentBillId.set(response.data.billId);
            // Data saved successfully - update snapshot, table status, and reload tables
            this.updateCartSnapshot();
            
            // Update table status
            this.hotelService.updateTableStatus(table.id, 'occupied', response.data.billId).subscribe({
              next: () => {
                this.hotelService.loadTables().subscribe();
              }
            });
            
            // Now try to print KOT via thermal printer
            this.billService.printKOT(response.data.billId).subscribe({
              next: (printResponse) => {
                if (printResponse.success) {
                  this.snackBar.open('Order saved and KOT printed successfully', 'Close', { duration: 2000 });
                  this.billStatus.set('kot-printed');
                }
              },
              error: (err) => {
                const message = err.error?.message || 'Failed to print KOT';
                this.snackBar.open(`Order saved but ${message}. Please retry printing.`, 'Close', { duration: 5000 });
                // Bill is saved, just print failed - user can retry
              }
            });
          }
        },
        error: () => {
          this.snackBar.open('Failed to save order', 'Close', { duration: 3000 });
        }
      });
    }
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
          // Update table status to available
          if (table) {
            this.hotelService.updateTableStatus(table.id, 'available', undefined).subscribe({
              next: () => {
                // Remove from attended tables
                this.removeFromAttendedTables(table.id);
                
                // Reset state
                this.cancelTableSelection();
                
                // Reload tables after status update completes
                this.hotelService.loadTables().subscribe();
              }
            });
          } else {
            // No table, just reset state
            this.cancelTableSelection();
            this.hotelService.loadTables().subscribe();
          }
        }
      },
      error: () => {
        this.snackBar.open('Failed to complete bill', 'Close', { duration: 3000 });
      }
    });
  }

  completeBillAndPrint(): void {
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
          // Print the bill
          this.billService.printBill(this.currentBillId()!).subscribe({
            next: () => {
              this.snackBar.open('Bill completed and printed successfully', 'Close', { duration: 3000 });
              
              // Update table status to available
              if (table) {
                this.hotelService.updateTableStatus(table.id, 'available', undefined).subscribe({
                  next: () => {
                    // Remove from attended tables
                    this.removeFromAttendedTables(table.id);
                    
                    // Reset state
                    this.cancelTableSelection();
                    
                    // Reload tables after status update completes
                    this.hotelService.loadTables().subscribe();
                  }
                });
              } else {
                // No table, just reset state
                this.cancelTableSelection();
                this.hotelService.loadTables().subscribe();
              }
            },
            error: () => {
              this.snackBar.open('Bill completed but printing failed', 'Close', { duration: 3000 });
              
              // Update table status to available
              if (table) {
                this.hotelService.updateTableStatus(table.id, 'available', undefined).subscribe({
                  next: () => {
                    // Remove from attended tables
                    this.removeFromAttendedTables(table.id);
                    
                    // Reset state
                    this.cancelTableSelection();
                    
                    // Reload tables after status update completes
                    this.hotelService.loadTables().subscribe();
                  }
                });
              } else {
                // No table, just reset state
                this.cancelTableSelection();
                this.hotelService.loadTables().subscribe();
              }
            }
          });
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

  // ===== SOCKET EVENT HANDLERS FOR REAL-TIME UPDATES =====

  private setupSocketListeners(): void {
    console.log('🔌 Setting up socket listeners for real-time updates');
    console.log('🔌 Socket connected status:', this.socketService.connected());
    
    // Listen for table updates from other clients
    this.socketService.on('table-updated', (data: any) => {
      console.log('📡 WebSocket: table-updated received', data);
      this.handleTableUpdate(data);
    });

    this.socketService.on('tables-refresh-needed', () => {
      console.log('📡 WebSocket: tables-refresh-needed received');
      this.handleTablesRefresh();
    });

    this.socketService.on('bill-created', (data: any) => {
      console.log('📡 WebSocket: bill-created received', data);
      this.handleBillUpdate(data);
    });

    this.socketService.on('bill-updated', (data: any) => {
      console.log('📡 WebSocket: bill-updated received', data);
      this.handleBillUpdate(data);
    });

    this.socketService.on('kot-printed', (data: any) => {
      console.log('📡 WebSocket: kot-printed received', data);
      this.handleKOTPrinted(data);
    });
    
    console.log('✅ Socket listeners registered for 5 events');
  }

  private handleTableUpdate(data: any): void {
    console.log('✅ Handling table update, reloading tables...');
    // Reload tables to get latest status and grand totals
    this.hotelService.loadTables().subscribe({
      next: () => {
        console.log('✅ Tables reloaded after table-updated event');
        // If currently viewing this table, update the reference
        const currentTable = this.selectedTable();
        if (currentTable && data.tableId === currentTable.id) {
          const refreshedTable = this.hotelService.tables().find(t => t.id === currentTable.id);
          if (refreshedTable) {
            this.selectedTable.set(refreshedTable);
            console.log('✅ Updated selected table reference');
          }
        }
      }
    });
  }

  private handleTablesRefresh(): void {
    console.log('✅ Handling tables refresh, reloading all tables...');
    // Reload all tables
    this.hotelService.loadTables().subscribe({
      next: () => {
        console.log('✅ All tables reloaded after tables-refresh-needed event');
      }
    });
  }

  private handleBillUpdate(data: any): void {
    console.log('✅ Handling bill update, reloading tables to reflect changes...');
    // Reload tables to reflect bill changes (grand totals, status, etc.)
    this.hotelService.loadTables().subscribe({
      next: () => {
        console.log('✅ Tables reloaded after bill-created/updated event');
        // If this bill belongs to currently selected table, update selected table
        const currentTable = this.selectedTable();
        if (currentTable && data.tableId === currentTable.id) {
          const refreshedTable = this.hotelService.tables().find(t => t.id === currentTable.id);
          if (refreshedTable) {
            this.selectedTable.set(refreshedTable);
            console.log('✅ Updated selected table reference after bill update');
          }
        }
      }
    });
  }

  private handleKOTPrinted(data: any): void {
    console.log('✅ Handling KOT printed event, reloading tables...');
    // Reload tables to show KOT printed status
    this.hotelService.loadTables().subscribe({
      next: () => {
        console.log('✅ Tables reloaded after kot-printed event');
        // Show notification if this is the currently selected table
        const currentTable = this.selectedTable();
        if (currentTable && data.tableId === currentTable.id && data.billId === this.currentBillId()) {
          const message = data.printError ? 'KOT print failed for this table' : 'KOT printed for this table';
          this.snackBar.open(message, 'OK', { duration: 3000 });
          console.log('✅ Showed KOT notification for current table');
        }
      }
    });
  }
}
