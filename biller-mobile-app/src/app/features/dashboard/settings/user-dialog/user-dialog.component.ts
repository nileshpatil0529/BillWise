import { Component, inject, signal, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { UserService } from '../../../../core/services/user.service';
import { User } from '../../../../core/models/user.model';

@Component({
  selector: 'app-user-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatSlideToggleModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatCardModule
  ],
  templateUrl: './user-dialog.component.html',
  styleUrls: ['./user-dialog.component.scss']
})
export class UserDialogComponent {
  private fb = inject(FormBuilder);
  private userService = inject(UserService);
  private snackBar = inject(MatSnackBar);
  private dialogRef = inject(MatDialogRef<UserDialogComponent>);

  userForm: FormGroup;
  loading = signal(false);
  defaultPassword = 'User@123';

  availablePermissions = [
    { value: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { value: 'products', label: 'Products', icon: 'inventory_2' },
    { value: 'bills', label: 'Bills', icon: 'receipt_long' },
    { value: 'customers', label: 'Customers', icon: 'people' },
    { value: 'settings', label: 'Settings', icon: 'settings' }
  ];

  selectedPermissions = signal<string[]>([]);

  constructor(@Inject(MAT_DIALOG_DATA) public data: { user?: User }) {
    const user = data?.user;

    this.userForm = this.fb.group({
      displayName: [user?.displayName || '', Validators.required],
      phone: [user?.phone || '', !user ? [Validators.required, Validators.pattern(/^[0-9]{10}$/)] : []],
      role: [user?.role || 'staff', Validators.required],
      isActive: [user?.isActive !== undefined ? user.isActive : true]
    });

    // Initialize permissions
    if (user?.permissions) {
      this.selectedPermissions.set([...user.permissions]);
    } else {
      // Set default permissions based on role
      this.setDefaultPermissions(user?.role || 'staff');
    }
  }

  onRoleChange(role: string): void {
    this.setDefaultPermissions(role);
  }

  setDefaultPermissions(role: string): void {
    let defaultPerms: string[] = [];
    
    if (role === 'admin') {
      defaultPerms = ['dashboard', 'products', 'bills', 'customers', 'settings'];
    } else if (role === 'manager') {
      defaultPerms = ['dashboard', 'products', 'bills', 'customers'];
    } else {
      defaultPerms = ['dashboard', 'bills'];
    }

    this.selectedPermissions.set(defaultPerms);
  }

  isPermissionChecked(permission: string): boolean {
    return this.selectedPermissions().includes(permission);
  }

  togglePermission(permission: string, checked: boolean): void {
    if (checked) {
      this.selectedPermissions.update(perms => [...perms, permission]);
    } else {
      this.selectedPermissions.update(perms => perms.filter(p => p !== permission));
    }
  }

  onSubmit(): void {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);

    const formValue = this.userForm.value;
    const payload = {
      displayName: formValue.displayName,
      role: formValue.role,
      permissions: this.selectedPermissions(),
      ...(this.data?.user ? { isActive: formValue.isActive } : { phone: formValue.phone })
    };

    const request$ = this.data?.user
      ? this.userService.updateUser(this.data.user.uid, payload)
      : this.userService.createUser(payload as any);

    request$.subscribe({
      next: (response) => {
        if (response.success) {
          this.snackBar.open(
            this.data?.user ? 'User updated successfully' : 'User created successfully',
            'Close',
            { duration: 3000 }
          );
          this.dialogRef.close(response.data);
        } else {
          this.snackBar.open(response.message || 'Operation failed', 'Close', { duration: 3000 });
        }
        this.loading.set(false);
      },
      error: (error) => {
        this.snackBar.open(error.error?.message || 'Operation failed', 'Close', { duration: 3000 });
        this.loading.set(false);
      }
    });
  }
}
