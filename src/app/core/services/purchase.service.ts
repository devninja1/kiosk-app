import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, from, Observable, of, switchMap, map, tap, forkJoin } from 'rxjs';
import { NgxIndexedDBService } from 'ngx-indexed-db';
import { Purchase } from '../../model/purchase.model';
import { SyncService } from './sync.service';
import { ProductService } from './product.service';
import { ApiStatusService } from './api-status.service';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PurchaseService {
  private apiUrl = `${environment.apiUrl}/purchases`;
  private purchases$ = new BehaviorSubject<Purchase[]>([]);

  constructor(
    private http: HttpClient,
    private dbService: NgxIndexedDBService,
    private syncService: SyncService,
    private productService: ProductService, // Inject ProductService
    private apiStatus: ApiStatusService
  ) {
    this.loadInitialData();
  }

  private loadInitialData(): void {
    this.dbService.getAll<Purchase>('purchases').pipe(
      tap(purchases => this.purchases$.next(purchases)),
      switchMap(() => (this.apiStatus.isOnlineNow() ? this.syncWithApi() : of(null)))
    ).subscribe();
  }

  private syncWithApi(): Observable<Purchase[]> {
    return this.http.get<Purchase[]>(this.apiUrl).pipe(
      switchMap(purchases => this.dbService.clear('purchases').pipe(
        switchMap(() => this.dbService.bulkAdd('purchases', purchases)),
        switchMap(() => this.dbService.getAll<Purchase>('purchases'))
      )),
      tap(purchases => this.purchases$.next(purchases))
    );
  }

  getPurchases(): Observable<Purchase[]> {
    return this.purchases$.asObservable();
  }

  savePurchase(purchaseData: Omit<Purchase, 'id'>): Observable<Purchase> {
    const tempId = -Date.now();
    const purchaseToSave: Purchase = {
      ...purchaseData,
      id: tempId,
    };

    // Create an array of stock update observables
    const stockUpdateObservables = purchaseData.items.map(item =>
      this.productService.updateStock(item.product.id, item.quantity) // Increase stock
    );

    return from(this.dbService.add<Purchase>('purchases', purchaseToSave)).pipe(
      tap(() => {
        const currentPurchases = this.purchases$.getValue();
        this.purchases$.next([...currentPurchases, purchaseToSave]);
        // this.syncService.addToQueue({
        //   url: this.apiUrl, method: 'POST', payload: { ...purchaseData, tempId }
        // });
      }),
      // Execute all stock updates
      switchMap(() => forkJoin(stockUpdateObservables).pipe(map(() => purchaseToSave)))
    );
  }
}