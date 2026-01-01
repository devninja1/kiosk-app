import { AfterViewInit, Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { Sale } from '../../model/sale.model';
import { SalesItem } from '../../model/sales.model';
import { SalesService } from '../../core/services/sales.service';
import { MatNativeDateModule } from '@angular/material/core';
import { MatInputModule } from '@angular/material/input';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-sales-history',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatIconModule,
    MatButtonModule,
    CurrencyPipe,
    DatePipe,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatPaginatorModule,
  ],
  templateUrl: './sales-history.component.html',
  styleUrl: './sales-history.component.scss',
})
export class SalesHistoryComponent implements OnInit, AfterViewInit {
  dataSource: MatTableDataSource<Sale>;
  columnsToDisplay = ['expand', 'id', 'customer', 'order_date', 'total_amount', 'actions'];
  expandedElement: Sale | null = null;
  private originalData: Sale[] = [];

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  range = new FormGroup({
    start: new FormControl<Date | null>(null),
    end: new FormControl<Date | null>(null),
  });

  constructor(
    private salesService: SalesService,
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
      this.originalData = sales.sort((a, b) => b.id - a.id);
      this.dataSource.data = this.originalData;

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
    const currencyPipe = new CurrencyPipe('en-US');
    const datePipe = new DatePipe('en-US');
    const displaySaleId = sale.order_id ?? sale.id;
    const companyName = environment.companyName;
    const discountAmount = sale.discount ?? 0;
    const discountHtml = discountAmount
      ? `<div class="total-row"><span>Discount:</span><span>${currencyPipe.transform(discountAmount)}</span></div>`
      : '';

    const itemsHtml = sale.order_items.map(item => `
      <tr>
        <td>${item.product_name}</td>
        <td class="text-right">${item.quantity}</td>
        <td class="text-right">${currencyPipe.transform(item.unit_price)}</td>
        <td class="text-right">${currencyPipe.transform(item.subtotal)}</td>
      </tr>
    `).join('');

    const customerLine = sale.customer_id !== null && sale.customer_id !== undefined
      ? `Customer: ${sale.customer_name ?? 'N/A'} (ID: ${sale.customer_id})`
      : `Customer: ${sale.customer_name ?? 'N/A'}`;

    const receiptContent = `
      <html>
        <head>
          <title>Receipt - Sale #${displaySaleId}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; }
            .receipt-container { width: 320px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h2 { margin: 0; }
            .header p { margin: 2px 0; font-size: 12px; }
            .items-table { width: 100%; border-collapse: collapse; font-size: 12px; }
            .items-table th, .items-table td { padding: 6px; text-align: left; border-bottom: 1px dashed #ccc; }
            .items-table th { font-weight: 600; }
            .items-table .text-right { text-align: right; }
            .totals { margin-top: 20px; }
            .totals .total-row { display: flex; justify-content: space-between; font-size: 14px; padding: 4px 0; }
            .totals .grand-total { font-weight: bold; font-size: 16px; border-top: 1px solid #333; margin-top: 5px; }
            .footer { text-align: center; margin-top: 20px; font-size: 10px; }
          </style>
        </head>
        <body>
          <div class="receipt-container">
            <div class="header">
              <h2>${companyName}</h2>
              <p>Sale Receipt</p>
              <p>Sale ID: ${displaySaleId}</p>
              <p>Date: ${datePipe.transform(sale.order_date, 'short')}</p>
              <p>${customerLine}</p>
            </div>
            <table class="items-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th class="text-right">Qty</th>
                  <th class="text-right">Price</th>
                  <th class="text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
            </table>
            <div class="totals">
              ${discountHtml}
              <div class="total-row grand-total">
                <span>Grand Total:</span>
                <span>${currencyPipe.transform(sale.total_amount)}</span>
              </div>
            </div>
            <div class="footer">
              <p>Thank you for your business!</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow?.document.write(receiptContent);
    printWindow?.document.close();
    printWindow?.print();
  }

  trackByProduct(index: number, item: SalesItem): number {
    return item.id;
  }
}