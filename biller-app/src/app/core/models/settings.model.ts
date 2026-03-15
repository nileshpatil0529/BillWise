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
  invoicePrefix: string;
  invoiceStartNumber: number;
  footerText: string;
  lowStockAlertEnabled: boolean;
  lowStockThreshold: number;
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
