import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/services/auth.service';
import { RegisterRequest } from '../../model/auth.model';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    RouterLink
  ],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent {
  hidePassword = true;
  loading = false;
  errorMessage = '';
  successMessage = '';
  private readonly themeService = inject(ThemeService);
  theme$ = this.themeService.theme$;

  private readonly fb = inject(FormBuilder);
  form = this.fb.nonNullable.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    passwordConfirm: ['', [Validators.required, Validators.minLength(6)]],
    role: ['', [Validators.required]],
    group: ['default'],
    is_active: [false]
  });

  constructor(private authService: AuthService, private router: Router) {
    this.themeService.setTheme('dark');
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    if (this.form.value.password !== this.form.value.passwordConfirm) {
      this.loading = false;
      this.errorMessage = 'Passwords do not match.';
      return;
    }

    const payload: RegisterRequest = {
      username: this.form.value.username ?? '',
      password: this.form.value.password ?? '',
      role: this.form.value.role ?? '',
      group: this.form.value.group ?? 'default',
      is_active: this.form.value.is_active ?? false
    };

    this.authService.register(payload).subscribe({
      next: () => {
        this.loading = false;
        this.successMessage = 'Account created. Please login to continue.';
        setTimeout(() => this.router.navigate(['/login']), 500);
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = this.extractErrorMessage(err) ?? 'Registration failed. Please check the details and try again.';
      }
    });
  }

  private extractErrorMessage(err: unknown): string | null {
    if (!err) {
      return null;
    }
    const maybeAny = err as any;
    return maybeAny?.error?.message || maybeAny?.message || null;
  }
}
