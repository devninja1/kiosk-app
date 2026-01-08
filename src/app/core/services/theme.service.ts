import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

type ThemeMode = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storageKey = 'kiosk-app-theme';
  private readonly themeSubject = new BehaviorSubject<ThemeMode>(this.getStoredTheme());

  readonly theme$ = this.themeSubject.asObservable();

  constructor(@Inject(DOCUMENT) private document: Document) {
    this.applyTheme(this.themeSubject.value);
  }

  toggleTheme(): void {
    const nextTheme: ThemeMode = this.themeSubject.value === 'dark' ? 'light' : 'dark';
    this.setTheme(nextTheme);
  }

  setTheme(theme: ThemeMode): void {
    this.themeSubject.next(theme);
    this.applyTheme(theme);
    this.persistTheme(theme);
  }

  private applyTheme(theme: ThemeMode): void {
    const body = this.document.body;
    body.classList.remove('theme-light', 'theme-dark');
    body.classList.add(theme === 'dark' ? 'theme-dark' : 'theme-light');
    body.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
  }

  private getStoredTheme(): ThemeMode {
    if (typeof localStorage === 'undefined') {
      return 'light';
    }
    const stored = localStorage.getItem(this.storageKey) as ThemeMode | null;
    return stored === 'dark' ? 'dark' : 'light';
  }

  private persistTheme(theme: ThemeMode): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(this.storageKey, theme);
  }
}
