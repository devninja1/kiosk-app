import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { CommonModule } from '@angular/common';

// Angular Material Modules
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import { Product } from '../../../model/product.model';
import { SalesItem } from '../../../model/sales.model';
import { ProductService } from '../../../core/services/product.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-sales-entry',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './sales-entry.component.html',
  styleUrl: './sales-entry.component.scss'
})
export class SalesEntryComponent implements OnInit {
  @ViewChild('quantityInput') quantityInput!: ElementRef<HTMLInputElement>;
  @ViewChild('productSearchInput') productSearchInput!: ElementRef<HTMLInputElement>;

  @Input() products: Product[] = [];
  @Input() addedProductNames: Set<string> = new Set<string>();
  @Output() itemAdded = new EventEmitter<SalesItem>();

  productSearch = new FormControl<string | Product>('');
  filteredProducts!: Observable<Product[]>;
  selectedProduct: Product | null = null;
  quantity: number = 1;
  editableRate: number = 0;
  canCreateNewProduct = false;
  private lastSearchText = '';
  readonly currencyCode = environment.currencyCode;

  constructor(private productService: ProductService) {}

  ngOnInit() {
    this.filteredProducts = this.productSearch.valueChanges.pipe(
      startWith(''),
      map(value => (typeof value === 'string' ? value : value?.name ?? '')),
      map(name => {
        this.lastSearchText = (name ?? '').trim();
        const list = this.lastSearchText ? this._filter(this.lastSearchText) : this.getSortedProducts(this.products);

        // Only allow creation if user typed something and there are no matches and no product is selected.
        this.canCreateNewProduct = !!this.lastSearchText && list.length === 0 && !this.selectedProduct;
        if (this.canCreateNewProduct) {
          this.quantity = 1;
          if (!this.editableRate) this.editableRate = 0;
        }

        return list;
      }),
    );
  }

  private getSortedProducts(products: Product[]): Product[] {
    return [...products].sort((a, b) => {
      const aOrder = a.display_order ?? Number.MAX_SAFE_INTEGER;
      const bOrder = b.display_order ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.name.localeCompare(b.name);
    });
  }

  private _filter(name: string): Product[] {
    const filterValue = name.toLowerCase();
    return this.getSortedProducts(
      this.products.filter(product => product.name.toLowerCase().includes(filterValue))
    );
  }

  displayProduct(product: Product): string {
    return product && product.name ? product.name : '';
  }

  onProductSelected(event: any) {
    this.selectedProduct = event.option.value;
    if (this.selectedProduct) {
      this.canCreateNewProduct = false;
      this.quantity = 1;
      this.editableRate = this.selectedProduct.unit_price;

      setTimeout(() => {
        this.quantityInput.nativeElement.focus();
        this.quantityInput.nativeElement.select();
      }, 0);
    }
  }

  isProductAdded(productName: string): boolean {
    return this.addedProductNames.has(productName);
  }

  get totalAmount(): number {
    return (this.selectedProduct || this.canCreateNewProduct) ? this.editableRate * this.quantity : 0;
  }

  addItem() {
    if (!this.selectedProduct) {
      if (!this.canCreateNewProduct || !this.lastSearchText) {
        return;
      }

      const name = this.lastSearchText;
      const existing = this.products.find(p => p.name.trim().toLowerCase() === name.toLowerCase());
      if (existing) {
        this.selectedProduct = existing;
        this.canCreateNewProduct = false;
      } else {
        this.productService.addProduct({
          name,
          category: 'Unknown',
          description: '',
          unit_price: this.editableRate,
          cost_price: 0,
          stock: 0,
          is_Stock_enable: false,
          is_active: true,
          group: undefined,
          display_order: undefined,
        }).subscribe((createdProduct) => {
          const discount = 0;
          const subtotal = Math.max(0, (this.editableRate * this.quantity) - discount);

          this.itemAdded.emit({
            id: createdProduct.id,
            product_code: createdProduct.product_code,
            product_name: createdProduct.name,
            unit_price: this.editableRate,
            quantity: this.quantity,
            discount,
            subtotal,
            updated_date: new Date(),
          });

          this.resetForm();
        });
        return;
      }
    }

    const discount = 0;
    const subtotal = Math.max(0, this.totalAmount - discount);

    this.itemAdded.emit({
      id: this.selectedProduct.id,
      product_code: this.selectedProduct.product_code,
      product_name: this.selectedProduct.name,
      unit_price: this.editableRate,
      quantity: this.quantity,
      discount,
      subtotal,
      updated_date: new Date(),
    });

    this.resetForm();
  }

  private resetForm() {
    this.selectedProduct = null;
    this.canCreateNewProduct = false;
    this.lastSearchText = '';
    this.productSearch.setValue('');
    this.quantity = 1;
    this.editableRate = 0;

    // Set focus back to the product search input for the next entry
    this.productSearchInput.nativeElement.focus();
  }
}