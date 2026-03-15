export interface Product {
  productId: string;
  name: string;
  category: string;
  description?: string;
  unitPrice: number;
  costPrice?: number;
  stockQuantity: number;
  lowStockAlert?: number;
  imageUrl?: string;
  barcode?: string;
  status: 'active' | 'inactive';
  metadata?: ProductMetadata;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductMetadata {
  // Clothing
  size?: string;
  color?: string;
  brand?: string;
  season?: string;
  
  // Electronics
  serialNumber?: string;
  warranty?: number;
  modelNumber?: string;
  manufacturer?: string;
  
  // Grocery
  weight?: number;
  expiryDate?: string;
  batchNumber?: string;
  
  // Hotel
  roomNumber?: string;
  serviceType?: string;
}

export interface CartItem extends Product {
  quantity: number;
  discount: number;
  discountType: 'percentage' | 'fixed';
  lineTotal: number;
}

export interface ProductResponse {
  success: boolean;
  data: {
    products: Product[];
    total: number;
    page: number;
    totalPages: number;
  };
}
