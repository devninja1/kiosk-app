import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { concatMap, from, Observable, of, tap, BehaviorSubject, switchMap, map, catchError, toArray } from 'rxjs';
import { NgxIndexedDBService } from 'ngx-indexed-db';
import { Sale, SaleStatus } from '../../model/sale.model';
import { SalesItem } from '../../model/sales.model';
import { PaginatedResponse } from '../../model/paginated-response.model';
import { SyncService } from './sync.service';
import { ProductService } from './product.service';
import { ApiStatusService } from './api-status.service';
import { environment } from '../../../environments/environment';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({
  providedIn: 'root'
})
export class SalesService {
  private apiUrl = `${environment.apiUrl}/SalesOrder`;
  private sales$ = new BehaviorSubject<Sale[]>([]);
  private readonly defaultPage = 1;
  private readonly defaultPageSize = 5;

  constructor(
    private http: HttpClient,
    private dbService: NgxIndexedDBService,
    private syncService: SyncService,
    private productService: ProductService, // Inject ProductService
    private apiStatus: ApiStatusService,
    private snackBar: MatSnackBar
  ) {
    this.apiStatus.isOnline$().subscribe(isOnline => {
      if (isOnline) {
        // When connectivity returns, refresh from API.
        this.syncWithApi().subscribe();
      }
    });
    this.loadInitialData();
  }

  private loadInitialData(): void {
    if (this.apiStatus.isOnlineNow()) {
      this.syncWithApi().subscribe();
      return;
    }

    this.dbService.getAll<Sale>('sales')
      .pipe(tap(sales => this.sales$.next(sales)))
      .subscribe();
  }

  private syncWithApi(): Observable<Sale[]> {
    return this.fetchSalesPage(this.defaultPage - 1, this.defaultPageSize).pipe(
      map(res => res.items),
      tap(items => this.sales$.next(items))
    );
  }

  fetchSalesPage(
    pageIndex: number,
    pageSize: number,
    dateRange?: { start: Date | null; end: Date | null }
  ): Observable<PaginatedResponse<Sale>> {
    if (this.apiStatus.isOnlineNow()) {
      return this.fetchSalesPageOnline(pageIndex, pageSize);
    }

    return this.fetchSalesPageOffline(pageIndex, pageSize, dateRange);
  }

  private fetchSalesPageOnline(pageIndex: number, pageSize: number): Observable<PaginatedResponse<Sale>> {
    const page = pageIndex + 1;
    const url = `${this.apiUrl}?page=${page}&pageSize=${pageSize}`;

    return this.http.get<PaginatedResponse<Sale>>(url).pipe(
      map((res) => {
        const mappedItems = (res?.items ?? []).map((api) => this.mapApiSale(api));
        return { ...res, page, pageSize, items: mappedItems };
      }),
      tap((res) => {
        // Cache API items for offline use. Never touch temp (negative id) local sales.
        this.upsertSalesToIndexedDb(res.items.filter(s => s.id > 0)).subscribe();
      })
    );
  }

  private fetchSalesPageOffline(
    pageIndex: number,
    pageSize: number,
    dateRange?: { start: Date | null; end: Date | null }
  ): Observable<PaginatedResponse<Sale>> {
    return this.dbService.getAll<Sale>('sales').pipe(
      map((sales) => {
        let filtered = (sales ?? []).map(s => this.mapApiSale(s));

        // Optional date filter (works offline across all cached sales)
        const start = dateRange?.start ?? null;
        const end = dateRange?.end ?? null;
        if (start && end) {
          const startDate = new Date(start);
          startDate.setHours(0, 0, 0, 0);
          const endDate = new Date(end);
          endDate.setHours(23, 59, 59, 999);

          filtered = filtered.filter(s => {
            const d = new Date(s.order_date);
            return d >= startDate && d <= endDate;
          });
        }

        // Sort by most recent first
        filtered.sort((a, b) => {
          const timeA = new Date(a.order_date).getTime();
          const timeB = new Date(b.order_date).getTime();
          if (timeA !== timeB) return timeB - timeA;
          const keyA = (a.order_id ?? a.id) ?? 0;
          const keyB = (b.order_id ?? b.id) ?? 0;
          return keyB - keyA;
        });

        const totalCount = filtered.length;
        const totalPages = pageSize > 0 ? Math.ceil(totalCount / pageSize) : 0;
        const startIndex = pageIndex * pageSize;
        const pageItems = pageSize > 0 ? filtered.slice(startIndex, startIndex + pageSize) : [];

        return {
          page: pageIndex + 1,
          pageSize,
          totalCount,
          totalPages,
          items: pageItems
        };
      })
    );
  }

