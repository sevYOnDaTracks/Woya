import { Component, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Navbar } from "./shared/navbar/navbar";
import { Footer } from "./shared/footer/footer";
import { ChatFab } from "./shared/chat-fab";
import { BookingAlerts } from "./shared/booking-alerts";
import { AdminNavbar } from './shared/admin-navbar';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, Navbar, Footer, ChatFab, BookingAlerts, AdminNavbar],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('woya');
  protected readonly showPublicShell = signal(true);

  constructor(private router: Router) {
    this.updateShell(this.router.url);
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.updateShell(event.urlAfterRedirects);
      }
    });
  }

  private updateShell(url: string) {
    const cleanUrl = (url || '').split('?')[0];
    const isAdminRoute = cleanUrl === '/admin' || cleanUrl.startsWith('/admin/');
    this.showPublicShell.set(!isAdminRoute);
  }
}
