import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LoadingIndicatorService {
  private pendingRequests = 0;
  private readonly state = new BehaviorSubject(false);

  readonly loading$ = this.state.asObservable();

  show() {
    this.pendingRequests++;
    if (this.pendingRequests === 1) {
      this.state.next(true);
    }
  }

  hide() {
    if (this.pendingRequests > 0) {
      this.pendingRequests--;
    }
    if (this.pendingRequests === 0) {
      this.state.next(false);
    }
  }

  trackPromise<T>(promise: Promise<T>): Promise<T> {
    this.show();
    return promise.finally(() => this.hide());
  }

  reset() {
    this.pendingRequests = 0;
    this.state.next(false);
  }
}
