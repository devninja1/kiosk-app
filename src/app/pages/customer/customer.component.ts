import { Component, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Customer } from '../../model/customer.model';
import { CustomerFormComponent } from './form/customer-form.component';
import { CustomerService } from '../../core/services/customer.service';
import { ConfirmationDialogComponent } from '../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { UploadDialogComponent } from '../../shared/components/upload-dialog/upload-dialog.component';
import { UploadRequestType } from '../../core/services/upload.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-customer',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './customer.component.html',
  styleUrl: './customer.component.scss'
})
export class CustomerComponent implements OnInit, AfterViewInit {
  displayedColumns: string[] = ['customerId', 'name', 'phone_number', 'place', 'type', 'display_order', 'is_active', 'date_added', 'actions'];
  dataSource: MatTableDataSource<Customer>;
  readonly pageSizeOptions = environment.pageSizeOptions;
  readonly defaultPageSize = environment.defaultPageSize;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(public dialog: MatDialog, private customerService: CustomerService) {
    this.dataSource = new MatTableDataSource<Customer>([]);
  }

  ngOnInit(): void {
    this.dataSource.filterPredicate = (data: Customer, filter: string) => {
      const term = filter.trim().toLowerCase();
      const haystack = [
        data.name,
        data.phone_number,
        data.place,
        data.type,
        data.display_order.toString(),
        data.customerId.toString(),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    };

    this.loadCustomers();
  }

  loadCustomers(): void {
    this.customerService.getCustomers().subscribe(customers => {
      this.dataSource.data = customers;
    });
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.paginator.pageSize = this.defaultPageSize;
    this.dataSource.sort = this.sort;
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }

  openCustomerForm(customer?: Customer): void {
    const dialogRef = this.dialog.open(CustomerFormComponent, {
      width: '400px',
      data: { customer }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        const payload = {
          ...customer,
          ...result,
          date_added: result.date_added || customer?.date_added || new Date().toISOString(),
        } as Customer;
        if (customer) {
          this.customerService.updateCustomer(payload).subscribe(() => this.loadCustomers());
        } else {
          this.customerService.addCustomer(payload as Omit<Customer, 'id'>).subscribe(() => this.loadCustomers());
        }
      }
    });
  }

  openUploadDialog(): void {
    const dialogRef = this.dialog.open(UploadDialogComponent, {
      width: '420px',
      data: {
        requestType: UploadRequestType.CustomerExcel,
        title: 'Import Customers',
        helperText: 'Upload a customer Excel file (.xls, .xlsx) up to 5 MB.'
      }
    });

    dialogRef.afterClosed().subscribe(res => {
      if (res?.uploaded) {
        this.customerService.refreshFromApi().subscribe({
          next: () => this.loadCustomers(),
          error: () => this.loadCustomers()
        });
      }
    });
  }

  deleteCustomer(customer: Customer): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '350px',
      data: { message: 'Are you sure you want to delete this customer?' }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.customerService.deleteCustomer(customer).subscribe(() => this.loadCustomers());
      }
    });
  }
}