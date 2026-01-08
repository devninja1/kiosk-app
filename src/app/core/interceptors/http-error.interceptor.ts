import {
  HttpErrorResponse,
  HttpInterceptorFn
} from '@angular/common/http';
import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, throwError } from 'rxjs';
import { ApiStatusService } from '../services/api-status.service';
import { extractApiErrorMessage } from '../utils/error-utils';

let snackBarActive = false;
const messageQueue: string[] = [];

export const httpErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const snackBar = inject(MatSnackBar);
  const apiStatus = inject(ApiStatusService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // If we're offline / API unreachable, don't spam server error snackbars.
      if (!apiStatus.isOnlineNow() || error.status === 0) {
        return throwError(() => error);
      }

      let errorMessage = extractApiErrorMessage(error, false) || `Server returned code ${error.status}, error message is: ${error.message}`;

      const forwardedError: any = { ...error, userMessage: errorMessage };

      // Only enqueue a snackbar if downstream does not explicitly handle the error via catchError with userMessage check.
      messageQueue.push(errorMessage);
      if (!snackBarActive) {
        const showNext = () => {
          const nextMessage = messageQueue.shift();
          if (!nextMessage) {
            snackBarActive = false;
            return;
          }
          snackBarActive = true;
          const ref = snackBar.open(nextMessage, 'Close', {
            duration: 10000,
            verticalPosition: 'top',
            panelClass: ['warn-snackbar']
          });
          ref.afterDismissed().subscribe(() => {
            snackBarActive = false;
            showNext();
          });
        };
        showNext();
      }

      return throwError(() => forwardedError);
    })
  );
};