import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { map, Observable } from 'rxjs';
import { Product } from '../../../model/product.model';
import { ProductService } from '../../../core/services/product.service';

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatCheckboxModule,
    MatSelectModule,
  ],
  templateUrl: './product-form.component.html',
  styleUrl: './product-form.component.scss',
})
export class ProductFormComponent {
  productForm: FormGroup;
  categories$: Observable<string[]>;

  constructor(
    private fb: FormBuilder,
    private productService: ProductService,
    public dialogRef: MatDialogRef<ProductFormComponent>,
    @Inject(MAT_DIALOG_DATA) public productDialogData: { product?: Product }
  ) {
    const product = productDialogData?.product;

    this.categories$ = this.productService.getProducts().pipe(
      map((products) => {
        const unique = new Set<string>();
        for (const p of products) {
          const category = (p.category ?? '').trim();
          if (category) unique.add(category);
        }
        return Array.from(unique).sort((a, b) => a.localeCompare(b));
      })
    );

    this.productForm = this.fb.group({
      name: [product?.name || '', Validators.required],
      category: [product?.category || '', Validators.required],
      description: [product?.description || ''],
      cost_price: [product?.cost_price ?? 0, [Validators.min(0)]],
      unit_price: [product?.unit_price || 0, [Validators.required, Validators.min(0)]],
      display_order: [product?.display_order ?? 0, [Validators.min(0)]],
      stock: [product?.stock || 0, [Validators.required, Validators.min(0)]],
      is_Stock_enable: [product?.is_Stock_enable ?? false],
      is_active: [product?.is_active ?? true],
    });
  }

  onSave(): void {
    if (this.productForm.valid) {
      this.dialogRef.close(this.productForm.value);
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}