  private upsertSalesToIndexedDb(items: Sale[]): Observable<Sale[]> {
    if (!items.length) return of([]);

    return from(items).pipe(
      concatMap((sale) =>
        this.dbService.update<Sale>('sales', sale).pipe(
          catchError(() => this.dbService.add<Sale>('sales', sale)),
          map(() => sale)
        )
      ),
      toArray()
    );
  }

  private mapApiSale(api: Sale): Sale {
    const orderId = (api as any)?.order_id ?? (api as any)?.orderId ?? (api as any)?.id;
    const id = typeof orderId === 'string' ? Number(orderId) : orderId;
    const rawItems = (api as any)?.order_items ?? (api as any)?.orderItems ?? [];

    return {
      id: Number.isFinite(id) ? id : 0,
      order_id: Number.isFinite(id) ? id : undefined,
      customer_id: api.customer_id ?? null,
      customer_name: api.customer_name,
      group: api.group,
      status: this.coerceSaleStatus(api.status),
      discount: api.discount ?? 0,
      is_review: Boolean(api.is_review),
      order_items: (rawItems as SalesItem[]).map((i) => ({
        ...i,
        updated_date: new Date((i as any).updated_date)
      })),
      total_amount: api.total_amount ?? 0,
      order_date: new Date(api.order_date)
    };
  }

  private coerceSaleStatus(status: string): SaleStatus {
    if (status === 'pending' || status === 'completed' || status === 'cancelled') {
      return status;
    }
    return 'pending';
  }

  getSales(): Observable<Sale[]> {
    return this.sales$.asObservable();
  }

  getSaleById(id: number): Observable<Sale | undefined> {
    return from(this.dbService.getByID<Sale>('sales', id)).pipe(
      map((sale) => sale ?? undefined)
    );
  }

  fetchSaleDetail(id: number): Observable<Sale | undefined> {
    // When editing right after save, we may only have order_id stored (id is temporary).
    const localFallback$ = this.findLocalByIdentifier(id);

    if (this.apiStatus.isOnlineNow()) {
      const url = `${this.apiUrl}/${id}`;
      return this.http.get<any>(url).pipe(
        map((api) => this.mapApiSale(api)),
        tap((sale) => {
          if (sale) {
            // Cache the detailed sale locally for offline use.
            this.dbService.update<Sale>('sales', sale).pipe(
              catchError(() => this.dbService.add<Sale>('sales', sale))
            ).subscribe();
          }
        }),
        catchError(() => localFallback$)
      );
    }

    return localFallback$;
  }

  private findLocalByIdentifier(identifier: number): Observable<Sale | undefined> {
    return from(this.dbService.getAll<Sale>('sales')).pipe(
      map((sales) => sales.find((s) => (s.order_id ?? s.id) === identifier))
    );
  }

  findSaleByIdentifier(identifier: number): Observable<Sale | undefined> {
    return from(this.dbService.getAll<Sale>('sales')).pipe(
      map((sales) => sales.find(s => (s.order_id ?? s.id) === identifier))
    );
  }

  saveSaleWithStatus(saleData: Omit<Sale, 'id'>): Observable<{ sale: Sale; savedOnline: boolean }> {
    const tempId = -Date.now();
    const tempSale: Sale = { ...saleData, id: tempId };

    return from(this.dbService.add<Sale>('sales', tempSale)).pipe(
      tap(() => {
        const currentSales = this.sales$.getValue();
        this.sales$.next([...currentSales, tempSale]);
      }),
      switchMap(() => {
        const { order_items, ...rest } = saleData as any;
        const payload = { ...rest, order_items: order_items ?? [], tempId };

        if (!this.apiStatus.isOnlineNow()) {
          this.syncService.addToQueue({
            url: this.apiUrl,
            method: 'POST',
            payload
          });
          return of({ sale: tempSale, savedOnline: false });
        }

        return this.http.post<any>(this.apiUrl, payload).pipe(
          switchMap((response) => {
            const rawOrderId = response?.order_id ?? response?.orderId ?? response?.id;
            const orderId = typeof rawOrderId === 'string' ? Number(rawOrderId) : rawOrderId;

            // If backend returns an id, store it on the temp record.
            if (Number.isFinite(orderId)) {
              const updatedSale: Sale = { ...tempSale, order_id: orderId };
              return from(this.dbService.update<Sale>('sales', updatedSale)).pipe(
                tap(() => {
                  const currentSales = this.sales$.getValue();
                  const index = currentSales.findIndex(s => s.id === tempId);
                  if (index !== -1) {
                    currentSales[index] = updatedSale;
                    this.sales$.next([...currentSales]);
                  }
                }),
                map(() => ({ sale: updatedSale, savedOnline: true }))
              );
            }

            // Request succeeded but id wasn't returned; still treat as online save.
            return of({ sale: tempSale, savedOnline: true });
          }),
          catchError(() => {
            // Treat as offline: queue for later sync.
            this.syncService.addToQueue({
              url: this.apiUrl,
              method: 'POST',
              payload
            });
            return of({ sale: tempSale, savedOnline: false });
          })
        );
      })
    );
  }

