import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, catchError, EMPTY, from, map, Observable, of, switchMap, tap, throwError } from 'rxjs';
import { NgxIndexedDBService } from 'ngx-indexed-db';
import { Supplier } from '../../model/supplier.model';
import { SyncService } from './sync.service';
import { ApiStatusService } from './api-status.service';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupplierService {
  private apiUrl = `${environment.apiUrl}/suppliers`;
  private suppliers$ = new BehaviorSubject<Supplier[]>([]);
  private defaultSuppliers: Supplier[] = [
    { id: 1, name: 'Global Tech Supplies', contactPerson: 'John Smith', phone: '555-1234' },
    { id: 2, name: 'Component Kings', contactPerson: 'Jane Doe', phone: '555-5678' },
    { id: 3, name: 'Innovate Hardware', contactPerson: 'Peter Pan', phone: '555-8765' },
    { id: 4, name: 'General Supplier', contactPerson: '', phone: '' },
  ];

  constructor(
    private http: HttpClient,
    private dbService: NgxIndexedDBService,
    private syncService: SyncService,
    private apiStatus: ApiStatusService
  ) {
    this.loadInitialData();
  }

  private loadInitialData() {
    this.dbService.count('suppliers').pipe(
      switchMap(count => {
        if (count === 0) {
          console.log('No suppliers in DB, adding default suppliers.');
          return this.dbService.bulkAdd<Supplier>('suppliers', this.defaultSuppliers).pipe(
            tap(() => this.suppliers$.next(this.defaultSuppliers))
          );
        } else {
          console.log('Loading suppliers from DB.');
          return this.dbService.getAll<Supplier>('suppliers').pipe(
            tap(suppliers => this.suppliers$.next(suppliers))
          );
        }
      }),
      tap(() => {
        if (this.apiStatus.isOnlineNow()) {
          this.syncWithApi().subscribe();
        }
      }),
      catchError(err => {
        console.error('Error loading initial supplier data', err);
        return EMPTY; // Or handle appropriately
      })
    ).subscribe();
  }

  private syncWithApi(): Observable<Supplier[]> {
    return this.http.get<Supplier[]>(this.apiUrl).pipe(
      switchMap(apiSuppliers => {
        console.log('Syncing with API. Fetched suppliers:', apiSuppliers);
        return this.dbService.clear('suppliers').pipe(
          switchMap(() => this.dbService.bulkAdd<Supplier>('suppliers', apiSuppliers)),
          switchMap(() => this.dbService.getAll<Supplier>('suppliers'))
        );
      }),
      tap(syncedSuppliers => {
        this.suppliers$.next(syncedSuppliers);
        console.log('Sync complete. Suppliers updated in BehaviorSubject.');
      }),
      catchError(err => {
        console.error('API sync failed', err);
        return throwError(() => new Error('Failed to sync suppliers from API.'));
      })
    );
  }

  getSuppliers(): Observable<Supplier[]> {
    return this.suppliers$.asObservable();
  }

  addSupplier(supplierData: Omit<Supplier, 'id'>): Observable<Supplier> {
    const tempId = -Date.now(); // Use a negative temporary ID for offline additions
    const tempSupplier: Supplier = { ...supplierData, id: tempId };

    return from(this.dbService.add<Supplier>('suppliers', tempSupplier)).pipe(
      tap(() => {
        const currentSuppliers = this.suppliers$.getValue();
        this.suppliers$.next([...currentSuppliers, tempSupplier]);
        // this.syncService.addToQueue({
        //   url: this.apiUrl,
        //   method: 'POST',
        //   payload: { ...supplierData, tempId }
        // });
      }),
      map(() => tempSupplier), // Return the temporary supplier
      catchError(err => {
        console.error('Failed to add supplier to IndexedDB', err);
        return throwError(() => new Error('Failed to add supplier locally.'));
      })
    );
  }

  updateSupplier(updatedSupplier: Supplier): Observable<Supplier> {
    // this.syncService.addToQueue({
    //   url: `${this.apiUrl}/${updatedSupplier.id}`,
    //   method: 'PUT',
    //   payload: updatedSupplier
    // });
    return from(this.dbService.update<Supplier>('suppliers', updatedSupplier)).pipe(
      tap(() => {
        const currentSuppliers = this.suppliers$.getValue();
        const index = currentSuppliers.findIndex(s => s.id === updatedSupplier.id);
        if (index !== -1) {
          currentSuppliers[index] = updatedSupplier;
          this.suppliers$.next([...currentSuppliers]);
        }
      }),
      map(() => updatedSupplier),
      catchError(err => {
        console.error('Failed to update supplier in IndexedDB', err);
        return throwError(() => new Error('Failed to update supplier locally.'));
      })
    );
  }

  deleteSupplier(id: number): Observable<void> {
    this.syncService.addToQueue({ url: `${this.apiUrl}/${id}`, method: 'DELETE', payload: null });
    return from(this.dbService.delete('suppliers', id)).pipe(
      tap(() => this.suppliers$.next(this.suppliers$.getValue().filter(s => s.id !== id))),
      map(() => undefined), // Return Observable<void>
      catchError(err => {
        console.error('Failed to delete supplier from IndexedDB', err);
        return throwError(() => new Error('Failed to delete supplier locally.'));
      })
    );
  }
}