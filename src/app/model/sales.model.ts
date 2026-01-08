export type Decimal = number;

export interface SalesItem {
  /** Product id */
  id: number;
  /** API may include order_id on items */
  order_id?: number;
  product_code: string;
  product_name: string;
  unit_price: Decimal;
  quantity: Decimal;
  discount: Decimal;
  subtotal: Decimal;
  updated_date: Date | string;
}