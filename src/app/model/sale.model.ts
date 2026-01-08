import { Decimal, SalesItem } from './sales.model';

export type SaleStatus = 'pending' | 'completed' | 'cancelled';

export interface Sale {
  id: number;
  order_id?: number;
  customer_id: number | null;
  customer_name: string;
  group?: string;
  status: SaleStatus;
  discount: Decimal;
  is_review: boolean;   
  order_items: SalesItem[];
  total_amount: Decimal;
  order_date: Date;
}