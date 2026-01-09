import { Routes } from '@angular/router';
import { Dashboard } from './pages/dashboard/main/dashboard';
import { SalesComponent } from './pages/sales/main/sales.component';
import { ProductComponent } from './pages/product/main/product.component';
import { CustomerComponent } from './pages/customer/customer.component';
import { SalesHistoryComponent } from './pages/sales-history/sales-history.component';
import { SyncStatusComponent } from './pages/sync-status/sync-status.component';
import { SupplierManagementComponent } from './pages/supplier/supplier-management.component';
import { PurchaseHistoryComponent } from './pages/purchases/history/purchase-history.component';
import { PurchasesComponent } from './pages/purchases/purchases.component';
import { InventoryComponent } from './pages/inventory/inventory.component';
import { LayoutComponent } from './layout/fullLayout/layout.component';
import { LoginComponent } from './pages/auth/login.component';
import { RegisterComponent } from './pages/auth/register.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', component: Dashboard },
      { path: 'suppliers', component: SupplierManagementComponent },
      { path: 'sales', component: SalesComponent },
      { path: 'purchase-history', component: PurchaseHistoryComponent },
      { path: 'purchases', component: PurchasesComponent },
      { path: 'products', component: ProductComponent },
      { path: 'inventory', component: InventoryComponent },
      { path: 'customers', component: CustomerComponent },
      { path: 'saleshistory', component: SalesHistoryComponent },
      { path: 'sync-status', component: SyncStatusComponent },
      { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
      { path: '**', redirectTo: '/dashboard' }
    ]
  }
];