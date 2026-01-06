import { Component, Inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UploadRequestType, UploadService } from 'app/core/services/upload.service';
import { finalize, Subject, takeUntil } from 'rxjs';
import { ApiStatusService } from 'app/core/services/api-status.service';

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
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './upload-dialog.component.html',
  styleUrl: './upload-dialog.component.scss'
})
export class UploadDialogComponent implements OnDestroy {
  selectedFile: File | null = null;
  isUploading = false;
  errorMessage = '';
  requestType: UploadRequestType;
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
          const apiMessage = (err?.error?.message as string) || (err?.message as string);
          const sanitized = apiMessage ? apiMessage.replace(/https?:\/\/\S+/gi, '[link removed]') : '';
          const friendly = sanitized ? `Upload failed: ${sanitized}` : 'Upload failed. Please try again.';
          this.errorMessage = friendly;
          this.snackBar.open(friendly, 'Close', { duration: 4000, verticalPosition: 'top', panelClass: ['warn-snackbar'] });
        }
      });
  }

  close(): void {
    this.dialogRef.close();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
