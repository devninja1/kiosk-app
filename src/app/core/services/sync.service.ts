import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NgxIndexedDBService } from 'ngx-indexed-db';
import { EMPTY, Observable, Subject, BehaviorSubject, catchError, concatMap, finalize, from, fromEvent, map, merge, of, switchMap, tap, throwError } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { takeUntil, distinctUntilChanged } from 'rxjs/operators';
import { ApiStatusService } from './api-status.service';

export interface QueuedRequest {
  id?: number;
  url: string;
  method: 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  payload: any;
}

export interface FailedRequest extends QueuedRequest {
  error: string;
  timestamp: Date;
}

@Injectable({
  providedIn: 'root'
})
export class SyncService {
  private destroy$ = new Subject<void>();
  private online$ = new BehaviorSubject<boolean>(false);
  private pendingRequests$ = new BehaviorSubject<QueuedRequest[]>([]);
  private failedRequests$ = new BehaviorSubject<FailedRequest[]>([]);
  private isProcessingQueue = false;
  private queueProcessRequestedWhileRunning = false;

  constructor(
    private http: HttpClient,
    private dbService: NgxIndexedDBService,
    private snackBar: MatSnackBar,
    private apiStatus: ApiStatusService
  ) {
    this.online$.next(this.apiStatus.isOnlineNow());
    this.init();
    this.refreshQueues();
  }

