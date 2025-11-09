import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AdminAuthService } from '../core/store/admin-auth.service';

@Component({
  selector: 'app-admin-navbar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="admin-nav">
      <div class="admin-nav__brand" (click)="router.navigate(['/admin/panel'])">
        <span class="admin-nav__logo">Woya!</span>
        <span class="admin-nav__label">Console</span>
      </div>
      <div class="admin-nav__actions">
        <button type="button" class="admin-nav__link" (click)="router.navigate(['/'])">
          Site public
        </button>
        <button *ngIf="isAuthenticated" type="button" class="admin-nav__logout" (click)="logout()">
          Déconnexion
        </button>
      </div>
    </header>
  `,
  styles: [
    `
      .admin-nav {
        position: sticky;
        top: 0;
        z-index: 40;
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #fff;
        border-bottom: 1px solid #ffe0bf;
        padding: 1rem 1.5rem;
        box-shadow: 0 6px 18px rgba(255, 122, 0, 0.08);
      }
      .admin-nav__brand {
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
        cursor: pointer;
      }
      .admin-nav__logo {
        font-size: 1.5rem;
        font-weight: 700;
        color: #ff7a00;
      }
      .admin-nav__label {
        font-size: 0.65rem;
        text-transform: uppercase;
        letter-spacing: 0.5em;
        color: #64748b;
      }
      .admin-nav__actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .admin-nav__link,
      .admin-nav__logout {
        border-radius: 9999px;
        padding: 0.4rem 1.2rem;
        font-size: 0.85rem;
        font-weight: 600;
        border: 1px solid transparent;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .admin-nav__link {
        border-color: #e2e8f0;
        color: #475569;
        background: #fff;
      }
      .admin-nav__link:hover {
        border-color: #ffddc0;
        color: #ff7a00;
      }
      .admin-nav__logout {
        background: #ef4444;
        color: #fff;
        border-color: #ef4444;
      }
      .admin-nav__logout:hover {
        background: #dc2626;
        border-color: #dc2626;
      }
    `,
  ],
})
export class AdminNavbar {
  constructor(public router: Router, private adminAuth: AdminAuthService) {}

  get isAuthenticated() {
    return this.adminAuth.isAuthenticated();
  }

  logout() {
    this.adminAuth.logout();
    this.router.navigate(['/admin']);
  }
}
