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

import { SettingsService } from '../../../core/services/settings.service';
import { Settings, ApplicationType, ThemeType, ScannerType, Category } from '../../../core/models/settings.model';

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
    MatListModule
  ],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit {
  private fb = inject(FormBuilder);
  settingsService = inject(SettingsService);
  private snackBar = inject(MatSnackBar);

  generalForm!: FormGroup;
  taxForm!: FormGroup;
  receiptForm!: FormGroup;

  saving = signal(false);
  logoPreview = signal<string | null>(null);
  categories = signal<Category[]>([]);
  newCategoryName = signal<string>('');

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
  }

  private initForms(): void {
    this.generalForm = this.fb.group({
      businessName: ['', [Validators.required, Validators.maxLength(100)]],
      address: ['', [Validators.maxLength(200)]],
      phone: ['', [Validators.pattern(/^[+]?[\d\s-]{10,15}$/)]],
      email: ['', [Validators.email]],
      applicationType: ['general', Validators.required],
      currencyCode: ['INR', Validators.required],
      theme: ['light'],
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
    
    this.generalForm.patchValue({
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
  }

  onThemeChange(isDark: boolean): void {
    const theme: ThemeType = isDark ? 'dark' : 'light';
    this.generalForm.patchValue({ theme });
    this.settingsService.currentTheme.set(theme);
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

  saveGeneralSettings(): void {
    if (this.generalForm.invalid) {
      this.generalForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const formValue = this.generalForm.value;
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
        this.snackBar.open('General settings saved successfully', 'Close', { duration: 3000 });
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
}
