export interface RestaurantTable {
  id: number;
  tableNumber: string;
  tableType: string;
  capacity: number;
  status: 'available' | 'occupied' | 'unsettled' | 'reserved' | 'cleaning';
  currentBillId?: string;
  billNumber?: string;
  grandTotal?: number;
  mergeGroupId?: string | null;
  isMergePrimary?: boolean | number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateTablesRequest {
  startNumber: number;
  endNumber: number;
  tableType: string;
  capacity?: number;
  customTableName?: string;
}

export interface MergeTablesRequest {
  tableIds: number[];
  primaryTableId?: number;
}

export interface MergeTablesResult {
  mergeGroupId: string;
  primaryTableId: number;
  tableIds: number[];
  dissolved?: boolean;
}

export interface ItemNote {
  id: number;
  label: string;
  isActive: boolean;
  sortOrder: number;
  createdAt?: string;
}

export interface CreateNoteRequest {
  label: string;
}
