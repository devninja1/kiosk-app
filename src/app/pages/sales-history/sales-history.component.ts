import { AfterViewInit, Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
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
export class SalesHistoryComponent implements OnInit, AfterViewInit {
  dataSource: MatTableDataSource<Sale>;
  columnsToDisplay = ['expand', 'id', 'customer', 'order_date', 'total_amount', 'status', 'actions'];
  expandedElement: Sale | null = null;
  private originalData: Sale[] = [];

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

    this.salesService.getSales().subscribe(sales => {
      // Sort sales by most recent first
      const sorted = [...sales].sort((a, b) => {
        const timeA = new Date(a.order_date).getTime();
        const timeB = new Date(b.order_date).getTime();
        if (timeA !== timeB) return timeB - timeA;

        const keyA = (a.order_id ?? a.id) ?? 0;
        const keyB = (b.order_id ?? b.id) ?? 0;
        return keyB - keyA;
      });

      this.originalData = sorted;
      this.dataSource.data = sorted;

      // Check for initial query params after data is loaded
      this.route.queryParamMap.subscribe(params => {
        const start = params.get('start');
        const end = params.get('end');
        if (start && end) {
          this.range.setValue({
            start: new Date(start),
            end: new Date(end)
          }, { emitEvent: false }); // Prevent valueChanges from firing again
          this.applyDateFilter();
        }
      });
    });

    this.range.valueChanges.subscribe(val => {
      this.applyDateFilter();
      this.updateUrlQueryParams();
    });
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
  }

  clearDateFilter(): void {
    this.range.reset();
    // The valueChanges subscription will handle filtering and URL update
  }

  private applyDateFilter(): void {
    const { start, end } = this.range.value;
    this.dataSource.filter = (start && end) ? JSON.stringify({ start, end }) : '';
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
    this.salesService.updateSaleStatus(sale, status).subscribe();
  }

  editOrder(sale: Sale): void {
    const identifier = sale.order_id ?? sale.id;
    this.router.navigate(['/sales'], { queryParams: { editOrderId: identifier } });
  }

  deleteOrder(sale: Sale): void {
    this.salesService.deleteSale(sale).subscribe();
  }

  toggleExpanded(element: Sale, event?: Event): void {
    event?.stopPropagation();
    this.expandedElement = this.expandedElement === element ? null : element;
  }

  trackByProduct(index: number, item: SalesItem): number {
    return item.id;
  }
}