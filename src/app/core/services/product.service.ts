import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { from, Observable, of, switchMap, tap, map, BehaviorSubject, concatMap } from 'rxjs';
import { NgxIndexedDBService, WithID } from 'ngx-indexed-db';
import { Product } from '../../model/product.model';
import { SyncService } from './sync.service';
import { ApiStatusService } from './api-status.service';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private apiUrl = `${environment.apiUrl}/product`;
  private products$ = new BehaviorSubject<Product[]>([]);
  private readonly productCodePrefix = 'PR';
  private defaultProducts: Product[] = [
    // { id: 1, product_code: 1001, name: 'Slice', category: 'Bread', description: 'A slice of bread', unit_price: 27, cost_price: 26, stock: 10, is_Stock_enable: true, is_active: true },
    // { id: 2, product_code: 1002, name: 'HB', category: 'Bread', description: ' hybride quater', unit_price: 86, cost_price: 80, stock: 50, is_Stock_enable: true, is_active: true },
    // { id: 3, product_code: 1003, name: 'Half', category: 'Bread', description: 'Half loaf of bread', unit_price: 27, cost_price: 26, stock: 25, is_Stock_enable: true, is_active: false },
    // { id: 4, product_code: 1004, name: 'Rolla', category: 'Bread', description: 'rolla bread', unit_price: 27, cost_price: 26, stock: 15, is_Stock_enable: true, is_active: true },
    // { id: 5, product_code: 1005, name: 'CD', category: 'Bread', description: 'CD bread', unit_price: 80, cost_price: 78, stock: 30, is_Stock_enable: true, is_active: true },
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
    this.dbService.count('products').subscribe(count => {
      if (count === 0) {
        //// DB is empty, populate with default data first.
        this.dbService.bulkAdd<Product>('products', this.defaultProducts).subscribe(() => {
          this.products$.next(this.defaultProducts);
          if (this.apiStatus.isOnlineNow()) this.syncWithApi();
        });
      } else {
      ////DB has data, load it and then sync if online.
      this.dbService.getAll<Product>('products').subscribe(prods => {
        console.log('Loaded products from IndexedDB:', prods);
        this.products$.next(prods);
        if (this.apiStatus.isOnlineNow()) this.syncWithApi();
      });
      }
    });
  }

  private syncWithApi() {
    this.http.get<Product[]>(this.apiUrl).subscribe((products: Product[]) => {
      // Only clear the local DB after successfully fetching from the API
      if (products) {
        this.dbService.clear('products').subscribe(() => {
          this.dbService.bulkAdd<Product>('products', products).subscribe(() => {
            this.dbService.getAll<Product>('products').subscribe(prods => this.products$.next(prods));
          });
        });
      }
    });
  }

  getProducts(): Observable<Product[]> {
    return this.products$.asObservable();
  }

  private getNextProductCode(products: Product[]): string {
    // Only consider existing codes already in PR### format.
    const maxNumeric = products.reduce((max, product) => {
      const code = (product as unknown as { product_code?: unknown }).product_code;
      if (typeof code !== 'string') return max;
      const match = code.match(new RegExp(`^${this.productCodePrefix}(\\d+)$`, 'i'));
      if (!match) return max;
      const numeric = Number.parseInt(match[1], 10);
      return Number.isFinite(numeric) ? Math.max(max, numeric) : max;
    }, 0);

    const next = maxNumeric + 1;
    return `${this.productCodePrefix}${String(next).padStart(2, '0')}`;
  }

  addProduct(productData: Omit<Product, 'id' | 'product_code'>): Observable<Product> {
    return from(this.dbService.getAll<Product>('products')).pipe(
      switchMap((products) => {
        const nextProductCode = this.getNextProductCode(products);
        const tempId = -Date.now();
        const tempProduct: Product = {
          ...productData,
          id: tempId,
          product_code: nextProductCode,
          name: productData.name,
          category: productData.category,
          description: productData.description,
          unit_price: productData.unit_price,
          cost_price: productData.cost_price,
          stock: productData.stock,
          is_Stock_enable: productData.is_Stock_enable,
          is_active: productData.is_active,
          group: productData.group
        };
        return from(this.dbService.add<Product>('products', tempProduct)).pipe(
          tap(() => {
            const currentProducts = this.products$.getValue();
            this.products$.next([...currentProducts, tempProduct]);
            this.syncService.addToQueue({ url: this.apiUrl, method: 'POST', payload: { ...productData, tempId, product_code: nextProductCode } });
          }),
          map(() => tempProduct)
        );
      })
    );
  }

  updateProduct(updatedProduct: Product): Observable<Product> {
    this.syncService.addToQueue({ url: `${this.apiUrl}/${updatedProduct.id}`, method: 'PUT', payload: updatedProduct });
    return from(this.dbService.update<Product>('products', updatedProduct)).pipe(tap(() => {
      // Optimistically update the local BehaviorSubject
      const currentProducts = this.products$.getValue();
      const index = currentProducts.findIndex(p => p.id === updatedProduct.id);
      if (index !== -1) {
        currentProducts[index] = updatedProduct;
        this.products$.next([...currentProducts]);
      }
    }), switchMap(() => of(updatedProduct)));
  }

  deleteProduct(id: number): Observable<void> {
    this.syncService.addToQueue({ url: `${this.apiUrl}/${id}`, method: 'DELETE', payload: null });
    return from(this.dbService.delete('products', id)).pipe(tap(() => {
      const currentProducts = this.products$.getValue();
      const updatedProducts = currentProducts.filter(p => p.id !== id);
      this.products$.next(updatedProducts);
    }),
      map(() => undefined)
    );
  }

  updateStock(productId: number, quantityChange: number): Observable<Product | undefined> {
    return from(this.dbService.getByID<Product>('products', productId)).pipe(
      concatMap((product) => {
        if (product) {
          if (!product.is_Stock_enable) {
            return of(product);
          }

          const updatedProduct = { ...product, stock: product.stock + quantityChange };
          this.syncService.addToQueue({
            url: `${this.apiUrl}/${productId}/stock`, method: 'PATCH', payload: { change: quantityChange }
          });
          return from(this.dbService.update<Product>('products', updatedProduct)).pipe(map(() => updatedProduct));
        }
        return of(undefined);
      }),
      tap((updatedProduct) => {
        if (updatedProduct && updatedProduct.is_Stock_enable) {
          const currentProducts = this.products$.getValue();
          const index = currentProducts.findIndex(p => p.id === updatedProduct.id);
          if (index !== -1) {
            currentProducts[index] = updatedProduct;
            this.products$.next([...currentProducts]);
          }
        }
      })
    );
  }
}
