import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NgxIndexedDBService } from 'ngx-indexed-db';
import { EMPTY, Observable, Subject, BehaviorSubject, catchError, concatMap, finalize, from, fromEvent, map, merge, of, switchMap, tap, throwError } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { takeUntil, distinctUntilChanged } from 'rxjs/operators';

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
  private online$ = new BehaviorSubject<boolean>(navigator.onLine);
  private pendingRequests$ = new BehaviorSubject<QueuedRequest[]>([]);
  private failedRequests$ = new BehaviorSubject<FailedRequest[]>([]);
  private isProcessingQueue = false;
  private queueProcessRequestedWhileRunning = false;

  constructor(
    private http: HttpClient,
    private dbService: NgxIndexedDBService,
    private snackBar: MatSnackBar
  ) {
    this.init();
    this.refreshQueues();
  }

  private init(): void {
    merge(
      of(navigator.onLine),
      fromEvent(window, 'online').pipe(map(() => true)),
      fromEvent(window, 'offline').pipe(map(() => false))
    ).pipe(distinctUntilChanged(), takeUntil(this.destroy$)).subscribe(isOnline => {
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
        this.snackBar.open('An item was synced successfully.', 'Close', { duration: 2000 });
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
          let storeName;
          if (req.url.includes('products')) {
            storeName = 'products';
          } else if (req.url.includes('customers')) {
            storeName = 'customers';
          } else if (req.url.includes('sales')) {
            storeName = 'sales';
          } else if (req.url.includes('purchases')) {
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
          // Add the permanent record from the server
          this.dbService.add(storeName, serverResponse).subscribe();
        });
      }
    });
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