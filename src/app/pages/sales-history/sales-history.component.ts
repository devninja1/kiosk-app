import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatPaginator, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { Sale } from '../../model/sale.model';
import { SaleStatus } from '../../model/sale.model';
import { SalesItem } from '../../model/sales.model';
import { SalesService } from '../../core/services/sales.service';
import { ReceiptService } from '../../core/services/receipt.service';
import { MatNativeDateModule } from '@angular/material/core';
import { MatInputModule } from '@angular/material/input';
import { animate, state, style, transition, trigger } from '@angular/animations';

@Component({
  selector: 'app-sales-history',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatIconModule,
    MatButtonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatPaginatorModule,
  ],
  templateUrl: './sales-history.component.html',
  styleUrl: './sales-history.component.scss',
  animations: [
    trigger('detailExpand', [
      state('collapsed', style({ height: '0px', minHeight: '0', visibility: 'hidden' })),
      state('expanded', style({ height: '*', visibility: 'visible' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ],
})
export class SalesHistoryComponent implements OnInit {
  dataSource: MatTableDataSource<Sale>;
  columnsToDisplay = ['expand', 'id', 'customer', 'order_date', 'total_amount', 'status', 'actions'];
  expandedElement: Sale | null = null;
  totalCount = 0;
  pageSize = 10;
  pageIndex = 0;
  isLoading = false;

  statusOptions: SaleStatus[] = ['pending', 'completed', 'cancelled'];

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  range = new FormGroup({
    start: new FormControl<Date | null>(null),
    end: new FormControl<Date | null>(null),
  });

  constructor(
    private salesService: SalesService,
    private receiptService: ReceiptService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.dataSource = new MatTableDataSource<Sale>([]);
  }

  ngOnInit(): void {
    this.dataSource.filterPredicate = (data: Sale, filter: string) => {
      if (!filter) return true;
      const { start, end } = JSON.parse(filter);
      if (!start || !end) return true;

      const saleDate = new Date(data.order_date);
      // Set time to 0 to compare dates only
      saleDate.setHours(0, 0, 0, 0);
      const startDate = new Date(start);
      const endDate = new Date(end);

      return saleDate >= startDate && saleDate <= endDate;
    };

    // Read initial query params (date range) and load first page.
    this.route.queryParamMap.subscribe(params => {
      const start = params.get('start');
      const end = params.get('end');
      if (start && end) {
        this.range.setValue({
          start: new Date(start),
          end: new Date(end)
        }, { emitEvent: false });
        this.applyDateFilter();
      }
      this.loadPage(0, this.pageSize);
    });

    this.range.valueChanges.subscribe(val => {
      this.applyDateFilter();
      this.updateUrlQueryParams();
      // When date range changes, restart paging from the beginning.
      this.loadPage(0, this.pageSize);
    });
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadPage(this.pageIndex, this.pageSize);
  }

  clearDateFilter(): void {
    this.range.reset();
    // The valueChanges subscription will handle filtering and URL update
  }

  private applyDateFilter(): void {
    const { start, end } = this.range.value;
    this.dataSource.filter = (start && end) ? JSON.stringify({ start, end }) : '';
  }

  private loadPage(pageIndex: number, pageSize: number): void {
    this.isLoading = true;
    this.expandedElement = null;

    const { start, end } = this.range.value;
    const range = { start: start ?? null, end: end ?? null };
    this.salesService.fetchSalesPage(pageIndex, pageSize, range).subscribe({
      next: (res) => {
        this.pageIndex = pageIndex;
        this.pageSize = pageSize;
        this.totalCount = res.totalCount ?? (res.items?.length ?? 0);
        this.dataSource.data = res.items ?? [];
        // Keep existing filter behavior (online filter applies to the current page only).
        this.applyDateFilter();
      },
      error: () => {
        this.dataSource.data = [];
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }

  private updateUrlQueryParams(): void {
    const { start, end } = this.range.value;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        start: start ? start.toISOString().split('T')[0] : null,
        end: end ? end.toISOString().split('T')[0] : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  printReceipt(sale: Sale): void {
    this.receiptService.printSaleReceipt(sale);
  }

  onStatusChanged(sale: Sale, status: SaleStatus): void {
    if (!sale || !status || sale.status === status) return;
    this.salesService.updateSaleStatus(sale, status).subscribe(updated => {
      sale.status = updated.status;
    });
  }

  editOrder(sale: Sale): void {
    const identifier = sale.order_id ?? sale.id;
    this.router.navigate(['/sales'], { queryParams: { editOrderId: identifier } });
  }

  deleteOrder(sale: Sale): void {
    this.salesService.deleteSale(sale).subscribe(() => {
      this.loadPage(this.pageIndex, this.pageSize);
    });
  }

  toggleExpanded(element: Sale, event?: Event): void {
    event?.stopPropagation();
    this.expandedElement = this.expandedElement === element ? null : element;
  }

  trackByProduct(index: number, item: SalesItem): number {
    return item.id;
  }
}