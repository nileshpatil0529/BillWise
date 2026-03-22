export interface RestaurantTable {
  id: number;
  tableNumber: string;
  tableType: 'dine-in' | 'parcel';
  capacity: number;
  status: 'available' | 'occupied' | 'reserved' | 'cleaning';
  currentBillId?: string;
  billNumber?: string;
  grandTotal?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateTablesRequest {
  startNumber: number;
  endNumber: number;
  tableType: 'dine-in' | 'parcel';
  capacity?: number;
}
