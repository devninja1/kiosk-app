import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { from, Observable, of, switchMap, tap, BehaviorSubject, map, catchError, EMPTY, throwError } from 'rxjs';
import { NgxIndexedDBService } from 'ngx-indexed-db';
import { Customer } from '../../model/customer.model';
import { SyncService } from './sync.service';
import { ApiStatusService } from './api-status.service';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class CustomerService {
  private apiUrl = `${environment.apiUrl}/customers`;
  private customers$ = new BehaviorSubject<Customer[]>([]);
  private defaultCustomers: Customer[] = [
    {
      id: 1,
      customerId: 1,
      name: 'avinash saha',
      phone_number: '123-456-7890',
      place: 'kolkata',
      type: 'regular',
      is_active: true,
      display_order: 1,
      date_added: new Date().toISOString(),
    },
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
    this.dbService.count('customers').pipe(
      switchMap(count => {
        if (count === 0) {
          console.log('No customers in DB, adding default customers.');
          return this.dbService.bulkAdd<Customer>('customers', this.defaultCustomers).pipe(
            tap(() => this.customers$.next(this.defaultCustomers))
          );
        } else {
          console.log('Loading customers from DB.');
          return this.dbService.getAll<Customer>('customers').pipe(
            tap(customers => this.customers$.next(customers))
          );
        }
      }),
      tap(() => {
        if (this.apiStatus.isOnlineNow()) {
          this.syncWithApi().subscribe();
        }
      }),
      catchError(err => {
        console.error('Error loading initial customer data', err);
        return EMPTY;
      })
    ).subscribe();
  }

  private syncWithApi(): Observable<Customer[]> {
    return this.http.get<Customer[]>(this.apiUrl).pipe(
      switchMap(apiCustomers => {
        return this.dbService.clear('customers').pipe(
          switchMap(() => this.dbService.bulkAdd<Customer>('customers', apiCustomers)),
          switchMap(() => this.dbService.getAll<Customer>('customers'))
        );
      }),
      tap(syncedCustomers => {
        this.customers$.next(syncedCustomers);
      }),
      catchError(err => {
        console.error('API sync failed for customers', err);
        return throwError(() => new Error('Failed to sync customers from API.'));
      })
    );
  }

  getCustomers(): Observable<Customer[]> {
    return this.customers$.asObservable();
  }

  addCustomer(customerData: Omit<Customer, 'id'>): Observable<Customer> {
    const tempId = -Date.now();
    const tempCustomer: Customer = { ...customerData, id: tempId };

    return from(this.dbService.add<Customer>('customers', tempCustomer)).pipe(
      tap(() => {
        const currentCustomers = this.customers$.getValue();
        this.customers$.next([...currentCustomers, tempCustomer]);
        this.syncService.addToQueue({ url: this.apiUrl, method: 'POST', payload: { ...customerData, tempId } });
      }),
      map(() => tempCustomer),
      catchError(err => {
        console.error('Failed to add customer to IndexedDB', err);
        return throwError(() => new Error('Failed to add customer locally.'));
      })
    );
  }

  updateCustomer(updatedCustomer: Customer): Observable<Customer> {
    const idForApi = updatedCustomer.customerId ?? updatedCustomer.id;
    this.syncService.addToQueue({ url: `${this.apiUrl}/${idForApi}`, method: 'PUT', payload: updatedCustomer });
    return from(this.dbService.update<Customer>('customers', updatedCustomer)).pipe(
      tap(() => this.loadInitialData()), // Refresh list
      switchMap(() => of(updatedCustomer))
    );
  }

  deleteCustomer(id: number): Observable<void> {
    const current = this.customers$.getValue();
    const found = current.find(c => c.id === id || c.customerId === id);
    const apiId = found?.customerId ?? id;
    this.syncService.addToQueue({ url: `${this.apiUrl}/${apiId}`, method: 'DELETE', payload: null });
    return from(this.dbService.delete('customers', id)).pipe(switchMap(() => of(undefined)));
  }
}