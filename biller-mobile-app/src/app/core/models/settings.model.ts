export type ApplicationType = 'general' | 'hotel' | 'grocery' | 'clothing' | 'electronics' | 'restaurant';
export type ThemeType = 'light' | 'dark';
export type ScannerType = 'none' | 'usb';
export type LanguageType = 'en' | 'hi';
export type ViewMode = 'desktop' | 'mobile';

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

export interface TableColumn {
  key: string;
  label: string;
  visible: boolean;
}

// Unit for loose items (grocery mode)
export interface Unit {
  id: number;
  name: string;       // e.g., "Kilogram", "Liter"
  symbol: string;     // e.g., "kg", "ltr"
  allowDecimal: boolean; // Whether decimals are allowed
}

export interface Settings {
  businessName: string;
  logo: string;
  address: string;
  phone: string;
  email: string;
  taxNumber: string;
  currency: string;
  currencyCode: string;
  upiId?: string; // UPI ID for QR code generation
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
  language?: LanguageType;
  receiptLanguage?: LanguageType;
  units?: Unit[];
  viewMode?: ViewMode;
  tableColumns?: {
    products?: TableColumn[];
    bills?: TableColumn[];
    customers?: TableColumn[];
  };
  updatedAt: string;
}

export type PaperSize = '2inch' | '3inch';

export interface PrinterConfig {
  userId?: string;
  printerName: string | null;
  paperSize: PaperSize;
  enabled: boolean;
}

export interface ApplicationTypeConfig {
  name: string;
  description: string;
  fields: string[];
}

export interface ApplicationTypes {
  [key: string]: ApplicationTypeConfig;
}
