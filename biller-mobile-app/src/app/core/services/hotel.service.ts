import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { RestaurantTable, CreateTablesRequest, ItemNote, CreateNoteRequest } from '../models/hotel.model';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

@Injectable({
  providedIn: 'root'
})
export class HotelService {
  private readonly API_URL = `${environment.apiUrl}/hotel`;

  // Signals for reactive state
  tables = signal<RestaurantTable[]>([]);
  itemNotes = signal<ItemNote[]>([]);
  loading = signal(false);

  constructor(private http: HttpClient) {}

  // ==================== TABLES ====================

  loadTables(): Observable<ApiResponse<RestaurantTable[]>> {
    this.loading.set(true);
    return this.http.get<ApiResponse<RestaurantTable[]>>(`${this.API_URL}/tables`).pipe(
      tap({
        next: (response) => {
          if (response.success) {
            this.tables.set(response.data);
          }
          this.loading.set(false);
        },
        error: () => this.loading.set(false)
      })
    );
  }

  getTable(id: number): Observable<ApiResponse<RestaurantTable>> {
    return this.http.get<ApiResponse<RestaurantTable>>(`${this.API_URL}/tables/${id}`);
  }

  createTables(request: CreateTablesRequest): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${this.API_URL}/tables`, request).pipe(
      tap((response) => {
        if (response.success) {
          this.loadTables().subscribe();
        }
      })
    );
  }

  updateTable(id: number, data: Partial<RestaurantTable>): Observable<ApiResponse<any>> {
    return this.http.put<ApiResponse<any>>(`${this.API_URL}/tables/${id}`, data).pipe(
      tap((response) => {
        if (response.success) {
          this.loadTables().subscribe();
        }
      })
    );
  }

  deleteTable(id: number): Observable<ApiResponse<any>> {
    return this.http.delete<ApiResponse<any>>(`${this.API_URL}/tables/${id}`).pipe(
      tap((response) => {
        if (response.success) {
          this.tables.update(tables => tables.filter(t => t.id !== id));
        }
      })
    );
  }

  updateTableStatus(id: number, status: string, currentBillId?: string): Observable<ApiResponse<any>> {
    return this.http.patch<ApiResponse<any>>(`${this.API_URL}/tables/${id}/status`, {
      status,
      currentBillId
    });
  }

  // Get tables by type
  getTablesByType(type: 'dine-in' | 'parcel'): RestaurantTable[] {
    return this.tables().filter(t => t.tableType === type);
  }

  // Get available tables
  getAvailableTables(): RestaurantTable[] {
    return this.tables().filter(t => t.status === 'available');
  }

  // Get occupied tables
  getOccupiedTables(): RestaurantTable[] {
    return this.tables().filter(t => t.status === 'occupied');
  }

  // ==================== ITEM NOTES ====================

  loadItemNotes(): Observable<ApiResponse<ItemNote[]>> {
    return this.http.get<ApiResponse<ItemNote[]>>(`${this.API_URL}/notes`).pipe(
      tap({
        next: (response) => {
          if (response.success) {
            this.itemNotes.set(response.data);
          }
        }
      })
    );
  }

  createItemNote(request: CreateNoteRequest): Observable<ApiResponse<ItemNote>> {
    return this.http.post<ApiResponse<ItemNote>>(`${this.API_URL}/notes`, request).pipe(
      tap((response) => {
        if (response.success) {
          this.loadItemNotes().subscribe();
        }
      })
    );
  }

  updateItemNote(id: number, data: Partial<ItemNote>): Observable<ApiResponse<any>> {
    return this.http.put<ApiResponse<any>>(`${this.API_URL}/notes/${id}`, data).pipe(
      tap((response) => {
        if (response.success) {
          this.loadItemNotes().subscribe();
        }
      })
    );
  }

  deleteItemNote(id: number): Observable<ApiResponse<any>> {
    return this.http.delete<ApiResponse<any>>(`${this.API_URL}/notes/${id}`).pipe(
      tap((response) => {
        if (response.success) {
          this.itemNotes.update(notes => notes.filter(n => n.id !== id));
        }
      })
    );
  }
}
