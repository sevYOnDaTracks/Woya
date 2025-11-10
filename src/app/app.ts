import { Component, OnDestroy, signal } from '@angular/core';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { Navbar } from "./shared/navbar/navbar";
import { Footer } from "./shared/footer/footer";
import { ChatFab } from "./shared/chat-fab";
import { BookingAlerts } from "./shared/booking-alerts";
import { AdminNavbar } from './shared/admin-navbar';
import { CommonModule } from '@angular/common';
import { LoadingOverlay } from './shared/loading-overlay/loading-overlay';
import { LoadingIndicatorService } from './core/services/loading-indicator.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, Navbar, Footer, ChatFab, BookingAlerts, AdminNavbar, LoadingOverlay],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnDestroy {
  protected readonly title = signal('woya');
  protected readonly showPublicShell = signal(true);
  private routerSub?: Subscription;

  constructor(private router: Router, private loadingIndicator: LoadingIndicatorService) {
    this.updateShell(this.router.url);
    this.routerSub = this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        this.loadingIndicator.show();
      }
      if (event instanceof NavigationEnd) {
        this.updateShell(event.urlAfterRedirects);
        this.loadingIndicator.hide();
      }
      if (event instanceof NavigationCancel || event instanceof NavigationError) {
        this.loadingIndicator.hide();
      }
    });
  }

  ngOnDestroy() {
    this.routerSub?.unsubscribe();
    this.loadingIndicator.reset();
  }

  private updateShell(url: string) {
    const cleanUrl = (url || '').split('?')[0];
    const isAdminRoute = cleanUrl === '/admin' || cleanUrl.startsWith('/admin/');
    this.showPublicShell.set(!isAdminRoute);
  }
}
