import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';

import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import { PurchaseItem } from '../../../model/purchase.model';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-purchase-list',
  standalone: true,
  imports: [
    CommonModule,
    CurrencyPipe,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './purchase-list.component.html',
  styleUrl: './purchase-list.component.scss'
})
export class PurchaseListComponent {
  @Input() purchaseList: PurchaseItem[] = [];
  @Output() itemDeleted = new EventEmitter<number>();
  readonly currencyCode = environment.currencyCode;

  get grandTotal(): number {
    if (!this.purchaseList || this.purchaseList.length === 0) {
      return 0;
    }
    return this.purchaseList.reduce((acc, item) => acc + item.total, 0);
  }

  trackByProduct(index: number, item: PurchaseItem): string {
    return `${item.product.name}-${index}`;
  }

  deleteItem(index: number): void {
    this.itemDeleted.emit(index);
  }
}