  updateSaleWithStatus(sale: Sale): Observable<{ sale: Sale; savedOnline: boolean }> {
    return from(this.dbService.update<Sale>('sales', sale)).pipe(
      tap(() => {
        const currentSales = this.sales$.getValue();
        const index = currentSales.findIndex(s => s.id === sale.id);
        if (index !== -1) {
          currentSales[index] = sale;
          this.sales$.next([...currentSales]);
        }
      }),
      switchMap(() => {
        const identifier = sale.order_id ?? sale.id;
        const url = `${this.apiUrl}/${identifier}`;
        const { order_items, ...rest } = sale as any;
        const payload = { ...rest, order_items: order_items ?? [], tempId: sale.id, order_id: sale.order_id };

        if (!this.apiStatus.isOnlineNow()) {
          this.syncService.addToQueue({ url, method: 'PUT', payload });
          return of({ sale, savedOnline: false });
        }

        return this.http.put(url, payload).pipe(
          map(() => ({ sale, savedOnline: true })),
          catchError(() => {
            this.syncService.addToQueue({ url, method: 'PUT', payload });
            return of({ sale, savedOnline: false });
          })
        );
      })
    );
  }

  updateSaleStatus(sale: Sale, status: SaleStatus): Observable<Sale> {
    const updatedSale: Sale = { ...sale, status };

    return from(this.dbService.update<Sale>('sales', updatedSale)).pipe(
      tap(() => {
        const currentSales = this.sales$.getValue();
        const index = currentSales.findIndex(s => s.id === sale.id);
        if (index !== -1) {
          currentSales[index] = updatedSale;
          this.sales$.next([...currentSales]);
        }
      }),
      switchMap(() => {
        const identifier = updatedSale.order_id ?? updatedSale.id;
        const url = `${this.apiUrl}/${identifier}`;
        const payload = [
          { op: 'replace', path: '/status', value: updatedSale.status }
        ];

        if (!this.apiStatus.isOnlineNow()) {
          this.syncService.addToQueue({ url, method: 'PATCH', payload });
          this.snackBar.open('Status update queued (offline).', 'Close', { duration: 2500 });
          return of(updatedSale);
        }

        return this.http.patch(url, payload, { headers: { 'Content-Type': 'application/json-patch+json' } }).pipe(
          tap(() => this.snackBar.open('Status updated.', 'Close', { duration: 2000 })),
          map(() => updatedSale),
          catchError(() => {
            this.syncService.addToQueue({ url, method: 'PATCH', payload });
            this.snackBar.open('Status update queued after failure.', 'Close', { duration: 2500 });
            return of(updatedSale);
          })
        );
      })
    );
  }

  updateSale(sale: Sale): Observable<Sale> {
    return this.updateSaleWithStatus(sale).pipe(map(res => res.sale));
  }

  deleteSale(sale: Sale): Observable<void> {
    const identifier = sale.order_id ?? sale.id;
    const url = `${this.apiUrl}/${identifier}`;

    const deleteLocal$ = from(this.dbService.delete('sales', sale.id)).pipe(
      tap(() => {
        const currentSales = this.sales$.getValue();
        this.sales$.next(currentSales.filter(s => s.id !== sale.id));
      }),
      map(() => undefined)
    );

    if (!this.apiStatus.isOnlineNow()) {
      this.syncService.addToQueue({ url, method: 'DELETE', payload: { tempId: sale.id, order_id: sale.order_id } });
      this.snackBar.open('Delete queued (offline).', 'Close', { duration: 2500 });
      return deleteLocal$;
    }

    return this.http.delete(url).pipe(
      tap(() => this.snackBar.open('Sale deleted.', 'Close', { duration: 2000 })),
      switchMap(() => deleteLocal$),
      catchError(() => {
        this.syncService.addToQueue({ url, method: 'DELETE', payload: { tempId: sale.id, order_id: sale.order_id } });
        this.snackBar.open('Delete queued after failure.', 'Close', { duration: 2500 });
        return deleteLocal$;
      })
    );
  }

  saveSale(saleData: Omit<Sale, 'id'>): Observable<Sale> {
    return this.saveSaleWithStatus(saleData).pipe(map(res => res.sale));
  }
}