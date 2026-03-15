export interface User {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'manager' | 'cashier';
  isActive?: boolean;
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
