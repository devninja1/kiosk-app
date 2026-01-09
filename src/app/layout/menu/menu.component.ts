import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [CommonModule, MatListModule, MatIconModule, RouterLink, RouterLinkActive, MatTooltipModule],
  templateUrl: './menu.component.html',
  styleUrl: './menu.component.scss'
})
export class MenuComponent {
  @Input() collapsed = false;
  @Output() menuItemClicked = new EventEmitter<void>();

  menuItems = [
    { name: 'Dashboard', icon: 'dashboard', route: '/dashboard' },
    { name: 'Customers', icon: 'people', route: '/customers' },
    { name: 'Products', icon: 'inventory_2', route: '/products' },
    { name: 'Sales', icon: 'point_of_sale', route: '/sales' },
    { name: 'Sales History', icon: 'history', route: '/saleshistory' },
    { name: 'Inventory', icon: 'inventory', route: '/inventory' },
    { name: 'Suppliers', icon: 'local_shipping', route: '/suppliers' },
    { name: 'Purchases', icon: 'shopping_cart', route: '/purchases' },
    { name: 'Purchase History', icon: 'receipt_long', route: '/purchase-history' },
    { name: 'Sync Status', icon: 'sync_problem', route: '/sync-status' },
    { name: 'Settings', icon: 'settings', route: '/settings' },
  ];

  constructor(private authService: AuthService) {}

  onItemClick(): void {
    this.menuItemClicked.emit();
  }

  logout(): void {
    this.authService.logout();
  }
}