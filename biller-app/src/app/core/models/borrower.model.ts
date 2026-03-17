export interface Borrower {
  borrowerId: string;
  name: string;
  phone: string;
  totalDebt: number;
  createdAt: string;
  updatedAt?: string;
}

export interface BorrowerDebt {
  billId: string;
  billNumber: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  createdAt: string;
}

export interface BorrowerWithDebts extends Borrower {
  debts: BorrowerDebt[];
}

export interface BorrowerResponse {
  success: boolean;
  data: Borrower[];
  total?: number;
}

export interface BorrowerDetailResponse {
  success: boolean;
  data: BorrowerWithDebts;
}
