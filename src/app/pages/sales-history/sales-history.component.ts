import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
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
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { map, startWith } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { UploadDialogComponent } from '../../shared/components/upload-dialog/upload-dialog.component';
import { UploadRequestType } from '../../core/services/upload.service';
import { environment } from '../../../environments/environment';

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
    MatAutocompleteModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatPaginatorModule,
    MatDialogModule,
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
  pageSize = environment.defaultPageSize;
  pageIndex = 0;
  isLoading = false;
  readonly currencyCode = environment.currencyCode;
  filteredTotal = 0;

  statusOptions: SaleStatus[] = ['pending', 'completed', 'cancelled'];

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  readonly pageSizeOptions = environment.pageSizeOptions;

  range = new FormGroup({
    start: new FormControl<Date | null>(null),
    end: new FormControl<Date | null>(null),
  });

  orderDate = new FormControl<Date | null>(null);
  customerName = new FormControl<string>('');
  customerNameOptions: string[] = [];
  filteredCustomerNames$!: Observable<string[]>;

  constructor(
    private salesService: SalesService,
    private receiptService: ReceiptService,
    private router: Router,
    private route: ActivatedRoute,
    private dialog: MatDialog
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
      const orderDateParam = params.get('orderDate');
      const customerNameParam = params.get('customerName');
      if (start && end) {
        this.range.setValue({
          start: new Date(start),
          end: new Date(end)
        }, { emitEvent: false });
        this.applyDateFilter();
      }

      if (orderDateParam) {
        this.orderDate.setValue(new Date(orderDateParam), { emitEvent: false });
      }

      if (customerNameParam) {
        this.customerName.setValue(customerNameParam, { emitEvent: false });
      }
      this.loadPage(0, this.pageSize);
    });

    this.range.valueChanges.subscribe(val => {
      this.applyDateFilter();
      this.updateUrlQueryParams();
      // When date range changes, restart paging from the beginning.
      this.loadPage(0, this.pageSize);
    });

    this.orderDate.valueChanges.subscribe(() => {
      this.updateUrlQueryParams();
      this.loadPage(0, this.pageSize);
    });

    this.customerName.valueChanges.subscribe(() => {
      this.updateUrlQueryParams();
      this.loadPage(0, this.pageSize);
    });

    this.filteredCustomerNames$ = this.customerName.valueChanges.pipe(
      startWith(''),
      map(val => this.filterCustomerNames(val ?? ''))
    );
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
    this.updateFilteredTotal();
  }

  private loadPage(pageIndex: number, pageSize: number): void {
    this.isLoading = true;
    this.expandedElement = null;

    const { start, end } = this.range.value;
    const range = { start: start ?? null, end: end ?? null };
    this.salesService.fetchSalesPage(pageIndex, pageSize, range, {
      orderDate: this.orderDate.value,
      customerName: this.customerName.value ?? null
    }).subscribe({
      next: (res) => {
        this.pageIndex = pageIndex;
        this.pageSize = pageSize;
        this.totalCount = res.totalCount ?? (res.items?.length ?? 0);
        this.dataSource.data = res.items ?? [];
        this.updateCustomerNameOptions(res.items ?? []);
        // Keep existing filter behavior (online filter applies to the current page only).
        this.applyDateFilter();
        this.updateFilteredTotal();
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
        orderDate: this.orderDate.value ? this.orderDate.value.toISOString().split('T')[0] : null,
        customerName: this.customerName.value || null,
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

  openUploadDialog(): void {
    const dialogRef = this.dialog.open(UploadDialogComponent, {
      width: '535px',
      data: {
        requestType: UploadRequestType.SalesExcel,
        title: 'Import Sales',
        helperText: 'Upload a sales Excel file (.xls, .xlsx) up to 5 MB.'
      }
    });

    dialogRef.afterClosed().subscribe(res => {
      if (res?.uploaded) {
        this.loadPage(this.pageIndex, this.pageSize);
      }
    });
  }

  deleteOrder(sale: Sale): void {
    const proceed = window.confirm('Are you sure you want to delete this sale?');
    if (!proceed) return;

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

  private updateCustomerNameOptions(items: Sale[]): void {
    const names = Array.from(new Set(items.map(i => i.customer_name ?? '').filter(Boolean)));
    this.customerNameOptions = names.sort((a, b) => a.localeCompare(b));
  }

  private filterCustomerNames(value: string): string[] {
    const search = value.toLowerCase();
    return this.customerNameOptions.filter(name => name.toLowerCase().includes(search));
  }

  get hasFilterApplied(): boolean {
    const { start, end } = this.range.value;
    const rangeApplied = Boolean(start && end);
    const orderDateApplied = Boolean(this.orderDate.value);
    const customerApplied = Boolean(this.customerName.value && this.customerName.value.trim());
    return rangeApplied || orderDateApplied || customerApplied;
  }

  private updateFilteredTotal(): void {
    const rows = this.dataSource.filteredData?.length ? this.dataSource.filteredData : this.dataSource.data;
    this.filteredTotal = (rows ?? []).reduce((acc, sale) => acc + (sale?.total_amount ?? 0), 0);
  }
}