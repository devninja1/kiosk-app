export interface SalesItem {
  /** Product id */
  id: number;
  /** API may include order_id on items */
  order_id?: number;
  product_code: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  discount: number;
  subtotal: number;
  updated_date: Date | string;
}