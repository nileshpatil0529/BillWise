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
import { Product, CartItem } from '../../../core/models/product.model';
import { Customer } from '../../../core/models/customer.model';
import { RestaurantTable } from '../../../core/models/hotel.model';
import { Unit } from '../../../core/models/settings.model';

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
  note?: string; // Optional note (e.g., Spicy, No salt)
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
  kotPrintedQuantities = signal<KotPrintedQuantities>({}); // Track quantities that have been KOT printed
  hotelModeInitialized = signal(false); // Flag to track if hotel mode has finished initializing
  savedCartSnapshot = signal<string>(''); // JSON snapshot of last saved cart state
  
  // Multi-table attendance state
  attendedTables = signal<AttendedTableState[]>([]);
  showAttendedTablesMenu = signal(false);
  
  // Bill summary panel state
  showBillSummary = signal(false);

  // Cart item tap/hold state - improved for touch + mouse
  private itemPressTimer: any = null;
  private itemPressStartTime = 0;
  private readonly LONG_PRESS_DURATION = 400; // ms for long press (reduced for better UX)
  private isLongPressTriggered = false;
  private activePointerId: number | null = null; // Track which pointer is active

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
    const isMobile = this.settingsService.settings().viewMode === 'mobile';
    
    if (this.isHotelMode()) {
      // In mobile mode, hide price column and show more compact view
      return isMobile 
        ? ['sno', 'name', 'quantity', 'note', 'total', 'actions']
        : ['sno', 'name', 'price', 'quantity', 'note', 'total', 'actions'];
    }
    if (this.isElectronicsMode()) {
      return isMobile
        ? ['sno', 'name', 'quantity', 'warranty', 'total', 'actions']
        : ['sno', 'name', 'price', 'quantity', 'warranty', 'total', 'actions'];
    }
    return isMobile
      ? ['sno', 'name', 'quantity', 'total', 'actions']
      : ['sno', 'name', 'price', 'quantity', 'total', 'actions'];
  }

  // Check if mobile view mode is enabled
  isMobileMode(): boolean {
    return this.settingsService.settings().viewMode === 'mobile';
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
    private barcodeScannerService: BarcodeScannerService
  ) {
  }

  ngOnDestroy(): void {
    // Cleanup scanner subscription
    if (this.scannerSubscription) {
      this.scannerSubscription.unsubscribe();
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
      this.hotelService.loadTables().subscribe({
        next: () => {
          // Restore last selected table if any
          this.restoreLastSelectedTable();
        }
      });
      this.hotelService.loadItemNotes().subscribe();
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
              bill.items.forEach((item: any) => {
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
                if (item.kotPrinted) {
                  this.kotPrintedQuantities.update(quantities => {
                    return { ...quantities, [item.productId]: item.quantity };
                  });
                }
              });
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

  // Tap and hold handlers for cart items - improved for touch + mouse
  onItemPointerDown(event: PointerEvent, item: CartItem): void {
    // Only handle primary button (left click / touch)
    if (event.button !== 0) return;
    
    // Prevent duplicate handling
    if (this.activePointerId !== null) return;
    
    this.activePointerId = event.pointerId;
    this.isLongPressTriggered = false;
    this.itemPressStartTime = Date.now();
    
    // Capture pointer to receive all events even if pointer leaves element
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    
    this.itemPressTimer = setTimeout(() => {
      if (this.activePointerId === event.pointerId) {
        this.isLongPressTriggered = true;
        this.decreaseItemQuantity(item);
        // Reset pointer state after long press action (item may be removed from DOM)
        this.cleanupPointerState();
      }
    }, this.LONG_PRESS_DURATION);
  }

  onItemPointerUp(event: PointerEvent, item: CartItem): void {
    // Only handle the pointer we're tracking
    if (this.activePointerId !== event.pointerId) return;
    
    // Release pointer capture
    try {
      (event.target as HTMLElement).releasePointerCapture(event.pointerId);
    } catch (e) {
      // Ignore if already released
    }
    
    // If it was a short tap (not a long press), increase quantity
    if (!this.isLongPressTriggered) {
      this.increaseItemQuantity(item);
    }
    
    this.cleanupPointerState();
  }

  onItemPointerCancel(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) return;
    this.cleanupPointerState();
  }

  // Called when pointer capture is lost (e.g., element removed from DOM)
  onLostPointerCapture(event: PointerEvent): void {
    if (this.activePointerId === event.pointerId) {
      this.cleanupPointerState();
    }
  }

  private cleanupPointerState(): void {
    this.clearPressTimer();
    this.activePointerId = null;
    this.isLongPressTriggered = false;
  }

  private clearPressTimer(): void {
    if (this.itemPressTimer) {
      clearTimeout(this.itemPressTimer);
      this.itemPressTimer = null;
    }
  }

  increaseItemQuantity(item: CartItem): void {
    const change = item.isLooseItem ? 0.1 : 1;
    this.updateQuantity(item, change);
    this.beepService.playSuccess();
  }

  decreaseItemQuantity(item: CartItem): void {
    const change = item.isLooseItem ? -0.1 : -1;
    const newQuantity = item.quantity + change;
    
    if (newQuantity <= 0) {
      this.removeItem(item.productId);
      this.beepService.playError();
    } else {
      this.updateQuantity(item, change);
      this.beepService.playSuccess();
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
          
          if (adjustedProduct.stockQuantity <= 0) {
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
          
          if (adjustedProduct.stockQuantity <= 0) {
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
      this.kotPrintedQuantities.set({});
      this.customerName.set('');
      this.customerPhone.set('');
      this.billService.clearCart();
      this.savedCartSnapshot.set('[]'); // Initialize empty snapshot for new order
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
              // Only load KOT printed quantities if we're NOT already tracking this bill
              // (to preserve in-memory tracking which is more accurate)
              if (!isAlreadyTrackingThisBill && item.kotPrinted) {
                this.kotPrintedQuantities.update(quantities => {
                  return { ...quantities, [item.productId]: item.quantity };
                });
              }
            });
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

  // Cancel table selection (save state and go to table selection)
  cancelTableSelection(): void {
    // Save current table state if there are items
    if (this.selectedTable() && this.billService.cartItems().length > 0) {
      this.saveCurrentTableState();
    }
    
    this.selectedTable.set(null);
    this.saveSelectedTable(null);
    this.currentBillId.set(null);
    this.billStatus.set('new');
    this.kotPrintedQuantities.set({});
    this.changingTable.set(false);
    this.customerName.set('');
    this.customerPhone.set('');
    this.billService.clearCart();
    this.savedCartSnapshot.set(''); // Reset snapshot
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
            
            const tableLabel = newTable.tableType === 'parcel' ? `Parcel ${newTable.tableNumber}` : `Table ${newTable.tableNumber}`;
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
    this.saveSelectedTable(state.table.id);
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
    
    this.showAttendedTablesMenu.set(false);
  }

  // Select an occupied table from the occupied tables menu
  selectOccupiedTable(table: RestaurantTable): void {
    // Save current state first if we have a selected table
    if (this.selectedTable()) {
      this.saveCurrentTableState();
    }
    
    // Select the table (will load existing bill)
    this.selectTable(table);
    
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
  
  // Toggle bill summary panel
  toggleBillSummary(): void {
    this.showBillSummary.update(v => !v);
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
          unitPrice: item.unitPrice,
          note: item.note
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

  // Check if Pay button should be disabled
  isPayButtonDisabled(): boolean {
    const hasItems = this.billService.cartItems().length > 0;
    const hasKotPrinted = this.hasKotPrintedItems();
    const hasChanges = this.hasUnsavedChanges();
    
    // Pay is disabled if: no items OR (no KOT printed AND has unsaved changes)
    // Pay is enabled if: has items AND (KOT printed OR no changes)
    return !hasItems || (!hasKotPrinted && hasChanges);
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

  // Smart button - determines button state based on context
  getSmartButtonText(): string {
    const newItems = this.getNewItems();
    if (newItems.length > 0) {
      return 'KOT';
    }
    return 'Save';
  }

  getSmartButtonIcon(): string {
    const newItems = this.getNewItems();
    return newItems.length > 0 ? 'receipt_long' : 'save';
  }

  isSmartButtonDisabled(): boolean {
    const hasNewItems = this.getNewItems().length > 0;
    const hasChanges = this.hasUnsavedChanges();
    const hasItems = this.billService.cartItems().length > 0;
    
    // Disabled if: no items OR (no new items AND no unsaved changes)
    return !hasItems || (!hasNewItems && !hasChanges);
  }

  // Smart action handler - calls appropriate method based on state
  handleSmartAction(): void {
    const newItems = this.getNewItems();
    if (newItems.length > 0) {
      // Has new items to print - do KOT (which saves + prints)
      this.printKOT();
    } else {
      // Only cart changes - just save
      this.saveOrder();
    }
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
        unitPrice: item.unitPrice
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
          unitPrice: item.unitPrice
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
      items: this.billService.cartItems().map(item => ({
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice
      }))
    };

    if (this.currentBillId()) {
      // Update existing bill with ALL items (not just new ones)
      const updateData = {
        ...billData,
        items: this.billService.cartItems().map(item => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice
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
                  // Update KOT printed quantities only on successful print
                  this.updateKotPrintedQuantities(newItems);
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
                  // Update KOT printed quantities only on successful print
                  this.updateKotPrintedQuantities(newItems);
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
