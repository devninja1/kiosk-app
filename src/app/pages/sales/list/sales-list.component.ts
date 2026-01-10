import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { SalesItem } from '../../../model/sales.model';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-sales-list',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule],
  templateUrl: './sales-list.component.html',
  styleUrl: './sales-list.component.scss'
})
export class SalesListComponent {
  @Input() salesList: SalesItem[] = [];
  @Output() itemDeleted = new EventEmitter<number>();
  @Output() quantityChanged = new EventEmitter<{ index: number; delta?: number; setQuantity?: number }>();
  readonly currencyCode = environment.currencyCode;

  get grandTotal(): number {
    if (!this.salesList || this.salesList.length === 0) {
      return 0;
    }
    return this.salesList.reduce((accumulator, item) => accumulator + item.subtotal, 0);
  }

  trackByProduct(index: number, item: SalesItem): string {
    // Create a unique identifier for each row for better *ngFor performance
    return `${item.product_name}-${index}`;
  }

  deleteItem(index: number): void {
    this.itemDeleted.emit(index);
  }

  increaseQty(index: number): void {
    this.quantityChanged.emit({ index, delta: 1 });
  }

  decreaseQty(index: number): void {
    const item = this.salesList[index];
    if (!item || item.quantity <= 0.01) return;
    this.quantityChanged.emit({ index, delta: -1 });
  }

  setQty(index: number, value: number): void {
    if (!Number.isFinite(value) || value <= 0) return;
    this.quantityChanged.emit({ index, setQuantity: value });
  }

  selectQty(event: FocusEvent): void {
    const input = event.target as HTMLInputElement | null;
    if (input) {
      setTimeout(() => input.select(), 0);
    }
  }
}