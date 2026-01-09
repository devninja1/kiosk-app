import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse, LoginRequest, RegisterRequest } from '../../model/auth.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly storageKey = 'kiosk-auth';
  private readonly authState$ = new BehaviorSubject<AuthResponse | null>(this.loadStoredAuth());

  constructor(private http: HttpClient, private router: Router) {}

  login(credentials: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/Auth/login`, credentials).pipe(
      tap((response) => this.setAuth(response))
    );
  }

  register(payload: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/Auth/register`, payload);
  }

  logout(): void {
    this.clearAuth();
    this.router.navigate(['/login']);
  }

  clearAuth(): void {
    this.authState$.next(null);
    localStorage.removeItem(this.storageKey);
  }

  auth$(): Observable<AuthResponse | null> {
    return this.authState$.asObservable();
  }

  getToken(): string | null {
    return this.authState$.value?.token ?? null;
  }

  getUsername(): string | null {
    return this.authState$.value?.username ?? null;
  }

  isAuthenticated(): boolean {
    const auth = this.authState$.value;
    if (!auth?.token) {
      return false;
    }

    if (auth.expires_at) {
      const expiry = new Date(auth.expires_at);
      if (Number.isNaN(expiry.getTime()) || expiry <= new Date()) {
        return false;
      }
    }

    return true;
  }

  private setAuth(auth: AuthResponse): void {
    this.authState$.next(auth);
    localStorage.setItem(this.storageKey, JSON.stringify(auth));
  }

  private loadStoredAuth(): AuthResponse | null {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        return null;
      }

      const parsed: AuthResponse = JSON.parse(raw);
      if (!parsed?.token) {
        return null;
      }

      if (parsed.expires_at) {
        const expiry = new Date(parsed.expires_at);
        if (Number.isNaN(expiry.getTime()) || expiry <= new Date()) {
          return null;
        }
      }

      return parsed;
    } catch (error) {
      console.error('Failed to load stored auth', error);
      return null;
    }
  }
}
