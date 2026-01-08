import { Component, Inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UploadRequestType, UploadService } from 'app/core/services/upload.service';
import { finalize, Subject, takeUntil } from 'rxjs';
import { ApiStatusService } from 'app/core/services/api-status.service';
import { extractApiErrorMessage } from 'app/core/utils/error-utils';

export interface UploadDialogData {
  /** Default request type for the caller (e.g., ProductExcel, CustomerExcel). */
  requestType?: UploadRequestType;
  /** Optional custom title for reuse across pages. */
  title?: string;
  /** Optional helper text under the title. */
  helperText?: string;
}

@Component({
  selector: 'app-upload-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatDatepickerModule, MatNativeDateModule],
  templateUrl: './upload-dialog.component.html',
  styleUrl: './upload-dialog.component.scss'
})
export class UploadDialogComponent implements OnDestroy {
  selectedFile: File | null = null;
  isUploading = false;
  isDownloading = false;
  errorMessage = '';
  requestType: UploadRequestType;
  selectedDate: Date = new Date();
  isOnline = true;
  private destroy$ = new Subject<void>();

  readonly requestTypeLabels: Record<UploadRequestType, string> = {
    [UploadRequestType.ProductExcel]: 'Product Excel',
    [UploadRequestType.CustomerExcel]: 'Customer Excel',
    [UploadRequestType.SalesExcel]: 'Sales Excel',
  };

  constructor(
    private dialogRef: MatDialogRef<UploadDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: UploadDialogData,
    private uploadService: UploadService,
    private snackBar: MatSnackBar,
    private apiStatus: ApiStatusService
  ) {
    this.requestType = data.requestType ?? UploadRequestType.ProductExcel;
    this.apiStatus.isOnline$()
      .pipe(takeUntil(this.destroy$))
      .subscribe((online) => this.isOnline = online);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.selectedFile = null;
    this.errorMessage = '';

    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    const isExcel = ext === 'xls' || ext === 'xlsx';
    const maxSizeBytes = 5 * 1024 * 1024; // 5 MB

    if (!isExcel) {
      this.errorMessage = 'Only Excel files (.xls, .xlsx) are allowed.';
      return;
    }

    if (file.size > maxSizeBytes) {
      this.errorMessage = 'File is too large. Max 5 MB.';
      return;
    }

    this.selectedFile = file;
  }

  upload(): void {
    if (!this.isOnline) {
      this.errorMessage = 'You are offline. Connect to the internet to upload.';
      return;
    }

    if (!this.selectedFile) {
      this.errorMessage = 'Select a file before uploading.';
      return;
    }

    if (this.requestType === UploadRequestType.SalesExcel && this.selectedFile && !this.isSalesFileDateValid(this.selectedFile.name)) {
      this.errorMessage = `Selected file date must be ${this.formatDate(this.selectedDate)}.`;
      return;
    }

    this.isUploading = true;
    this.errorMessage = '';

    this.uploadService
      .uploadExcel(this.selectedFile, this.requestType)
      .pipe(finalize(() => (this.isUploading = false)))
      .subscribe({
        next: () => {
          this.snackBar.open('Upload succeeded.', 'Close', { duration: 2500, verticalPosition: 'top' });
          this.dialogRef.close({ uploaded: true, requestType: this.requestType });
        },
        error: (err) => {
          const apiMessage = extractApiErrorMessage(err, false);
          this.errorMessage = apiMessage || 'Upload failed. Please try again.';
        }
      });
  }

  download(): void {
    if (!this.isOnline) {
      this.errorMessage = 'You are offline. Connect to the internet to download.';
      return;
    }

    this.isDownloading = true;
    this.errorMessage = '';

    this.uploadService
      .exportExcel(this.requestType)
      .pipe(finalize(() => (this.isDownloading = false)))
      .subscribe({
        next: (blob) => {
          const fileName = this.getExportFileName();
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          this.snackBar.open('Export ready.', 'Close', { duration: 2500, verticalPosition: 'top' });
        },
        error: (err) => {
          const apiMessage = extractApiErrorMessage(err, false);
          this.errorMessage = apiMessage || 'Export failed. Please try again.';
        }
      });
  }

  private getExportFileName(): string {
    const selected = this.formatDate(this.selectedDate);

    if (this.requestType === UploadRequestType.ProductExcel) {
      return `product_${selected}_${this.uniqueCode()}.xlsx`;
    }

    if (this.requestType === UploadRequestType.CustomerExcel) {
      return `customer_${selected}_${this.uniqueCode()}.xlsx`;
    }

    if (this.requestType === UploadRequestType.SalesExcel) {
      return `${selected}_1_DailySales${this.uniqueCode()}.xlsx`;
    }

    return `export_${selected}_${this.uniqueCode()}.xlsx`;
  }

  private formatDate(date: Date): string {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }

  private uniqueCode(): string {
    return Math.random().toString(36).slice(-6);
  }

  private isSalesFileDateValid(fileName: string): boolean {
    const match = /^([0-9]{2}-[0-9]{2}-[0-9]{4})_/.exec(fileName);
    if (!match) return false;
    const datePart = match[1];
    return datePart === this.formatDate(this.selectedDate);
  }

  close(): void {
    this.dialogRef.close();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
