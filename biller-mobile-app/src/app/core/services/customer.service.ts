import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Customer, CustomerResponse, CustomerDetailResponse, CustomerWithDebts } from '../models/customer.model';

@Injectable({
  providedIn: 'root'
})
export class CustomerService {
  private readonly API_URL = `${environment.apiUrl}/customers`;

  customers = signal<Customer[]>([]);
  loading = signal(false);

  constructor(private http: HttpClient) {}

  getCustomers(): Observable<CustomerResponse> {
    this.loading.set(true);
    return this.http.get<CustomerResponse>(this.API_URL).pipe(
      tap({
        next: (response) => {
          if (response.success) {
            this.customers.set(response.data);
          }
          this.loading.set(false);
        },
        error: () => this.loading.set(false)
      })
    );
  }

  searchCustomers(query: string): Observable<CustomerResponse> {
    return this.http.get<CustomerResponse>(`${this.API_URL}/search`, {
      params: { q: query }
    });
  }

  getCustomerById(customerId: string): Observable<CustomerDetailResponse> {
    return this.http.get<CustomerDetailResponse>(`${this.API_URL}/${customerId}`);
  }

  createCustomer(Customer: Partial<Customer>): Observable<{ success: boolean; data: Customer; message?: string }> {
    return this.http.post<{ success: boolean; data: Customer; message?: string }>(this.API_URL, Customer);
  }

  updateCustomer(customerId: string, Customer: Partial<Customer>): Observable<{ success: boolean; data: Customer }> {
    return this.http.put<{ success: boolean; data: Customer }>(`${this.API_URL}/${customerId}`, Customer);
  }

  deleteCustomer(customerId: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${this.API_URL}/${customerId}`);
  }

  payDebt(customerId: string, billId: string, amount: number): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.API_URL}/${customerId}/pay`, {
      billId,
      amount
    });
  }

  getCustomerBills(customerId: string, page: number = 1, limit: number = 100): Observable<any> {
    return this.http.get<any>(`${this.API_URL}/${customerId}/bills`, {
      params: { page: page.toString(), limit: limit.toString() }
    });
  }
}
