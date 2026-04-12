import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';

import { UserService } from '../../../core/services/user.service';
import { AuthService } from '../../../core/services/auth.service';
import { TranslateService } from '../../../core/services/translate.service';
import { User } from '../../../core/models/user.model';
import { UserDialogComponent } from '../settings/user-dialog/user-dialog.component';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatDividerModule
  ],
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.scss']
})
export class UsersComponent implements OnInit {
  userService = inject(UserService);
  authService = inject(AuthService);
  translateService = inject(TranslateService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  loadingUsers = signal(false);
  searchQuery = signal('');
  
  // Filtered users based on search
  filteredUsers = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const users = this.userService.users();
    
    if (!query) {
      return users;
    }
    
    return users.filter(user => 
      user.displayName?.toLowerCase().includes(query) ||
      user.phone?.toLowerCase().includes(query) ||
      user.role?.toLowerCase().includes(query)
    );
  });

  ngOnInit(): void {
    this.loadUsers();
  }

  getInitials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchQuery.set(value);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  loadUsers(): void {
    this.loadingUsers.set(true);
    this.userService.getUsers().subscribe({
      next: () => {
        this.loadingUsers.set(false);
      },
      error: () => {
        this.snackBar.open('Failed to load users', 'Close', { duration: 3000 });
        this.loadingUsers.set(false);
      }
    });
  }

  openCreateUserDialog(): void {
    const dialogRef = this.dialog.open(UserDialogComponent, {
      width: '600px',
      maxWidth: '100vw',
      maxHeight: '100vh',
      panelClass: 'user-dialog-panel',
      data: {}
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadUsers();
      }
    });
  }

  openEditUserDialog(user: User): void {
    const dialogRef = this.dialog.open(UserDialogComponent, {
      width: '600px',
      maxWidth: '100vw',
      maxHeight: '100vh',
      panelClass: 'user-dialog-panel',
      data: { user }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadUsers();
      }
    });
  }

  resetUserPassword(user: User): void {
    if (confirm(`Reset password for ${user.displayName}? They will be required to change it on next login.`)) {
      this.userService.resetPassword(user.uid).subscribe({
        next: (response) => {
          if (response.success) {
            const defaultPassword = response.data?.defaultPassword || 'User@123';
            this.snackBar.open(
              `Password reset successfully. New password: ${defaultPassword}`,
              'Close',
              { duration: 8000, panelClass: ['success-snackbar'] }
            );
            this.loadUsers();
          } else {
            this.snackBar.open(response.message || 'Failed to reset password', 'Close', { duration: 3000 });
          }
        },
        error: (error) => {
          this.snackBar.open(error.error?.message || 'Failed to reset password', 'Close', { duration: 3000 });
        }
      });
    }
  }

  toggleUserStatus(user: User): void {
    const newStatus = !user.isActive;
    const action = newStatus ? 'activate' : 'deactivate';
    
    if (confirm(`Are you sure you want to ${action} ${user.displayName}?`)) {
      this.userService.updateUser(user.uid, { isActive: newStatus }).subscribe({
        next: () => {
          this.loadUsers();
        },
        error: (error) => {
          this.snackBar.open(error.error?.message || `Failed to ${action} user`, 'Close', { duration: 3000 });
        }
      });
    }
  }

  deleteUser(user: User): void {
    if (confirm(`Are you sure you want to delete ${user.displayName}? This action cannot be undone.`)) {
      this.userService.deleteUser(user.uid).subscribe({
        next: () => {
          this.loadUsers();
        },
        error: (error) => {
          this.snackBar.open(error.error?.message || 'Failed to delete user', 'Close', { duration: 3000 });
        }
      });
    }
  }
}
