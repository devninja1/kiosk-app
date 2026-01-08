import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, catchError, distinctUntilChanged, fromEvent, map, merge, of, switchMap, takeUntil, timer } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Global API connectivity detector.
 *
 * - Uses browser online/offline events as a hint.
 * - Actively probes the API to ensure it is actually reachable.
 */
@Injectable({
  providedIn: 'root'
})
export class ApiStatusService implements OnDestroy {
  private destroy$ = new Subject<void>();
  private online$ = new BehaviorSubject<boolean>(navigator.onLine);

  /**
   * Probe endpoint.
   * If it returns 2xx/3xx/4xx we still consider API reachable.
   * Only network-level failures (status 0) are treated as offline.
   */
  private readonly probeUrl = `${environment.apiUrl}/SalesOrder?page=1&pageSize=1`;

  constructor(private http: HttpClient) {
    // React to browser connectivity changes and re-check API.
    merge(
      of(navigator.onLine),
      fromEvent(window, 'online').pipe(map(() => true)),
      fromEvent(window, 'offline').pipe(map(() => false))
    )
      .pipe(distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((browserOnline) => {
        if (!browserOnline) {
          this.online$.next(false);
          return;
        }
        this.checkNow().subscribe();
      });

    // Periodic probe while browser reports online.
    timer(0, 30000)
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => (navigator.onLine ? this.checkNow() : of(false)))
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  isOnline$(): Observable<boolean> {
    return this.online$.asObservable().pipe(distinctUntilChanged());
  }

  /** Snapshot for services that need sync branching. */
  isOnlineNow(): boolean {
    return this.online$.getValue();
  }

  /** Force an API reachability check. */
  checkNow(): Observable<boolean> {
    // If the browser is offline, don’t bother probing.
    if (!navigator.onLine) {
      this.online$.next(false);
      return of(false);
    }

    return this.http
      .get(this.probeUrl, {
        observe: 'response',
        responseType: 'text'
      })
      .pipe(
        map((res: HttpResponse<string>) => {
          // Any HTTP response means the API is reachable.
          this.online$.next(true);
          return true;
        }),
        catchError((err: HttpErrorResponse) => {
          // status 0 => network error / CORS / API unreachable.
          const reachable = err?.status !== 0;
          this.online$.next(reachable);
          return of(reachable);
        })
      );
  }
}