  private init(): void {
    this.apiStatus
      .isOnline$()
      .pipe(distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(isOnline => {
        this.online$.next(isOnline);
        if (isOnline) {
          this.processQueue();
        }
      });
  }

  isOnline(): Observable<boolean> {
    return this.online$.asObservable();
  }

  addToQueue(request: QueuedRequest): void {
    // If the API is reachable, execute immediately.
    // If we're offline or the request errors, store it in sync-queue for later.
    if (this.online$.getValue()) {
      this.executeRequest(request).subscribe({
        next: () => {
          // No queue write needed.
          this.refreshQueues();
        },
        error: () => {
          this.enqueueRequest(request);
        }
      });
      return;
    }

    this.enqueueRequest(request);
  }

  private enqueueRequest(request: QueuedRequest): void {
    this.dbService.add('sync-queue', request).subscribe(() => {
      this.refreshQueues();
    });
  }

  getPendingRequestCount(): Observable<number> {
    return this.pendingRequests$.pipe(
      map(reqs => reqs.length),
      distinctUntilChanged()
    );
  }

  getPendingRequests(): Observable<QueuedRequest[]> {
    return this.pendingRequests$.asObservable();
  }

  getFailedRequests(): Observable<FailedRequest[]> {
    return this.failedRequests$.asObservable();
  }

  private refreshQueues(): void {
    this.dbService.getAll<QueuedRequest>('sync-queue').subscribe(reqs => this.pendingRequests$.next(reqs));
    this.dbService.getAll<FailedRequest>('failed-sync-queue').subscribe(reqs => this.failedRequests$.next(reqs));
  }

  public processQueue(): void {
    if (!this.online$.getValue()) return;

    // Prevent overlapping runs; if something changes while running, re-run after.
    if (this.isProcessingQueue) {
      this.queueProcessRequestedWhileRunning = true;
      return;
    }

    this.isProcessingQueue = true;
    this.queueProcessRequestedWhileRunning = false;

    this.processQueueOnce()
      .pipe(
        // If we lose connectivity (or the API is unreachable), stop this run and keep the remaining items queued.
        catchError(() => of(undefined)),
        finalize(() => {
          this.isProcessingQueue = false;
          if (this.queueProcessRequestedWhileRunning && this.online$.getValue()) {
            this.queueProcessRequestedWhileRunning = false;
            this.processQueue();
          }
        })
      )
      .subscribe();
  }

  private processQueueOnce(): Observable<void> {
    return this.dbService.getAll<QueuedRequest>('sync-queue').pipe(
      switchMap((requests) => {
        if (!requests.length) return of(undefined);
        // Process sequentially to avoid race conditions and to ensure ordering.
        return from(requests).pipe(
          concatMap((req) => this.syncSingleRequest(req)),
          switchMap(() => of(undefined))
        );
      })
    );
  }

  private syncSingleRequest(req: QueuedRequest): Observable<void> {
    // Requests coming from the queue should have an IndexedDB key.
    if (!req.id) {
      return of(undefined);
    }

    return this.executeRequest(req).pipe(
      switchMap(() => this.dbService.delete('sync-queue', req.id!)),
      tap(() => {
        const urlLower = req.url.toLowerCase();
        const isSales = urlLower.includes('sales');
        this.snackBar.open(isSales ? 'Sales synced successfully.' : 'An item was synced successfully.', 'Close', {
          duration: 2000,
          panelClass: isSales ? ['success-snackbar'] : undefined
        });
        this.refreshQueues();
      }),
      map(() => undefined),
      catchError((err) => this.handleSyncError(req, err))
    );
  }

  private executeRequest(req: QueuedRequest): Observable<unknown> {
    return this.http.request(req.method, req.url, { body: req.payload }).pipe(
      tap((response: any) => {
        if (req.method === 'POST' && req.payload?.tempId) {
          // This was an offline creation; update local record with server response.
          const urlLower = req.url.toLowerCase();
          let storeName;
          if (urlLower.includes('products')) {
            storeName = 'products';
          } else if (urlLower.includes('customers')) {
            storeName = 'customers';
          } else if (urlLower.includes('sales')) {
            // Handles urls like /sales and /SalesOrder
            storeName = 'sales';
          } else if (urlLower.includes('purchases')) {
            storeName = 'purchases';
          }
          if (storeName) {
            this.handleSuccessfulPost(storeName, req.payload.tempId, response);
          }
        }
      })
    );
  }

  private handleSyncError(req: QueuedRequest, err: any): Observable<void> {
    console.error('Sync failed for request:', req, err);

    // Status 0 is typically a network error / CORS / API unreachable.
    // Keep it in sync-queue and stop processing further.
    if (err?.status === 0) {
      return throwError(() => err);
    }

    // For server errors (e.g., 5xx), keep it in sync-queue and stop processing further.
    if (typeof err?.status === 'number' && err.status >= 500) {
      return throwError(() => err);
    }

    if (err?.status === 404) {
      // The resource was not found on the server.
      if (req.method === 'PUT' || req.method === 'PATCH') {
        // CONFLICT: The item was edited offline, but deleted on the server.
        const storeName = req.url.includes('products') ? 'products' : 'customers';
        const id = Number(req.url.split('/').pop());
        if (!isNaN(id)) {
          // Remove the stale item from local DB
          this.dbService.delete(storeName, id).subscribe();
          // Notify the user
          this.snackBar.open(
            `An item you edited offline was deleted by another user. Your changes could not be saved.`,
            'OK',
            { duration: 7000, panelClass: ['warn-snackbar'] }
          );
        }
      }
      // Clean up the failed/irrelevant request from the queue.
      return this.dbService.delete('sync-queue', req.id!).pipe(
        tap(() => this.refreshQueues()),
        map(() => undefined)
      );
    }

    // For any other error, move it to the failed queue.
    const failedRequest: FailedRequest = {
      ...req,
      error: err?.message || 'An unknown error occurred during sync.',
      timestamp: new Date()
    };

    return this.dbService.add('failed-sync-queue', failedRequest).pipe(
      switchMap(() => this.dbService.delete('sync-queue', req.id!)),
      tap(() => this.refreshQueues()),
      map(() => undefined)
    );
  }

  private handleSuccessfulPost(storeName: string, tempId: number, serverResponse: any) {
    this.dbService.getByID(storeName, tempId).subscribe((record: any) => {
      if (record) {
        // Delete the temporary local record
        this.dbService.delete(storeName, tempId).subscribe(() => {
          // Add the permanent record from the server (normalize for local stores when needed)
          const normalized = this.normalizeServerRecordForStore(storeName, serverResponse);
          this.dbService.add(storeName, normalized).subscribe();
        });
      }
    });
  }

  private normalizeServerRecordForStore(storeName: string, serverResponse: any): any {
    if (!serverResponse) return serverResponse;

    if (storeName === 'sales') {
      // API returns SalesOrder DTO with `order_id` and `orderItems`.
      // Local app uses `id` as keyPath and `order_items` for UI.
      const orderId = serverResponse?.order_id ?? serverResponse?.orderId ?? serverResponse?.id;
      const normalized: any = {
        ...serverResponse,
        id: typeof orderId === 'string' ? Number(orderId) : orderId,
        order_id: serverResponse?.order_id ?? orderId,
      };

      if (Array.isArray(serverResponse?.orderItems) && !Array.isArray(serverResponse?.order_items)) {
        normalized.order_items = serverResponse.orderItems;
      }

      // Avoid keeping both shapes around.
      if ('orderItems' in normalized) {
        delete normalized.orderItems;
      }

      return normalized;
    }

    return serverResponse;
  }

  private moveToFailedQueue(request: QueuedRequest, error: any) {
    console.error('Sync failed for request:', JSON.stringify(request), error, error);
    const failedRequest: FailedRequest = {
      ...request,
      error: error.message || 'An unknown error occurred during sync.',
      timestamp: new Date()
    };
    this.dbService.add('failed-sync-queue', failedRequest).subscribe(() => {
      this.dbService.delete('sync-queue', request.id!).subscribe(() => {
        this.refreshQueues();
      });
    });
  }

  retryFailedRequest(request: FailedRequest): Observable<any> {
       console.error('Sync failed for request:', JSON.stringify(request));
    this.addToQueue({ url: request.url, method: request.method, payload: request.payload });
    return this.dbService.delete('failed-sync-queue', request.id!).pipe(tap(() => this.refreshQueues()));
  }

  retryAllFailedRequests(): Observable<any> {
    return this.dbService.getAll<FailedRequest>('failed-sync-queue').pipe(
      switchMap(failedRequests => {
        if (failedRequests.length === 0) {
          return of(null);
        }
        const reQueueOps = failedRequests.map(req => ({
          url: req.url, method: req.method, payload: req.payload
        }));
        // Use bulk add to re-queue all failed requests
        return this.dbService.bulkAdd('sync-queue', reQueueOps).pipe(
          // Then clear the failed queue
          switchMap(() => this.dbService.clear('failed-sync-queue'))
        );
      }),
      tap(() => this.refreshQueues())
    );
  }

  deleteFailedRequest(id: number): Observable<any> {
    return this.dbService.delete('failed-sync-queue', id).pipe(tap(() => this.refreshQueues()));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}