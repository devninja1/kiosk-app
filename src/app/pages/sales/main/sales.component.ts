import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Observable, map, startWith } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';

// Angular Material Modules
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';

// Child Components
import { SalesEntryComponent } from '../entry/sales-entry.component';
import { SalesListComponent } from '../list/sales-list.component';

// Models and Services
import { Product } from '../../../model/product.model';
import { SalesItem } from '../../../model/sales.model';
import { Customer } from '../../../model/customer.model';
import { MatIconModule } from '@angular/material/icon';
import { ProductService } from '../../../core/services/product.service';
import { CustomerFormComponent } from '../../customer/form/customer-form.component';
import { CustomerService } from '../../../core/services/customer.service';
import { SalesService } from '../../../core/services/sales.service';
import { ReceiptService } from '../../../core/services/receipt.service';
import { Sale } from '../../../model/sale.model';

// Main Component
@Component({
  selector: 'app-sales',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatDialogModule,
    MatSnackBarModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    SalesEntryComponent,
    SalesListComponent,
  ],
  templateUrl: './sales.component.html',
  styleUrl: './sales.component.scss',
})
export class SalesComponent implements OnInit {
  products$: Observable<Product[]>;
  customers: Customer[] = [];
  salesList: SalesItem[] = [];
  addedProductNames = new Set<string>();

  lastSavedSale: Sale | null = null;

  private editingSale: Sale | null = null;
  private editingOriginalItems: SalesItem[] = [];
  private activeEditIdentifier: number | null = null;

  customerSearch = new FormControl<string | Customer>('');
  filteredCustomers$!: Observable<Customer[]>;
  selectedCustomer: Customer | null = null;

