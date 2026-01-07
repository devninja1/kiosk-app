import { Component, Inject, OnDestroy } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { map, Observable, Subject, takeUntil } from 'rxjs';
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
export class ProductFormComponent implements OnDestroy {
  productForm: FormGroup;
  categories$: Observable<string[]>;
  private products: Product[] = [];
  private lastAutoCode = '';
  private readonly destroy$ = new Subject<void>();

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
      product_code: [
        product?.product_code || '',
        [Validators.required, Validators.maxLength(6), Validators.pattern(/^[A-Za-z0-9]+$/), this.createProductCodeValidator(product?.id)],
      ],
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

    const nameControl = this.productForm.get('name');
    const codeControl = this.productForm.get('product_code');

    if (!product && nameControl && codeControl) {
      nameControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => this.autoFillProductCode());
    }

    this.productService
      .getProducts()
      .pipe(takeUntil(this.destroy$))
      .subscribe((products) => {
        this.products = products;
        this.autoFillProductCode();
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private createProductCodeValidator(currentProductId?: number): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = (control.value ?? '').toString().trim();
      if (!value) return null;

      const isDuplicate = this.products.some(
        (product) => product.product_code.toLowerCase() === value.toLowerCase() && product.id !== currentProductId
      );

      return isDuplicate ? { productCodeTaken: true } : null;
    };
  }

  private autoFillProductCode(): void {
    if (this.productDialogData.product) return;

    const codeControl = this.productForm.get('product_code');
    const nameControl = this.productForm.get('name');
    if (!codeControl || !nameControl) return;

    const name = (nameControl.value ?? '').toString();
    const autoCode = this.productService.getNextProductCode(this.products, name);
    const currentValue = (codeControl.value ?? '').toString().trim();

    const shouldReplace = !currentValue || currentValue === this.lastAutoCode;

    if (shouldReplace) {
      this.lastAutoCode = autoCode;
      codeControl.setValue(autoCode, { emitEvent: false });
    }

    codeControl.updateValueAndValidity({ emitEvent: false });
  }
}