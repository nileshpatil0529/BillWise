import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User, CreateUserRequest, UpdateUserRequest, ChangePasswordRequest } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private readonly API_URL = `${environment.apiUrl}/users`;

  users = signal<User[]>([]);

  constructor(private http: HttpClient) {}

  // Get all users (admin only)
  getUsers(): Observable<any> {
    return this.http.get(`${this.API_URL}`).pipe(
      tap((response: any) => {
        if (response.success) {
          this.users.set(response.data);
        }
      })
    );
  }

  // Create new user (admin only)
  createUser(data: CreateUserRequest): Observable<any> {
    return this.http.post(`${this.API_URL}`, data).pipe(
      tap((response: any) => {
        if (response.success) {
          this.users.update(users => [...users, response.data]);
        }
      })
    );
  }

  // Update user (admin only)
  updateUser(uid: string, data: UpdateUserRequest): Observable<any> {
    return this.http.put(`${this.API_URL}/${uid}`, data).pipe(
      tap((response: any) => {
        if (response.success) {
          this.users.update(users => 
            users.map(u => u.uid === uid ? response.data : u)
          );
        }
      })
    );
  }

  // Delete user (admin only)
  deleteUser(uid: string): Observable<any> {
    return this.http.delete(`${this.API_URL}/${uid}`).pipe(
      tap((response: any) => {
        if (response.success) {
          this.users.update(users => users.filter(u => u.uid !== uid));
        }
      })
    );
  }

  // Reset user password (admin only)
  resetPassword(uid: string): Observable<any> {
    return this.http.post(`${this.API_URL}/${uid}/reset-password`, {});
  }

  // Change own password
  changePassword(data: ChangePasswordRequest): Observable<any> {
    return this.http.post(`${this.API_URL}/change-password`, data);
  }
}