  constructor(
    private productService: ProductService,
    private customerService: CustomerService,
    private salesService: SalesService,
    private receiptService: ReceiptService,
    private router: Router,
    private route: ActivatedRoute,
    public dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {
    this.products$ = this.productService.getProducts().pipe(
      map(products => products.filter(p => p.is_active))
    );
  }

  ngOnInit(): void {
    this.customerService.getCustomers().subscribe(customers => {
      this.customers = customers;
      this.filteredCustomers$ = this.customerSearch.valueChanges.pipe(
        startWith(''),
        map(value => (typeof value === 'string' ? value : value?.name ?? '')),
        map(name => (name ? this._filterCustomers(name) : this.customers.slice())),
      );

      // If we loaded a sale for editing before customers arrived, bind to the real customer now.
      if (this.editingSale?.customer_id !== null && this.editingSale?.customer_id !== undefined) {
        const matchedCustomer = this.customers.find(c => c.id === this.editingSale!.customer_id!) ?? null;
        if (matchedCustomer) {
          this.selectedCustomer = matchedCustomer;
          this.customerSearch.setValue(matchedCustomer);
        }
      }
    });

    this.route.queryParamMap.subscribe(params => {
      const rawId = params.get('editOrderId') ?? params.get('editSaleId');
      if (!rawId) {
        this.activeEditIdentifier = null;
        return;
      }

      const identifier = Number(rawId);
      if (!Number.isFinite(identifier)) return;
      if (this.activeEditIdentifier === identifier) return;
      this.activeEditIdentifier = identifier;

      this.salesService.findSaleByIdentifier(identifier).subscribe(sale => {
        if (!sale) {
          this.snackBar.open('Sale not found for editing.', 'Close', { duration: 3000, verticalPosition: 'top' });
          return;
        }

        if (sale.status !== 'pending') {
          this.snackBar.open('Only pending orders can be edited.', 'Close', { duration: 3000, verticalPosition: 'top' });
          return;
        }

        this.startEditFromSale(sale);

        // Ensure URL shows the order_id if available.
        const preferredIdentifier = sale.order_id ?? sale.id;
        if (preferredIdentifier !== this.activeEditIdentifier) {
          this.activeEditIdentifier = preferredIdentifier;
          this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { editOrderId: preferredIdentifier, editSaleId: null },
            queryParamsHandling: 'merge',
            replaceUrl: true,
          });
        }
      });
    });
  }

  get isEditing(): boolean {
    return !!this.editingSale;
  }

  get editingSaleId(): number | null {
    return this.editingSale?.order_id ?? this.editingSale?.id ?? null;
  }

  onItemAdded(newItem: SalesItem) {
    // For new sales we update stock optimistically while building the order.
    // For edits, stock is adjusted on save based on delta.
    if (!this.isEditing) {
      this.productService.updateStock(newItem.id, -newItem.quantity).subscribe();
    }
    const existingItemIndex = this.salesList.findIndex(
      (saleItem) => saleItem.id === newItem.id
    );

    if(existingItemIndex > -1) {
      // Product already exists, so we update it
      const updatedSalesList = [...this.salesList];
      const existingItem = updatedSalesList[existingItemIndex];

      // Update quantity, rate, and subtotal
      existingItem.quantity += newItem.quantity;
      existingItem.unit_price = newItem.unit_price; // Use the latest rate
      existingItem.discount = newItem.discount;
      existingItem.subtotal = Math.max(0, (existingItem.unit_price * existingItem.quantity) - (existingItem.discount || 0));
      existingItem.updated_date = new Date();

      this.salesList = updatedSalesList;
    } else {
      // Product is new, add it to the list
      this.salesList = [...this.salesList, newItem];
      this.addedProductNames.add(newItem.product_name);
    }
  }

  private _filterCustomers(name: string): Customer[] {
    const filterValue = name.toLowerCase();
    return this.customers.filter(customer => customer.name.toLowerCase().includes(filterValue));
  }

  displayCustomer(customer: Customer): string {
    return customer && customer.name ? customer.name : '';
  }

  onCustomerSelected(event: any) {
    this.selectedCustomer = event.option.value;
  }

  createNewCustomer(customerName: string): void {
    const dialogRef: MatDialogRef<CustomerFormComponent, Omit<Customer, 'id'>> = this.dialog.open(CustomerFormComponent, {
      width: '400px',
      // Pre-fill the form with the name the user typed
      data: { customer: { name: customerName, email: '', phone: '' } }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) { // result is the form value: Omit<Customer, 'id'>
        this.customerService.addCustomer(result).subscribe(newCustomer => {
          this.customerSearch.setValue(newCustomer);
          this.selectedCustomer = newCustomer;
        });
      }
    });
  }

  onItemDeleted(index: number) {
    const deletedItem = this.salesList[index];
    if (deletedItem) {
      if (!this.isEditing) {
        this.productService.updateStock(deletedItem.id, deletedItem.quantity).subscribe();
      }

      this.addedProductNames.delete(deletedItem.product_name);
      // Create a new array to ensure change detection is triggered
      this.salesList = this.salesList.filter((_, i: number) => i !== index);
    }
  }

  onQuantityChanged(event: { index: number; delta: number }): void {
    const { index, delta } = event;
    const item = this.salesList[index];
    if (!item) return;
    if (delta === 0) return;

    const nextQuantity = item.quantity + delta;
    if (nextQuantity < 1) return;

    if (!this.isEditing) {
      // Keep product stock consistent with quantity changes.
      // If quantity increases (+1), stock decreases (-1). If quantity decreases (-1), stock increases (+1).
      this.productService.updateStock(item.id, -delta).subscribe();
    }

    const updatedSalesList = [...this.salesList];
    const updatedItem = { ...item };
    updatedItem.quantity = nextQuantity;
    updatedItem.subtotal = Math.max(
      0,
      (updatedItem.unit_price * updatedItem.quantity) - (updatedItem.discount || 0)
    );
    updatedItem.updated_date = new Date();
    updatedSalesList[index] = updatedItem;
    this.salesList = updatedSalesList;
  }

  get grandTotal(): number {
    return this.salesList.reduce((acc, item) => acc + item.subtotal, 0);
  }

  get lastSavedSaleId(): number | null {
    if (!this.lastSavedSale) return null;
    return this.lastSavedSale.order_id ?? this.lastSavedSale.id;
  }

  printLastSavedSale(): void {
    if (!this.lastSavedSale) return;
    this.receiptService.printSaleReceipt(this.lastSavedSale);
  }

  dismissSaleSummary(): void {
    this.lastSavedSale = null;
  }

  editLastSavedSale(): void {
    if (!this.lastSavedSale) return;

    const identifier = this.lastSavedSale.order_id ?? this.lastSavedSale.id;
    this.router.navigate(['/sales'], { queryParams: { editOrderId: identifier } });
  }

  saveSale(): void {
    if (this.salesList.length === 0) {
      return; // Don't save an empty sale
    }

    if (!this.selectedCustomer) {
      this.snackBar.open('Please select a customer before saving the sale.', 'Close', {
        duration: 3000,
        verticalPosition: 'top',
        panelClass: ['warn-snackbar'] // Optional: for custom styling
      });
      return;
    }

    const salePayload: Omit<Sale, 'id'> = {
      customer_id: this.selectedCustomer.id,
      customer_name: this.selectedCustomer.name,
      status: this.editingSale?.status ?? 'pending',
      discount: this.salesList.reduce((acc, item) => acc + (item.discount || 0), 0),
      is_review: false,
      order_items: this.salesList,
      total_amount: this.salesList.reduce((acc, item) => acc + (item.subtotal || 0), 0),
      order_date: this.editingSale?.order_date ?? new Date(),
    };

    if (this.isEditing && this.editingSale) {
      this.applyStockDeltaForEdit(this.editingOriginalItems, this.salesList);

      const updatedSale: Sale = {
        ...this.editingSale,
        ...salePayload,
        id: this.editingSale.id,
        order_id: this.editingSale.order_id,
      };

      this.salesService.updateSale(updatedSale).subscribe((savedSale) => {
        this.lastSavedSale = savedSale;
        this.snackBar.open('Sale updated successfully!', 'Close', {
          duration: 3000,
          verticalPosition: 'top',
        });

        this.editingSale = null;
        this.editingOriginalItems = [];

        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { editSaleId: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });

        // Reset the page for the next sale
        this.salesList = [];
        this.addedProductNames.clear();
        this.selectedCustomer = null;
        this.customerSearch.setValue('');
      });

      return;
    }

    this.salesService.saveSale(salePayload).subscribe((savedSale) => {
      this.lastSavedSale = savedSale;
      this.snackBar.open('Sale saved successfully!', 'Close', {
        duration: 3000,
        verticalPosition: 'top',
      });

      // Reset the page for the next sale
      this.salesList = [];
      this.addedProductNames.clear();
      this.selectedCustomer = null;
      this.customerSearch.setValue('');
    });
  }

  private startEditFromSale(sale: Sale): void {
    this.lastSavedSale = null;
    this.editingSale = sale;
    this.editingOriginalItems = (sale.order_items ?? []).map(i => ({ ...i }));

    this.salesList = (sale.order_items ?? []).map(i => ({ ...i }));
    this.addedProductNames = new Set(this.salesList.map(i => i.product_name));

    if (sale.customer_id !== null && sale.customer_id !== undefined) {
      const matchedCustomer = this.customers.find(c => c.id === sale.customer_id) ?? null;
      this.selectedCustomer = matchedCustomer ?? this.buildCustomerPlaceholder(sale.customer_id, sale.customer_name);
      this.customerSearch.setValue(this.selectedCustomer);
    } else {
      this.selectedCustomer = null;
      this.customerSearch.setValue(sale.customer_name ?? '');
    }
  }

  private buildCustomerPlaceholder(customerId: number, customerName: string): Customer {
    return {
      id: customerId,
      customerId: customerId,
      name: customerName,
      phone_number: '',
      place: '',
      type: '',
      is_active: true,
      display_order: 0,
      date_added: '',
    };
  }

  private applyStockDeltaForEdit(originalItems: SalesItem[], currentItems: SalesItem[]): void {
    const originalQty = new Map<number, number>();
    for (const item of originalItems) {
      originalQty.set(item.id, (originalQty.get(item.id) ?? 0) + item.quantity);
    }

    const currentQty = new Map<number, number>();
    for (const item of currentItems) {
      currentQty.set(item.id, (currentQty.get(item.id) ?? 0) + item.quantity);
    }

    const allProductIds = new Set<number>([...originalQty.keys(), ...currentQty.keys()]);
    for (const productId of allProductIds) {
      const before = originalQty.get(productId) ?? 0;
      const after = currentQty.get(productId) ?? 0;
      const delta = after - before;
      if (delta !== 0) {
        this.productService.updateStock(productId, -delta).subscribe();
      }
    }
  }
}