import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { CustomerService } from '../../../core/services/customer.service';
import { ProductService } from '../../../core/services/product.service';
import { SalesService } from '../../../core/services/sales.service';
import { Observable, map, startWith } from 'rxjs';
import { environment } from '../../../../environments/environment';

interface QuickLink {
  path: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-quick-links-widget',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatListModule,
    MatIconModule
  ],
  templateUrl: './quick-links-widget.component.html',
  styleUrl: './quick-links-widget.component.scss'
})
export class QuickLinksWidgetComponent {
  totalCustomers$: Observable<number>;
  totalProducts$: Observable<number>;
  totalSalesToday$: Observable<number>;
  readonly currencyCode = environment.currencyCode;
  links: QuickLink[] = [
    { path: '/sales', label: 'New Sale', icon: 'point_of_sale' },
    { path: '/products', label: 'Manage Products', icon: 'inventory_2' },
    { path: '/sales-history', label: 'Sales History', icon: 'history' },
    { path: '/customers', label: 'Manage Customers', icon: 'people' }
  ];

  constructor(
    private customerService: CustomerService,
    private productService: ProductService,
    private salesService: SalesService
  ) {
    this.totalCustomers$ = this.customerService.getCustomers().pipe(
      map(customers => customers.length),
      startWith(0)
    );
    this.totalProducts$ = this.productService.getProducts().pipe(
      map(products => products.length),
      startWith(0)
    );
    this.totalSalesToday$ = this.salesService.getSales().pipe(
      map(sales => {
        const todayStart = new Date().setHours(0, 0, 0, 0);
        return sales
          .filter(sale => new Date(sale.order_date).setHours(0, 0, 0, 0) === todayStart)
          .reduce((total, sale) => total + (sale.total_amount || 0), 0);
      }),
      startWith(0)
    );
  }
}