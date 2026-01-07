import { Component, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { Product } from '../../../model/product.model';
import { ProductFormComponent } from '../form/product-form.component';
import { ProductService } from '../../../core/services/product.service';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { MatPaginator } from '@angular/material/paginator';
import { UploadRequestType } from 'app/core/services/upload.service';
import { UploadDialogComponent } from 'app/shared/components/upload-dialog/upload-dialog.component';

@Component({
  selector: 'app-product',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatDialogModule,
    MatButtonModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    ReactiveFormsModule,
    MatIconModule,
  ],
  templateUrl: './product.component.html',
  styleUrl: './product.component.scss'
})
export class ProductComponent implements OnInit, AfterViewInit {
  displayedColumns: string[] = ['id', 'product_code', 'name', 'group', 'category', 'description', 'cost_price', 'unit_price', 'profit_margin', 'display_order', 'stock', 'is_Stock_enable', 'is_active', 'actions'];
  dataSource: MatTableDataSource<Product>;

  categoryFilter = new FormControl('');
  uniqueCategories: string[] = [];
  private filterValues = { global: '', category: '' };

  UploadRequestType = UploadRequestType;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    public dialog: MatDialog,
    private productService: ProductService,
    private snackBar: MatSnackBar
  ) {
    this.dataSource = new MatTableDataSource<Product>([]);
  }

  ngOnInit(): void {
    this.categoryFilter.valueChanges.subscribe(value => {
      this.filterValues.category = value || '';
      this.dataSource.filter = JSON.stringify(this.filterValues);
    });

    // Setup filter predicate
    this.dataSource.filterPredicate = (data: Product, filter: string): boolean => {
      const searchTerms = JSON.parse(filter);

      // Combine all searchable string properties of the product
      const dataStr = [data.name, data.group, data.description, data.category, data.cost_price, data.unit_price, data.display_order, data.stock]
        .filter((value) => value !== null && value !== undefined)
        .map(String)
        .join(' ')
        .toLowerCase();

      const globalMatch = dataStr.includes(searchTerms.global.trim().toLowerCase());
      const categoryMatch = searchTerms.category ? data.category.toLowerCase() === searchTerms.category.toLowerCase() : true;

      return globalMatch && categoryMatch;
    };

    // Custom sorting for calculated 'profit_margin' column
    this.dataSource.sortingDataAccessor = (item, property) => {
      switch (property) {
        case 'profit_margin':
          if (item.unit_price === 0) return 0;
          return (item.unit_price - item.cost_price) / item.unit_price;
        default:
          return (item as any)[property];
      }
    };

    // The getProducts() returns a BehaviorSubject, so we can subscribe to it.
    // The table will update automatically whenever the service emits new data.
    this.productService.getProducts().subscribe(products => {
      //console.log('Received products page 1:', products);
      this.dataSource.data = products;
      this.uniqueCategories = [...new Set(products.map(p => p.category))].sort();
      // Re-apply the filter in case the data changed
      this.dataSource.filter = JSON.stringify(this.filterValues);
    });
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  applyFilter(event: Event) {
    this.filterValues.global = (event.target as HTMLInputElement).value;
    this.dataSource.filter = JSON.stringify(this.filterValues);
  }

  openProductForm(product?: Product): void {
    const dialogRef = this.dialog.open(ProductFormComponent, {
      width: '400px',
      data: { product }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        if (product) {
          this.productService.updateProduct({ ...product, ...result }).subscribe();
        } else {
          this.productService.addProduct(result).subscribe();
        }
      }
    });
  }

  deleteProduct(id: number): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '350px',
      data: { message: 'Are you sure you want to delete this product?' }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.productService.deleteProduct(id).subscribe();
      }
    });
  }

  openUploadDialog(): void {
    const dialogRef = this.dialog.open(UploadDialogComponent, {
      width: '420px',
      data: {
        requestType: UploadRequestType.ProductExcel,
        title: 'Import Data',
        helperText: 'Select an Excel file (.xls, .xlsx) up to 5 MB.'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result?.uploaded) {
        this.snackBar.open('Product Excel uploaded.', 'Close', { duration: 2500, verticalPosition: 'top' });
      }
    });
  }
}
