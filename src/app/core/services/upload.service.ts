import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export enum UploadRequestType {
  ProductExcel = 'ProductExcel',
  CustomerExcel = 'CustomerExcel',
  SalesExcel = 'SalesExcel',
}

@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly apiUrl = `${environment.apiUrl}/upload`;
  private readonly exportUrl = `${environment.apiUrl}/Export`;

  private readonly exportTypeMap: Record<UploadRequestType, string> = {
    [UploadRequestType.ProductExcel]: 'productexcel',
    [UploadRequestType.CustomerExcel]: 'customerexcel',
    [UploadRequestType.SalesExcel]: 'salesexcel',
  };

  constructor(private http: HttpClient) {}

  uploadExcel(file: File, requestType: UploadRequestType): Observable<any> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('requestType', requestType);
    return this.http.post(this.apiUrl, formData);
  }

  exportExcel(requestType: UploadRequestType): Observable<Blob> {
    const excelExportType = this.exportTypeMap[requestType] ?? this.exportTypeMap[UploadRequestType.ProductExcel];
    return this.http.get(this.exportUrl, {
      params: { excelExportType },
      responseType: 'blob',
    });
  }
}
