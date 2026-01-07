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

  addCustomer(customerData: Omit<Customer, 'id' | 'customerId'> & Partial<Pick<Customer, 'customerId'>>): Observable<Customer> {
    const isOnline = this.apiStatus.isOnlineNow();

    if (isOnline) {
      return this.http.post<Customer>(this.apiUrl, customerData).pipe(
        switchMap((apiCustomer) => {
          const customer: Customer = {
            ...customerData,
            ...apiCustomer,
            id: apiCustomer?.id ?? apiCustomer?.customerId ?? -Date.now(),
            customerId: apiCustomer?.customerId ?? apiCustomer?.id ?? apiCustomer?.customerId ?? -Date.now(),
          } as Customer;

          return this.upsertLocalCustomer(customer);
        }),
        catchError(err => {
          console.error('Failed to add customer via API', err);
          return throwError(() => new Error('Failed to add customer online.'));
        })
      );
    }

    const tempId = -Date.now();
    const tempCustomer: Customer = { ...customerData, id: tempId, customerId: customerData.customerId ?? tempId } as Customer;

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
    const idForApi = updatedCustomer.id;
    const isOnline = this.apiStatus.isOnlineNow();

    if (isOnline) {
      return this.http.put<Customer>(`${this.apiUrl}/${idForApi}`, updatedCustomer).pipe(
        switchMap((apiCustomer) => {
          const customer: Customer = {
            ...updatedCustomer,
            ...apiCustomer,
            id: apiCustomer?.id ?? updatedCustomer.id,
            customerId: apiCustomer?.customerId ?? apiCustomer?.id ?? updatedCustomer.customerId ?? updatedCustomer.id,
          } as Customer;

          return this.upsertLocalCustomer(customer);
        }),
        catchError(err => {
          console.error('Failed to update customer via API', err);
          return throwError(() => new Error('Failed to update customer online.'));
        })
      );
    }

    this.syncService.addToQueue({ url: `${this.apiUrl}/${idForApi}`, method: 'PUT', payload: updatedCustomer });
    return from(this.dbService.update<Customer>('customers', updatedCustomer)).pipe(
      tap(() => {
        const currentCustomers = this.customers$.getValue();
        const idx = currentCustomers.findIndex(c => c.id === updatedCustomer.id);
        if (idx >= 0) {
          currentCustomers[idx] = updatedCustomer;
          this.customers$.next([...currentCustomers]);
        }
      }),
      switchMap(() => of(updatedCustomer))
    );
  }

  deleteCustomer(customer: Customer): Observable<void> {
    const apiId = customer.id;
    const localId = customer.id ?? apiId;

    const deleteLocal$ = from(this.dbService.delete('customers', localId)).pipe(
      tap(() => {
        const updated = this.customers$.getValue().filter(c => c.id !== localId && c.customerId !== apiId);
        this.customers$.next(updated);
      }),
      map(() => undefined)
    );

    if (!apiId) {
      // No API id available; remove only from IndexedDB and memory.
      return deleteLocal$;
    }

    return this.http.delete<void>(`${this.apiUrl}/${apiId}`).pipe(
      switchMap(() => deleteLocal$),
      catchError(err => {
        console.error('Failed to delete customer via API', err);
        return throwError(() => new Error('Failed to delete customer online.'));
      })
    );
  }

  private upsertLocalCustomer(customer: Customer): Observable<Customer> {
    return from(this.dbService.getByID<Customer>('customers', customer.id)).pipe(
      switchMap((existing) => {
        const op$ = existing
          ? this.dbService.update<Customer>('customers', customer)
          : this.dbService.add<Customer>('customers', customer);

        return from(op$).pipe(
          tap(() => {
            const current = this.customers$.getValue();
            const idx = current.findIndex(c => c.id === customer.id || c.customerId === customer.customerId);
            if (idx >= 0) {
              current[idx] = customer;
              this.customers$.next([...current]);
            } else {
              this.customers$.next([...current, customer]);
            }
          }),
          map(() => customer)
        );
      })
    );
  }
}