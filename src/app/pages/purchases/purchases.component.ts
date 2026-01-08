import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BehaviorSubject, catchError, EMPTY, merge, Observable, Subject, switchMap, takeUntil, tap } from 'rxjs';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { extractApiErrorMessage } from 'app/core/utils/error-utils';
import { MatButtonModule, MatButton } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';

import { Product } from '../../model/product.model';
import { Supplier } from '../../model/supplier.model';
import { PurchaseItem } from '../../model/purchase.model';
import { PurchaseService } from '../../core/services/purchase.service';
import { ProductService } from '../../core/services/product.service';
import { SupplierService } from '../../core/services/supplier.service';
import { PurchaseEntryComponent } from './entry/purchase-entry.component';
import { PurchaseListComponent } from './list/purchase-list.component';
@Component({
  selector: 'app-purchases',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule, // Added for dialog forms, though not directly used in PurchasesComponent itself
    FormsModule,
    MatSnackBarModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    PurchaseEntryComponent,
    PurchaseListComponent,
  ],
  templateUrl: './purchases.component.html',
  styleUrl: './purchases.component.scss',
})
export class PurchasesComponent implements OnInit, OnDestroy {
  products$: Observable<Product[]>;
  suppliers$: Observable<Supplier[]>;

  // State Management with Subjects
  private purchaseListSubject = new BehaviorSubject<PurchaseItem[]>([]);
  purchaseList$ = this.purchaseListSubject.asObservable();

  private addedProductNamesSubject = new BehaviorSubject<Set<string>>(new Set());
  addedProductNames$ = this.addedProductNamesSubject.asObservable();

  selectedSupplierId: number | null = null;

  // Action Streams
  private saveAction$ = new Subject<void>();

  private destroy$ = new Subject<void>();
  
  constructor(
    private productService: ProductService,
    private supplierService: SupplierService,
    private purchaseService: PurchaseService,
    private snackBar: MatSnackBar
  ) {
    this.products$ = this.productService.getProducts();
    this.suppliers$ = this.supplierService.getSuppliers();
  }

  ngOnInit(): void {
    this.handleSaveAction();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private handleSaveAction(): void {
    this.saveAction$.pipe(
      switchMap(() => {
        const purchaseList = this.purchaseListSubject.getValue();
        if (purchaseList.length === 0) {
          this.snackBar.open('No items to save in purchase!', 'Close', { duration: 3000 });
          return EMPTY;
        }
        const grandTotal = purchaseList.reduce((acc, item) => acc + item.total, 0);
        return this.purchaseService.savePurchase({
          items: purchaseList,
          grandTotal: grandTotal,
          supplierId: this.selectedSupplierId,
          date: new Date(),
        });
      }),
      tap(() => {
        this.snackBar.open('Purchase saved successfully!', 'Close', { duration: 3000 });
        this.resetPurchase();
      }),
      catchError(err => {
        const msg = extractApiErrorMessage(err) || 'Failed to save purchase.';
        this.snackBar.open(msg, 'Close', { duration: 4000 });
        console.error(err);
        return EMPTY;
      }),
      takeUntil(this.destroy$)
    ).subscribe();
  }

  onItemAdded(newItem: PurchaseItem) {
    this.productService.updateStock(newItem.product.id, newItem.quantity).pipe(
      takeUntil(this.destroy$),
      catchError(err => {
        const msg = extractApiErrorMessage(err) || 'Failed to update stock for new item.';
        this.snackBar.open(msg, 'Close', { duration: 3000 });
        return EMPTY;
      })
    ).subscribe(() => {
      const currentList = this.purchaseListSubject.getValue();
      this.purchaseListSubject.next([...currentList, newItem]);

      const currentNames = this.addedProductNamesSubject.getValue();
      currentNames.add(newItem.product.name);
      this.addedProductNamesSubject.next(currentNames);
    });
  }

  onItemDeleted(index: number) {
    const currentList = this.purchaseListSubject.getValue();
    const deletedItem = currentList[index];
    if (deletedItem) {
      this.productService.updateStock(deletedItem.product.id, -deletedItem.quantity).pipe(
        takeUntil(this.destroy$),
        catchError(err => {
          const msg = extractApiErrorMessage(err) || 'Failed to update stock for deleted item.';
          this.snackBar.open(msg, 'Close', { duration: 3000 });
          return EMPTY;
        })
      ).subscribe(() => {
        const updatedList = currentList.filter((_, i) => i !== index);
        this.purchaseListSubject.next(updatedList);

        const currentNames = this.addedProductNamesSubject.getValue();
        currentNames.delete(deletedItem.product.name);
        this.addedProductNamesSubject.next(currentNames);
      });
    }
  }

  savePurchase() {
    this.saveAction$.next();
  }
  private resetPurchase(): void {
    this.purchaseListSubject.next([]);
    this.addedProductNamesSubject.next(new Set());
    this.selectedSupplierId = null;
  }
}
