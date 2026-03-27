export interface Customer {
  customerId: string;
  name: string;
  phone: string;
  totalDebt: number;
  createdAt: string;
  updatedAt?: string;
}

export interface CustomerDebt {
  billId: string;
  billNumber: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  createdAt: string;
}

export interface CustomerWithDebts extends Customer {
  debts: CustomerDebt[];
  debtsPage?: number;
  debtsTotalPages?: number;
  debtsTotal?: number;
  hasMoreDebts?: boolean;
}

export interface CustomerDebtsResponse {
  success: boolean;
  data: {
    debts: CustomerDebt[];
    page: number;
    totalPages: number;
    total: number;
    hasMore: boolean;
  };
}

export interface CustomerResponse {
  success: boolean;
  data: Customer[];
  total?: number;
}

export interface CustomerDetailResponse {
  success: boolean;
  data: CustomerWithDebts;
}
