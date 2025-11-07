import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthStore } from '../../core/store/auth.store';
import { Services } from '../../core/services/services';
import { WoyaService } from '../../core/models/service.model';

@Component({
  selector: 'app-landing',
  imports: [CommonModule],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing implements OnInit {
  recentRequests: WoyaService[] = [];
  authModalOpen = false;

  constructor(private router: Router, private auth: AuthStore, private servicesApi: Services) {}

  async ngOnInit() {
    await this.loadRecentRequests();
  }

  exploreServices() {
    const user = this.auth.user$.value;
    if (user) {
      this.router.navigate(['/services']);
      return;
    }
    this.router.navigate(['/login']);
  }

  publishService() {
    const user = this.auth.user$.value;
    if (user) {
      this.router.navigate(['/services/new']);
      return;
    }
    this.router.navigate(['/login'], { queryParams: { redirect: '/services/new' } });
  }

  viewRequests() {
    const user = this.auth.user$.value;
    if (user) {
      this.router.navigate(['/services']);
      return;
    }
    this.authModalOpen = true;
  }

  closeAuthModal() {
    this.authModalOpen = false;
  }

  goToLoginForRequests() {
    this.authModalOpen = false;
    this.router.navigate(['/login'], { queryParams: { redirect: '/services' } });
  }

  private async loadRecentRequests() {
    const all = await this.servicesApi.list();
    const normalized = all
      .map(service => {
        if ((service.createdAt as any)?.seconds) {
          service.createdAt = (service.createdAt as any).seconds * 1000;
        }
        return service;
      })
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

    this.recentRequests = normalized.slice(0, 3);
  }

}
