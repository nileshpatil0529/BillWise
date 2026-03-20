export interface BillItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  discountType: 'percentage' | 'fixed';
  taxRate?: number;
  itemTotal: number;
  discountAmount: number;
  taxAmount: number;
  finalTotal: number;
}

export interface Bill {
  billId: string;
  billNumber: string;
  items: BillItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  paymentMethod: 'cash' | 'card' | 'online' | 'debt';
  paymentStatus: 'paid' | 'pending' | 'partial';
  amountPaid: number;
  change: number;
  customerName?: string;
  customerPhone?: string;
  businessTypeData?: any;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface BillResponse {
  success: boolean;
  data: {
    bills: Bill[];
    total: number;
    page: number;
    totalPages: number;
  };
}

export interface ReportSummary {
  totalSales: number;
  totalBills: number;
  cashSales: number;
  cardSales: number;
  onlineSales: number;
  debtAmount: number;
  debtPaid: number;
  averageBillValue: number;
  totalDiscount: number;
  totalTax: number;
}

export interface DailySales {
  date: string;
  sales: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
}

export interface ReportData {
  summary: ReportSummary;
  paymentMethodCounts: {
    cash: number;
    card: number;
    online: number;
    debt: number;
  };
  dailySales: DailySales[];
  topProducts: TopProduct[];
}
