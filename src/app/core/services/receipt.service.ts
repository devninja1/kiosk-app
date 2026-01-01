import { Injectable, Inject, LOCALE_ID } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { environment } from '../../../environments/environment';
import { Sale } from '../../model/sale.model';

@Injectable({
  providedIn: 'root',
})
export class ReceiptService {
  constructor(@Inject(LOCALE_ID) private localeId: string) {}

  printSaleReceipt(sale: Sale): void {
    const currencyPipe = new CurrencyPipe(this.localeId);
    const datePipe = new DatePipe(this.localeId);

    const companyName = environment.companyName;
    const displaySaleId = sale.order_id ?? sale.id;

    const discountAmount = sale.discount ?? 0;
    const discountHtml = discountAmount
      ? `<div class="total-row"><span>Discount:</span><span>${currencyPipe.transform(discountAmount, 'INR', 'symbol')}</span></div>`
      : '';

    const customerLine = sale.customer_id !== null && sale.customer_id !== undefined
      ? `Customer: ${sale.customer_name ?? 'N/A'} (ID: ${sale.customer_id})`
      : `Customer: ${sale.customer_name ?? 'N/A'}`;

    const itemsHtml = (sale.order_items ?? []).map(item => `
      <tr>
        <td>${item.product_name}</td>
        <td class="text-right">${item.quantity}</td>
        <td class="text-right">${currencyPipe.transform(item.unit_price, 'INR', 'symbol')}</td>
        <td class="text-right">${currencyPipe.transform(item.subtotal, 'INR', 'symbol')}</td>
      </tr>
    `).join('');

    const receiptContent = `
      <html>
        <head>
          <title>Receipt - Sale #${displaySaleId}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; }
            .receipt-container { width: 320px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h2 { margin: 0; }
            .header p { margin: 2px 0; font-size: 12px; }
            .items-table { width: 100%; border-collapse: collapse; font-size: 12px; }
            .items-table th, .items-table td { padding: 6px; text-align: left; border-bottom: 1px dashed #ccc; }
            .items-table th { font-weight: 600; }
            .items-table .text-right { text-align: right; }
            .totals { margin-top: 20px; }
            .totals .total-row { display: flex; justify-content: space-between; font-size: 14px; padding: 4px 0; }
            .totals .grand-total { font-weight: bold; font-size: 16px; border-top: 1px solid #333; margin-top: 5px; }
            .footer { text-align: center; margin-top: 20px; font-size: 10px; }
          </style>
        </head>
        <body>
          <div class="receipt-container">
            <div class="header">
              <h2>${companyName}</h2>
              <p>Sale Receipt</p>
              <p>Sale ID: ${displaySaleId}</p>
              <p>Date: ${datePipe.transform(sale.order_date, 'short')}</p>
              <p>${customerLine}</p>
            </div>
            <table class="items-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th class="text-right">Qty</th>
                  <th class="text-right">Price</th>
                  <th class="text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
            </table>
            <div class="totals">
              ${discountHtml}
              <div class="total-row grand-total">
                <span>Grand Total:</span>
                <span>${currencyPipe.transform(sale.total_amount, 'INR', 'symbol')}</span>
              </div>
            </div>
            <div class="footer">
              <p>Thank you for your business!</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow?.document.write(receiptContent);
    printWindow?.document.close();
    printWindow?.print();
  }
}
