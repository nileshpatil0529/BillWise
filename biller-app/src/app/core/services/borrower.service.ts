import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Borrower, BorrowerResponse, BorrowerDetailResponse, BorrowerWithDebts } from '../models/borrower.model';

@Injectable({
  providedIn: 'root'
})
export class BorrowerService {
  private readonly API_URL = `${environment.apiUrl}/borrowers`;

  borrowers = signal<Borrower[]>([]);
  loading = signal(false);

  constructor(private http: HttpClient) {}

  getBorrowers(): Observable<BorrowerResponse> {
    this.loading.set(true);
    return this.http.get<BorrowerResponse>(this.API_URL).pipe(
      tap({
        next: (response) => {
          if (response.success) {
            this.borrowers.set(response.data);
          }
          this.loading.set(false);
        },
        error: () => this.loading.set(false)
      })
    );
  }

  searchBorrowers(query: string): Observable<BorrowerResponse> {
    return this.http.get<BorrowerResponse>(`${this.API_URL}/search`, {
      params: { q: query }
    });
  }

  getBorrowerById(borrowerId: string): Observable<BorrowerDetailResponse> {
    return this.http.get<BorrowerDetailResponse>(`${this.API_URL}/${borrowerId}`);
  }

  createBorrower(borrower: Partial<Borrower>): Observable<{ success: boolean; data: Borrower; message?: string }> {
    return this.http.post<{ success: boolean; data: Borrower; message?: string }>(this.API_URL, borrower);
  }

  updateBorrower(borrowerId: string, borrower: Partial<Borrower>): Observable<{ success: boolean; data: Borrower }> {
    return this.http.put<{ success: boolean; data: Borrower }>(`${this.API_URL}/${borrowerId}`, borrower);
  }

  deleteBorrower(borrowerId: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${this.API_URL}/${borrowerId}`);
  }

  payDebt(borrowerId: string, billId: string, amount: number): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.API_URL}/${borrowerId}/pay`, {
      billId,
      amount
    });
  }
}
