import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Bill, BillResponse, BillItem, ReportData } from '../models/bill.model';
import { CartItem, Product } from '../models/product.model';
import { SettingsService } from './settings.service';

@Injectable({
  providedIn: 'root'
})
export class BillService {
  private readonly API_URL = `${environment.apiUrl}/bills`;
  private settingsService = inject(SettingsService);

  // Cart state
  cartItems = signal<CartItem[]>([]);
  
  // Computed values
  cartSubtotal = computed(() => 
    this.cartItems().reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)
  );
  
  cartDiscount = computed(() => {
    // Check if discount is enabled in settings
    const settings = this.settingsService.settings();
    if (!settings.discountEnabled) {
      return 0;
    }
    return this.billDiscount();
  });
  
  cartTax = computed(() => {
    // Check if tax is enabled in settings
    const settings = this.settingsService.settings();
    if (!settings.taxEnabled) {
      return 0;
    }
    
    const subtotal = this.cartSubtotal();
    const discount = this.cartDiscount();
    const taxableAmount = subtotal - discount;
    const items = this.cartItems();
    if (items.length === 0) return 0;
    
    // Use tax rate from settings
    const taxRate = settings.taxRates?.[0]?.rate || 0;
    return (taxableAmount * taxRate) / 100;
  });
  
  cartTotal = computed(() => 
    this.cartSubtotal() - this.cartDiscount() + this.cartTax()
  );
  
  cartItemCount = computed(() => 
    this.cartItems().reduce((sum, item) => sum + item.quantity, 0)
  );

  // Bill discount
  billDiscount = signal<number>(0);
  billDiscountType = signal<'percentage' | 'fixed'>('percentage');

  constructor(private http: HttpClient) {}

  // Cart operations
  addToCart(product: Product): void {
    const items = this.cartItems();
    const existingIndex = items.findIndex(item => item.productId === product.productId);

    if (existingIndex >= 0) {
      // Update quantity
      const updated = [...items];
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: updated[existingIndex].quantity + 1,
        lineTotal: (updated[existingIndex].quantity + 1) * updated[existingIndex].unitPrice
      };
      this.cartItems.set(updated);
    } else {
      // Add new item
      const cartItem: CartItem = {
        ...product,
        quantity: 1,
        discount: 0,
        discountType: 'fixed',
        lineTotal: product.unitPrice
      };
      this.cartItems.set([...items, cartItem]);
    }
  }

  updateCartItem(productId: string, updates: Partial<CartItem>): void {
    const items = this.cartItems();
    const index = items.findIndex(item => item.productId === productId);

    if (index >= 0) {
      const updated = [...items];
      updated[index] = { ...updated[index], ...updates };
      updated[index].lineTotal = updated[index].unitPrice * updated[index].quantity;
      this.cartItems.set(updated);
    }
  }

  removeFromCart(productId: string): void {
    this.cartItems.set(this.cartItems().filter(item => item.productId !== productId));
  }

  clearCart(): void {
    this.cartItems.set([]);
    this.billDiscount.set(0);
  }

  // Bill API operations
  getBills(params?: {
    startDate?: string;
    endDate?: string;
    paymentMethod?: string;
    paymentStatus?: string;
    page?: number;
    limit?: number;
  }): Observable<BillResponse> {
    let httpParams = new HttpParams();
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          httpParams = httpParams.set(key, value.toString());
        }
      });
    }

    return this.http.get<BillResponse>(this.API_URL, { params: httpParams });
  }

  getBillById(id: string): Observable<any> {
    return this.http.get(`${this.API_URL}/${id}`);
  }

  createBill(billData: {
    paymentMethod: string;
    paymentStatus: string;
    amountPaid: number;
    customerName?: string;
    customerPhone?: string;
    businessTypeData?: any;
    notes?: string;
  }): Observable<any> {
    const settings = this.settingsService.settings();
    const taxRate = settings.taxRates?.[0]?.rate || 0;
    
    const items = this.cartItems().map(item => ({
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      discountType: item.discountType
    }));

    const bill = {
      items,
      billDiscount: this.billDiscount(),
      billDiscountType: this.billDiscountType(),
      taxEnabled: settings.taxEnabled,
      taxRate: taxRate,
      ...billData
    };

    return this.http.post(this.API_URL, bill);
  }

  updateBill(id: string, updates: Partial<Bill>): Observable<any> {
    return this.http.put(`${this.API_URL}/${id}`, updates);
  }

  getReport(startDate?: string, endDate?: string): Observable<{ success: boolean; data: ReportData }> {
    let params = new HttpParams();
    if (startDate) params = params.set('startDate', startDate);
    if (endDate) params = params.set('endDate', endDate);

    return this.http.get<{ success: boolean; data: ReportData }>(`${this.API_URL}/report`, { params });
  }

  printBill(billId: string): Observable<any> {
    return this.http.post(`${this.API_URL}/print`, { billId });
  }
}
