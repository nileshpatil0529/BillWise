export type ApplicationType = 'general' | 'hotel' | 'grocery' | 'clothing' | 'electronics' | 'restaurant';
export type ThemeType = 'light' | 'dark';
export type ScannerType = 'none' | 'camera' | 'usb';

export interface TaxRate {
  name: string;
  rate: number;
}

export interface Currency {
  code: string;
  symbol: string;
  name: string;
}

export interface Category {
  name: string;
  enabled: boolean;
}

// Unit for loose items (grocery mode)
export interface Unit {
  id: number;
  name: string;       // e.g., "Kilogram", "Liter"
  symbol: string;     // e.g., "kg", "ltr"
  allowDecimal: boolean; // Whether decimals are allowed
}

export interface TableColumn {
  key: string;
  label: string;
  visible: boolean;
}

export interface TableColumnPreferences {
  products: TableColumn[];
  bills: TableColumn[];
  customers: TableColumn[];
}

export type ViewMode = 'desktop' | 'mobile';

export interface Settings {
  businessName: string;
  logo: string;
  address: string;
  phone: string;
  email: string;
  taxNumber: string;
  currency: string;
  currencyCode: string;
  applicationType: ApplicationType;
  theme: ThemeType;
  scannerType: ScannerType;
  taxEnabled: boolean;
  taxRates: TaxRate[];
  discountEnabled: boolean;
  debtEnabled: boolean;
  categories: Category[];
  invoicePrefix: string;
  invoiceStartNumber: number;
  footerText: string;
  lowStockAlertEnabled: boolean;
  lowStockThreshold: number;
  tableColumns?: TableColumnPreferences;
  viewMode?: ViewMode; // 'desktop' or 'mobile' - affects table display
  units?: Unit[]; // Units for loose items (grocery mode)
  updatedAt: string;
}

export interface ApplicationTypeConfig {
  name: string;
  description: string;
  fields: string[];
}

export interface ApplicationTypes {
  [key: string]: ApplicationTypeConfig;
}
