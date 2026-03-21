export interface User {
  uid: string;
  email: string;
  phone?: string;
  displayName: string;
  role: 'admin' | 'manager' | 'staff';
  isActive?: boolean;
  requirePasswordChange?: boolean;
  permissions?: string[];
  profilePhoto?: string;
  createdAt?: string;
  lastLogin?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  data?: {
    token: string;
    user: User;
  };
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface CreateUserRequest {
  phone: string;
  displayName: string;
  role: 'admin' | 'manager' | 'staff';
  permissions?: string[];
}

export interface UpdateUserRequest {
  displayName?: string;
  role?: 'admin' | 'manager' | 'staff';
  permissions?: string[];
  isActive?: boolean;
}
