import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { from, Observable, of, tap, BehaviorSubject, switchMap, forkJoin, map, catchError } from 'rxjs';
import { NgxIndexedDBService } from 'ngx-indexed-db';
import { Sale, SaleStatus } from '../../model/sale.model';
import { SyncService } from './sync.service';
import { ProductService } from './product.service';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SalesService {
  private apiUrl = `${environment.apiUrl}/SalesOrder`;
  private isOnline = navigator.onLine;
  private sales$ = new BehaviorSubject<Sale[]>([]);

  constructor(
    private http: HttpClient,
    private dbService: NgxIndexedDBService,
    private syncService: SyncService,
    private productService: ProductService // Inject ProductService
  ) {
    window.addEventListener('online', () => this.isOnline = true);
    window.addEventListener('offline', () => this.isOnline = false);
    this.loadInitialData();
  }

  private loadInitialData(): void {
    this.dbService.getAll<Sale>('sales').pipe(
      tap(sales => this.sales$.next(sales)),
      switchMap(() => {
        if (this.isOnline) {
          return this.syncWithApi();
        }
        return of(null);
      })
    ).subscribe();
  }

  private syncWithApi(): Observable<Sale[]> {
    return this.http.get<Sale[]>(this.apiUrl).pipe(
      switchMap(sales => this.dbService.clear('sales').pipe(
        switchMap(() => this.dbService.bulkAdd<Sale>('sales', sales)),
        switchMap(() => this.dbService.getAll<Sale>('sales'))
      )),
      tap(sales => this.sales$.next(sales))
    );
  }

  getSales(): Observable<Sale[]> {
    return this.sales$.asObservable();
  }

  getSaleById(id: number): Observable<Sale | undefined> {
    return from(this.dbService.getByID<Sale>('sales', id)).pipe(
      map((sale) => sale ?? undefined)
    );
  }

  findSaleByIdentifier(identifier: number): Observable<Sale | undefined> {
    return from(this.dbService.getAll<Sale>('sales')).pipe(
      map((sales) => sales.find(s => (s.order_id ?? s.id) === identifier))
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
        const payload = { status: updatedSale.status, tempId: updatedSale.id, order_id: updatedSale.order_id };

        if (!this.isOnline) {
          this.syncService.addToQueue({ url, method: 'PATCH', payload });
          return of(updatedSale);
        }

        return this.http.patch(url, payload).pipe(
          map(() => updatedSale),
          catchError(() => {
            this.syncService.addToQueue({ url, method: 'PATCH', payload });
            return of(updatedSale);
          })
        );
      })
    );
  }

  updateSale(sale: Sale): Observable<Sale> {
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
        const payload = { ...sale, tempId: sale.id, order_id: sale.order_id };

        if (!this.isOnline) {
          this.syncService.addToQueue({ url, method: 'PUT', payload });
          return of(sale);
        }

        return this.http.put(url, payload).pipe(
          map(() => sale),
          catchError(() => {
            this.syncService.addToQueue({ url, method: 'PUT', payload });
            return of(sale);
          })
        );
      })
    );
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

    if (!this.isOnline) {
      this.syncService.addToQueue({ url, method: 'DELETE', payload: { tempId: sale.id, order_id: sale.order_id } });
      return deleteLocal$;
    }

    return this.http.delete(url).pipe(
      switchMap(() => deleteLocal$),
      catchError(() => {
        this.syncService.addToQueue({ url, method: 'DELETE', payload: { tempId: sale.id, order_id: sale.order_id } });
        return deleteLocal$;
      })
    );
  }

  saveSale(saleData: Omit<Sale, 'id'>): Observable<Sale> {
    const tempId = -Date.now();
    const tempSale: Sale = { ...saleData, id: tempId };

    // Stock is updated optimistically in the Sales UI while building the order.
    // Avoid double-decrementing stock here.

    return from(this.dbService.add<Sale>('sales', tempSale)).pipe(
      tap(() => {
        const currentSales = this.sales$.getValue();
        this.sales$.next([...currentSales, tempSale]);
      }),
      switchMap(() => {
        // If online, try to save immediately and write back the order_id.
        // If offline (or API errors), queue for later sync.
        if (!this.isOnline) {
          this.syncService.addToQueue({
            url: this.apiUrl,
            method: 'POST',
            payload: { ...saleData, tempId }
          });
          return of(tempSale);
        }

        return this.http.post<any>(this.apiUrl, { ...saleData, tempId }).pipe(
          switchMap((response) => {
            const rawOrderId = response?.order_id ?? response?.orderId ?? response?.id;
            const orderId = typeof rawOrderId === 'string' ? Number(rawOrderId) : rawOrderId;

            if (!Number.isFinite(orderId)) {
              return of(tempSale);
            }

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
              map(() => updatedSale)
            );
          }),
          catchError(() => {
            this.syncService.addToQueue({
              url: this.apiUrl,
              method: 'POST',
              payload: { ...saleData, tempId }
            });
            return of(tempSale);
          })
        );
      }),
      map((sale) => sale)
    );
  }
}