import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { DBConfig, NgxIndexedDBModule } from 'ngx-indexed-db';
import { registerLocaleData } from '@angular/common';
import localeIn from '@angular/common/locales/en-IN';
import { LOCALE_ID } from '@angular/core';
import { routes } from './app.routes';
import { httpErrorInterceptor } from './core/interceptors/http-error.interceptor';
import { loadingInterceptor } from './core/interceptors/loading.interceptor';

// Register the locale data for 'en-IN'
registerLocaleData(localeIn);

const dbConfig: DBConfig = {
  name: 'KiskoAppDb',
  version: 3,
  objectStoresMeta: [{
    store: 'products',
    storeConfig: { keyPath: 'id', autoIncrement: true },
    storeSchema: [
      { name: 'product_code', keypath: 'product_code', options: { unique: false } },
      { name: 'name', keypath: 'name', options: { unique: false } }
    ]
  }, {
    store: 'customers',
    storeConfig: { keyPath: 'id', autoIncrement: true },
    storeSchema: [
      { name: 'name', keypath: 'name', options: { unique: false } }
    ]
  },
  {
      store: 'purchases',
      storeConfig: { keyPath: 'id', autoIncrement: true },
      storeSchema: [
        { name: 'supplierId', keypath: 'supplierId', options: { unique: false } },
        { name: 'date', keypath: 'date', options: { unique: false } },
      ]
    },
  {
    store: 'sales',
    storeConfig: { keyPath: 'id', autoIncrement: true },
    storeSchema: [
      { name: 'date', keypath: 'date', options: { unique: false } },
      { name: 'grandTotal', keypath: 'grandTotal', options: { unique: false } }
    ]
  }, {
    store: 'suppliers',
    storeConfig: { keyPath: 'id', autoIncrement: true },
    storeSchema: [
      { name: 'name', keypath: 'name', options: { unique: false } }
    ]
  }, {
    store: 'failed-sync-queue',
    storeConfig: { keyPath: 'id', autoIncrement: true },
    storeSchema: []
  }, {
    store: 'inventory_inflow',
    storeConfig: { keyPath: 'id', autoIncrement: true },
    storeSchema: [
      { name: 'product_id', keypath: 'product_id', options: { unique: false } },
      { name: 'inflow_date', keypath: 'inflow_date', options: { unique: false } },
      { name: 'quantity', keypath: 'quantity', options: { unique: false } },
      { name: 'batch_no', keypath: 'batch_no', options: { unique: false } }
    ]
  }, {
    store: 'inventory_outflow',
    storeConfig: { keyPath: 'id', autoIncrement: true },
    storeSchema: [
      { name: 'product_id', keypath: 'product_id', options: { unique: false } },
      { name: 'outflow_date', keypath: 'outflow_date', options: { unique: false } },
      { name: 'quantity', keypath: 'quantity', options: { unique: false } }
    ]
  }, {
    store: 'sync-queue',
    storeConfig: { keyPath: 'id', autoIncrement: true },
    storeSchema: []
  }]
};

export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes), 
    provideHttpClient(withInterceptors([httpErrorInterceptor, loadingInterceptor])),
    provideAnimations(),
     importProvidersFrom(NgxIndexedDBModule.forRoot(dbConfig)),
    // Provide the LOCALE_ID for the entire application
    {provide: LOCALE_ID, useValue: 'en-IN'},
  ]
};