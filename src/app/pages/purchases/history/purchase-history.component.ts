import { AfterViewInit, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { combineLatest, map, Subject, takeUntil } from 'rxjs';

import { Purchase } from '../../../model/purchase.model';
import { Supplier } from '../../../model/supplier.model';
import { PurchaseService } from '../../../core/services/purchase.service';
import { SupplierService } from '../../../core/services/supplier.service';
import { environment } from '../../../../environments/environment';

export interface PurchaseHistoryView extends Purchase {
  supplierName: string;
}

@Component({
  selector: 'app-purchase-history',
  standalone: true,
  imports: [
    CommonModule,
    CurrencyPipe,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './purchase-history.component.html',
  styleUrls: ['./purchase-history.component.scss'],
  animations: [
    trigger('detailExpand', [
      state('collapsed', style({ height: '0px', minHeight: '0' })),
      state('expanded', style({ height: '*' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ],
})
export class PurchaseHistoryComponent implements OnInit, AfterViewInit, OnDestroy {
  displayedColumns: string[] = ['date', 'supplierName', 'grandTotal'];
  dataSource: MatTableDataSource<PurchaseHistoryView>;
  expandedElement: PurchaseHistoryView | null = null;
  readonly currencyCode = environment.currencyCode;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  private destroy$ = new Subject<void>();

  constructor(
    private purchaseService: PurchaseService,
    private supplierService: SupplierService
  ) {
    this.dataSource = new MatTableDataSource<PurchaseHistoryView>([]);
  }

  ngOnInit(): void {
    combineLatest([
      this.purchaseService.getPurchases(),
      this.supplierService.getSuppliers()
    ]).pipe(
      map(([purchases, suppliers]) => {
        const supplierMap = new Map<number, string>(suppliers.map(s => [s.id, s.name]));
        return purchases.map(p => ({
          ...p,
          supplierName: p.supplierId ? supplierMap.get(p.supplierId) ?? 'N/A' : 'N/A'
        }));
      }),
      takeUntil(this.destroy$)
    ).subscribe(purchaseHistory => {
      this.dataSource.data = purchaseHistory;
    });
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }
}