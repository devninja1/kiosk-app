export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  role: string;
  group: string;
  is_active: boolean;
}

export interface AuthResponse {
  token: string;
  expires_at: string;
  username: string;
  role: string;
  group: string;
}
