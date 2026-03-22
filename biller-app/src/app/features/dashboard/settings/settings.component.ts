import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatListModule } from '@angular/material/list';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { SettingsService } from '../../../core/services/settings.service';
import { AuthService } from '../../../core/services/auth.service';
import { HotelService } from '../../../core/services/hotel.service';
import { TranslateService } from '../../../core/services/translate.service';
import { Settings, ApplicationType, ThemeType, ScannerType, Category, TableColumn, Unit, ViewMode, LanguageType } from '../../../core/models/settings.model';
import { RestaurantTable, ItemNote } from '../../../core/models/hotel.model';
import { ChangePasswordDialogComponent } from '../../auth/change-password-dialog/change-password-dialog.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatDividerModule,
    MatSnackBarModule,
    MatTabsModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatCheckboxModule,
    MatListModule,
    MatExpansionModule,
    MatTableModule,
    MatChipsModule,
    MatMenuModule,
    MatDialogModule
  ],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit {
  private fb = inject(FormBuilder);
  settingsService = inject(SettingsService);
  authService = inject(AuthService);
  hotelService = inject(HotelService);
  translateService = inject(TranslateService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  businessForm!: FormGroup;
  taxForm!: FormGroup;
  receiptForm!: FormGroup;

  saving = signal(false);
  logoPreview = signal<string | null>(null);
  categories = signal<Category[]>([]);
  newCategoryName = signal<string>('');
  
  // Profile Photo
  profilePhotoPreview = signal<string | null>(null);
  profilePhotoChanged = signal(false);
  
  // Language
  selectedLanguage = signal<LanguageType>('en');
  
  // Hotel Management
  newTableStartNumber = signal<number>(1);
  newTableEndNumber = signal<number>(10);
  newTableType = signal<'dine-in' | 'parcel'>('dine-in');
  newNoteLabel = signal<string>('');
  
  // Grocery Management - Units
  units = signal<Unit[]>([]);
  newUnitName = signal<string>('');
  newUnitSymbol = signal<string>('');
  newUnitAllowDecimal = signal<boolean>(false);
  
  // Table column preferences
  productsColumns = signal<TableColumn[]>([]);
  billsColumns = signal<TableColumn[]>([]);
  customersColumns = signal<TableColumn[]>([]);
  viewMode = signal<ViewMode>('desktop');

  // Default table columns configuration
  private defaultProductsColumns: TableColumn[] = [
    { key: 'productId', label: 'Product ID', visible: true },
    { key: 'name', label: 'Product Name', visible: true },
    { key: 'barcode', label: 'Barcode', visible: true },
    { key: 'category', label: 'Category', visible: true },
    { key: 'unitPrice', label: 'Unit Price', visible: true },
    { key: 'stockQuantity', label: 'Stock', visible: true },
    { key: 'status', label: 'Status', visible: true },
    { key: 'actions', label: 'Actions', visible: true }
  ];

  private defaultBillsColumns: TableColumn[] = [
    { key: 'billNumber', label: 'Bill Number', visible: true },
    { key: 'createdAt', label: 'Date', visible: true },
    { key: 'table', label: 'Table', visible: true },
    { key: 'itemsCount', label: 'Items', visible: true },
    { key: 'grandTotal', label: 'Total', visible: true },
    { key: 'paymentMethod', label: 'Payment Method', visible: true },
    { key: 'paymentStatus', label: 'Payment Status', visible: true },
    { key: 'actions', label: 'Actions', visible: true }
  ];

  private defaultCustomersColumns: TableColumn[] = [
    { key: 'name', label: 'Name', visible: true },
    { key: 'phone', label: 'Phone', visible: true },
    { key: 'totalDebt', label: 'Total Debt', visible: true },
    { key: 'actions', label: 'Actions', visible: true }
  ];

  applicationTypes: { value: ApplicationType; label: string; icon: string }[] = [
    { value: 'hotel', label: 'Hotel / Restaurant', icon: 'restaurant' },
    { value: 'grocery', label: 'Grocery Store', icon: 'shopping_cart' },
    { value: 'clothing', label: 'Clothing Store', icon: 'checkroom' },
    { value: 'electronics', label: 'Electronics Store', icon: 'devices' },
    { value: 'general', label: 'General Store', icon: 'store' }
  ];

  currencies = [
    { value: 'INR', label: '₹ Indian Rupee (INR)', symbol: '₹' },
    { value: 'USD', label: '$ US Dollar (USD)', symbol: '$' },
    { value: 'EUR', label: '€ Euro (EUR)', symbol: '€' },
    { value: 'GBP', label: '£ British Pound (GBP)', symbol: '£' }
  ];

  scannerTypes: { value: ScannerType; label: string; icon: string; description: string }[] = [
    { value: 'none', label: 'None', icon: 'block', description: 'Disable barcode scanning' },
    { value: 'camera', label: 'Device Camera', icon: 'camera_alt', description: 'Use device camera to scan barcodes' },
    { value: 'usb', label: 'USB Scanner', icon: 'usb', description: 'Coming soon - Use USB barcode scanner' }
  ];

  ngOnInit(): void {
    this.initForms();
    this.loadSettings();
    this.loadProfilePhoto();
    this.loadHotelData();
  }

  private loadProfilePhoto(): void {
    const currentUser = this.authService.currentUser();
    if (currentUser?.profilePhoto) {
      this.profilePhotoPreview.set(currentUser.profilePhoto);
    }
  }

  private loadHotelData(): void {
    // Load hotel-specific data (tables and notes)
    this.hotelService.loadTables().subscribe();
    this.hotelService.loadItemNotes().subscribe();
  }

  // Check if current application type is hotel
  isHotelMode(): boolean {
    return this.businessForm?.get('applicationType')?.value === 'hotel';
  }

  // Check if current application type is grocery
  isGroceryMode(): boolean {
    return this.businessForm?.get('applicationType')?.value === 'grocery';
  }

  private initForms(): void {
    this.businessForm = this.fb.group({
      businessName: ['', [Validators.required, Validators.maxLength(100)]],
      address: ['', [Validators.maxLength(200)]],
      phone: ['', [Validators.pattern(/^[+]?[\d\s-]{10,15}$/)]],
      email: ['', [Validators.email]],
      applicationType: ['general', Validators.required],
      currencyCode: ['INR', Validators.required],
      theme: ['dark'],
      scannerType: ['none']
    });

    this.taxForm = this.fb.group({
      taxEnabled: [true],
      taxName: ['GST', Validators.required],
      taxRate: [18, [Validators.required, Validators.min(0), Validators.max(100)]],
      taxNumber: [''],
      discountEnabled: [true],
      debtEnabled: [false]
    });

    this.receiptForm = this.fb.group({
      showLogo: [true],
      footerText: ['Thank you for your business!'],
      invoicePrefix: ['INV'],
      invoiceStartNumber: [1, [Validators.required, Validators.min(1)]]
    });
  }

  private loadSettings(): void {
    const settings = this.settingsService.settings();
    
    this.businessForm.patchValue({
      businessName: settings.businessName,
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      applicationType: settings.applicationType,
      currencyCode: settings.currencyCode,
      theme: settings.theme,
      scannerType: settings.scannerType || 'none'
    });

    const taxRate = settings.taxRates?.length > 0 ? settings.taxRates[0] : { name: 'GST', rate: 18 };
    this.taxForm.patchValue({
      taxEnabled: settings.taxEnabled ?? settings.taxRates?.length > 0,
      taxName: taxRate.name,
      taxRate: taxRate.rate,
      taxNumber: settings.taxNumber,
      discountEnabled: settings.discountEnabled ?? true,
      debtEnabled: settings.debtEnabled ?? false
    });

    this.receiptForm.patchValue({
      showLogo: !!settings.logo,
      footerText: settings.footerText,
      invoicePrefix: settings.invoicePrefix,
      invoiceStartNumber: settings.invoiceStartNumber
    });

    if (settings.logo) {
      this.logoPreview.set(settings.logo);
    }

    // Load categories
    this.categories.set(settings.categories || [{ name: 'General', enabled: true }]);
    
    // Load units (for grocery mode)
    const defaultUnits: Unit[] = [
      { id: 1, name: 'Kilogram', symbol: 'kg', allowDecimal: true },
      { id: 2, name: 'Gram', symbol: 'g', allowDecimal: false },
      { id: 3, name: 'Liter', symbol: 'ltr', allowDecimal: true },
      { id: 4, name: 'Milliliter', symbol: 'ml', allowDecimal: false },
      { id: 5, name: 'Piece', symbol: 'pcs', allowDecimal: false }
    ];
    this.units.set(settings.units || defaultUnits);
    
    // Load table columns preferences
    if (settings.tableColumns) {
      this.productsColumns.set(settings.tableColumns.products || this.defaultProductsColumns);
      this.billsColumns.set(settings.tableColumns.bills || this.defaultBillsColumns);
      this.customersColumns.set(settings.tableColumns.customers || this.defaultCustomersColumns);
    } else {
      this.productsColumns.set([...this.defaultProductsColumns]);
      this.billsColumns.set([...this.defaultBillsColumns]);
      this.customersColumns.set([...this.defaultCustomersColumns]);
    }
    
    // Load view mode preference
    this.viewMode.set(settings.viewMode || 'desktop');
    
    // Load language preference
    const lang = settings.language || 'en';
    this.selectedLanguage.set(lang);
    this.translateService.initLanguage(lang);
  }

  onThemeChange(isDark: boolean): void {
    const theme: ThemeType = isDark ? 'dark' : 'light';
    this.businessForm.patchValue({ theme });
    this.settingsService.currentTheme.set(theme);
  }

  setLanguage(lang: LanguageType): void {
    this.selectedLanguage.set(lang);
    this.translateService.setLanguage(lang);
    
    // Save to backend
    this.settingsService.updateSettings({ language: lang }).subscribe({
      next: () => {
        this.snackBar.open(lang === 'hi' ? 'भाषा बदल गई' : 'Language changed', 'Close', { duration: 2000 });
      },
      error: () => {
        this.snackBar.open('Failed to save language preference', 'Close', { duration: 3000 });
      }
    });
  }

  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        this.snackBar.open('Please select an image file', 'Close', { duration: 3000 });
        return;
      }

      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        this.snackBar.open('Image size should be less than 2MB', 'Close', { duration: 3000 });
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        this.logoPreview.set(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  removeLogo(): void {
    this.logoPreview.set(null);
  }

  saveBusinessSettings(): void {
    if (this.businessForm.invalid) {
      this.businessForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const formValue = this.businessForm.value;
    const currency = this.currencies.find(c => c.value === formValue.currencyCode);
    
    const settings: Partial<Settings> = {
      businessName: formValue.businessName,
      address: formValue.address,
      phone: formValue.phone,
      email: formValue.email,
      applicationType: formValue.applicationType,
      currencyCode: formValue.currencyCode,
      currency: currency?.symbol || '₹',
      theme: formValue.theme,
      scannerType: formValue.scannerType,
      logo: this.logoPreview() || ''
    };

    this.settingsService.updateSettings(settings).subscribe({
      next: () => {
        this.snackBar.open('Business settings saved successfully', 'Close', { duration: 3000 });
        this.saving.set(false);
      },
      error: () => {
        this.snackBar.open('Failed to save settings', 'Close', { duration: 3000 });
        this.saving.set(false);
      }
    });
  }

  saveTaxSettings(): void {
    if (this.taxForm.invalid) {
      this.taxForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const formValue = this.taxForm.value;
    
    const settings: Partial<Settings> = {
      taxNumber: formValue.taxNumber,
      taxEnabled: formValue.taxEnabled,
      taxRates: formValue.taxEnabled 
        ? [{ name: formValue.taxName, rate: formValue.taxRate }]
        : [],
      discountEnabled: formValue.discountEnabled,
      debtEnabled: formValue.debtEnabled
    };

    this.settingsService.updateSettings(settings).subscribe({
      next: () => {
        this.snackBar.open('Tax settings saved successfully', 'Close', { duration: 3000 });
        this.saving.set(false);
      },
      error: () => {
        this.snackBar.open('Failed to save settings', 'Close', { duration: 3000 });
        this.saving.set(false);
      }
    });
  }

  saveReceiptSettings(): void {
    if (this.receiptForm.invalid) {
      this.receiptForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const formValue = this.receiptForm.value;
    
    const settings: Partial<Settings> = {
      footerText: formValue.footerText,
      invoicePrefix: formValue.invoicePrefix,
      invoiceStartNumber: formValue.invoiceStartNumber
    };

    this.settingsService.updateSettings(settings).subscribe({
      next: () => {
        this.snackBar.open('Receipt settings saved successfully', 'Close', { duration: 3000 });
        this.saving.set(false);
      },
      error: () => {
        this.snackBar.open('Failed to save settings', 'Close', { duration: 3000 });
        this.saving.set(false);
      }
    });
  }

  getAppTypeIcon(type: string): string {
    return this.applicationTypes.find(t => t.value === type)?.icon || 'store';
  }

  // Categories Management
  addCategory(): void {
    const name = this.newCategoryName().trim();
    if (!name) {
      this.snackBar.open('Please enter a category name', 'Close', { duration: 3000 });
      return;
    }

    const currentCategories = this.categories();
    if (currentCategories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      this.snackBar.open('Category already exists', 'Close', { duration: 3000 });
      return;
    }

    const newCategory: Category = { name, enabled: true };
    this.categories.set([...currentCategories, newCategory]);
    this.newCategoryName.set('');
  }

  toggleCategory(index: number): void {
    const currentCategories = [...this.categories()];
    currentCategories[index].enabled = !currentCategories[index].enabled;
    this.categories.set(currentCategories);
  }

  removeCategory(index: number): void {
    const categoryName = this.categories()[index].name;
    
    // Prevent removing 'General' category
    if (categoryName === 'General') {
      this.snackBar.open('Cannot remove General category', 'Close', { duration: 3000 });
      return;
    }

    if (confirm(`Are you sure you want to remove "${categoryName}"?`)) {
      const currentCategories = [...this.categories()];
      currentCategories.splice(index, 1);
      this.categories.set(currentCategories);
    }
  }

  saveCategories(): void {
    this.saving.set(true);
    
    const settings: Partial<Settings> = {
      categories: this.categories()
    };

    this.settingsService.updateSettings(settings).subscribe({
      next: () => {
        this.snackBar.open('Categories saved successfully', 'Close', { duration: 3000 });
        this.saving.set(false);
      },
      error: () => {
        this.snackBar.open('Failed to save categories', 'Close', { duration: 3000 });
        this.saving.set(false);
      }
    });
  }

  // Table Column Management Methods
  toggleProductColumn(index: number): void {
    const columns = [...this.productsColumns()];
    columns[index].visible = !columns[index].visible;
    this.productsColumns.set(columns);
  }

  toggleBillColumn(index: number): void {
    const columns = [...this.billsColumns()];
    columns[index].visible = !columns[index].visible;
    this.billsColumns.set(columns);
  }

  toggleCustomerColumn(index: number): void {
    const columns = [...this.customersColumns()];
    columns[index].visible = !columns[index].visible;
    this.customersColumns.set(columns);
  }

  getVisibleProductsCount(): number {
    return this.productsColumns().filter(c => c.visible).length;
  }

  getVisibleBillsCount(): number {
    return this.billsColumns().filter(c => c.visible).length;
  }

  getVisibleCustomersCount(): number {
    return this.customersColumns().filter(c => c.visible).length;
  }

  resetTableColumns(): void {
    this.productsColumns.set([...this.defaultProductsColumns]);
    this.billsColumns.set([...this.defaultBillsColumns]);
    this.customersColumns.set([...this.defaultCustomersColumns]);
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
  }

  saveTableColumns(): void {
    this.saving.set(true);
    
    const settings: Partial<Settings> = {
      tableColumns: {
        products: this.productsColumns(),
        bills: this.billsColumns(),
        customers: this.customersColumns()
      },
      viewMode: this.viewMode()
    };

    this.settingsService.updateSettings(settings).subscribe({
      next: () => {
        this.snackBar.open('Table columns preferences saved successfully', 'Close', { duration: 3000 });
        this.saving.set(false);
      },
      error: () => {
        this.snackBar.open('Failed to save table columns', 'Close', { duration: 3000 });
        this.saving.set(false);
      }
    });
  }

  openChangePasswordDialog(): void {
    this.dialog.open(ChangePasswordDialogComponent, {
      width: '450px',
      data: { requirePasswordChange: false }
    });
  }

  // Profile Photo Methods
  onProfilePhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        this.snackBar.open('Please select an image file', 'Close', { duration: 3000 });
        return;
      }

      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        this.snackBar.open('Profile photo must be less than 2MB', 'Close', { duration: 3000 });
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        this.profilePhotoPreview.set(reader.result as string);
        this.profilePhotoChanged.set(true);
      };
      reader.readAsDataURL(file);
    }
  }

  removeProfilePhoto(): void {
    this.profilePhotoPreview.set(null);
    this.profilePhotoChanged.set(true);
  }

  saveProfilePhoto(): void {
    this.saving.set(true);
    
    this.authService.updateProfile({ profilePhoto: this.profilePhotoPreview() || '' }).subscribe({
      next: () => {
        this.snackBar.open('Profile photo saved successfully', 'Close', { duration: 3000 });
        this.saving.set(false);
        this.profilePhotoChanged.set(false);
      },
      error: () => {
        this.snackBar.open('Failed to save profile photo', 'Close', { duration: 3000 });
        this.saving.set(false);
      }
    });
  }

  // ==================== HOTEL MANAGEMENT ====================

  // Tables Management
  addTables(): void {
    const start = this.newTableStartNumber();
    const end = this.newTableEndNumber();
    const tableType = this.newTableType();

    if (start > end) {
      this.snackBar.open('Start number must be less than or equal to end number', 'Close', { duration: 3000 });
      return;
    }

    this.saving.set(true);
    this.hotelService.createTables({
      startNumber: start,
      endNumber: end,
      tableType: tableType
    }).subscribe({
      next: (response) => {
        this.snackBar.open(response.message || 'Tables created successfully', 'Close', { duration: 3000 });
        this.saving.set(false);
      },
      error: () => {
        this.snackBar.open('Failed to create tables', 'Close', { duration: 3000 });
        this.saving.set(false);
      }
    });
  }

  deleteTable(table: RestaurantTable): void {
    if (table.status === 'occupied') {
      this.snackBar.open('Cannot delete occupied table', 'Close', { duration: 3000 });
      return;
    }

    if (confirm(`Are you sure you want to delete ${table.tableNumber}?`)) {
      this.hotelService.deleteTable(table.id).subscribe({
        next: () => {
          this.snackBar.open('Table deleted successfully', 'Close', { duration: 3000 });
        },
        error: () => {
          this.snackBar.open('Failed to delete table', 'Close', { duration: 3000 });
        }
      });
    }
  }

  getDineInTables(): RestaurantTable[] {
    return this.hotelService.tables().filter(t => t.tableType === 'dine-in');
  }

  getParcelTables(): RestaurantTable[] {
    return this.hotelService.tables().filter(t => t.tableType === 'parcel');
  }

  // Item Notes Management
  addItemNote(): void {
    const label = this.newNoteLabel().trim();
    if (!label) {
      this.snackBar.open('Please enter a note label', 'Close', { duration: 3000 });
      return;
    }

    this.saving.set(true);
    this.hotelService.createItemNote({ label }).subscribe({
      next: () => {
        this.snackBar.open('Note added successfully', 'Close', { duration: 3000 });
        this.newNoteLabel.set('');
        this.saving.set(false);
      },
      error: (err) => {
        const message = err.error?.message || 'Failed to add note';
        this.snackBar.open(message, 'Close', { duration: 3000 });
        this.saving.set(false);
      }
    });
  }

  deleteItemNote(note: ItemNote): void {
    if (confirm(`Are you sure you want to delete "${note.label}"?`)) {
      this.hotelService.deleteItemNote(note.id).subscribe({
        next: () => {
          this.snackBar.open('Note deleted successfully', 'Close', { duration: 3000 });
        },
        error: () => {
          this.snackBar.open('Failed to delete note', 'Close', { duration: 3000 });
        }
      });
    }
  }

  // ==================== GROCERY UNIT MANAGEMENT ====================
  
  addUnit(): void {
    const name = this.newUnitName().trim();
    const symbol = this.newUnitSymbol().trim().toLowerCase();
    
    if (!name || !symbol) {
      this.snackBar.open('Please enter unit name and symbol', 'Close', { duration: 3000 });
      return;
    }

    // Check for duplicate symbol
    if (this.units().some(u => u.symbol.toLowerCase() === symbol)) {
      this.snackBar.open('Unit with this symbol already exists', 'Close', { duration: 3000 });
      return;
    }

    const newUnit: Unit = {
      id: Math.max(0, ...this.units().map(u => u.id)) + 1,
      name,
      symbol,
      allowDecimal: this.newUnitAllowDecimal()
    };

    this.units.update(units => [...units, newUnit]);
    this.saveUnits();
    
    // Reset form
    this.newUnitName.set('');
    this.newUnitSymbol.set('');
    this.newUnitAllowDecimal.set(false);
  }

  deleteUnit(unit: Unit): void {
    if (this.units().length <= 1) {
      this.snackBar.open('At least one unit must exist', 'Close', { duration: 3000 });
      return;
    }

    if (confirm(`Are you sure you want to delete "${unit.name}" (${unit.symbol})?`)) {
      this.units.update(units => units.filter(u => u.id !== unit.id));
      this.saveUnits();
    }
  }

  toggleUnitDecimal(unit: Unit): void {
    this.units.update(units => 
      units.map(u => u.id === unit.id ? { ...u, allowDecimal: !u.allowDecimal } : u)
    );
    this.saveUnits();
  }

  private saveUnits(): void {
    this.saving.set(true);
    this.settingsService.updateSettings({ units: this.units() }).subscribe({
      next: () => {
        this.snackBar.open('Units saved successfully', 'Close', { duration: 3000 });
        this.saving.set(false);
      },
      error: () => {
        this.snackBar.open('Failed to save units', 'Close', { duration: 3000 });
        this.saving.set(false);
      }
    });
  }
}
