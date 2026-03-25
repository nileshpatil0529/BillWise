import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Product, ProductResponse } from '../models/product.model';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private readonly API_URL = `${environment.apiUrl}/products`;

  // Signals
  products = signal<Product[]>([]);
  loading = signal<boolean>(false);
  categories = signal<string[]>([]);

  constructor(private http: HttpClient) {}

  getProducts(params?: {
    category?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Observable<ProductResponse> {
    let httpParams = new HttpParams();
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          httpParams = httpParams.set(key, value.toString());
        }
      });
    }

    this.loading.set(true);
    
    return this.http.get<ProductResponse>(this.API_URL, { params: httpParams })
      .pipe(
        tap(response => {
          if (response.success) {
            this.products.set(response.data.products);
          }
          this.loading.set(false);
        })
      );
  }

  searchProducts(query: string): Observable<any> {
    return this.http.get(`${this.API_URL}/search`, {
      params: { q: query }
    });
  }

  getProductById(id: string): Observable<any> {
    return this.http.get(`${this.API_URL}/${id}`);
  }

  createProduct(product: Partial<Product>): Observable<any> {
    return this.http.post(this.API_URL, product);
  }

  updateProduct(id: string, product: Partial<Product>): Observable<any> {
    return this.http.put(`${this.API_URL}/${id}`, product);
  }

  deleteProduct(id: string): Observable<any> {
    return this.http.delete(`${this.API_URL}/${id}`);
  }

  getCategories(): Observable<any> {
    return this.http.get(`${this.API_URL}/categories`)
      .pipe(
        tap((response: any) => {
          if (response.success) {
            this.categories.set(response.data);
          }
        })
      );
  }

  importProducts(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post(`${this.API_URL}/import`, formData);
  }

  exportProducts(): Observable<Blob> {
    return this.http.get(`${this.API_URL}/export`, {
      responseType: 'blob'
    });
  }

  printBarcode(barcode: string, quantity: number): Observable<any> {
    return this.http.post(`${this.API_URL}/print-barcode`, {
      barcode,
      quantity
    });
  }
}
