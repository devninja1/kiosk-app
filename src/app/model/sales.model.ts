export interface SalesItem {
  /** Product id */
  id: number;
  product_code: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  discount: number;
  subtotal: number;
  updated_date: Date;
}