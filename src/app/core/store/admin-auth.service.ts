import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly storageKey = 'woya-admin-token';
  private readonly expectedToken = 'woya-root';
  private readonly credentials = {
    email: 'admin@woya.app',
    password: 'admin123!',
  };

  private state = new BehaviorSubject<boolean>(this.restoreSession());
  readonly isAuthenticated$ = this.state.asObservable();

  isAuthenticated() {
    return this.state.value;
  }

  login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (
      normalizedEmail === this.credentials.email &&
      password === this.credentials.password
    ) {
      this.persistToken();
      this.state.next(true);
      return true;
    }
    return false;
  }

  logout() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(this.storageKey);
    }
    this.state.next(false);
  }

  private restoreSession() {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(this.storageKey) === this.expectedToken;
  }

  private persistToken() {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(this.storageKey, this.expectedToken);
  }
}
