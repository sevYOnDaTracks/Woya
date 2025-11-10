import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { SharedImports } from '../../shared/shared-imports';
import { AuthStore } from '../../core/store/auth.store';
import { Services } from '../../core/services/services';
import { WoyaService } from '../../core/models/service.model';
import { TimeAgoPipe } from '../../shared/time-ago.pipe';
import { firebaseServices } from '../../app.config';
import { formatServicePrice } from '../../core/utils/price';

@Component({
  selector: 'app-my-services',
  standalone: true,
  imports: [CommonModule, RouterLink, TimeAgoPipe, ...SharedImports],
  templateUrl: './my-services.html',
  styleUrl: './my-services.css'
})
export default class MyServices implements OnInit, OnDestroy {

  loading = true;
  deletingId: string | null = null;
  togglingId: string | null = null;
  services: WoyaService[] = [];
  private authSub?: Subscription;

  constructor(
    private auth: AuthStore,
    private servicesApi: Services,
    private router: Router
  ) {}

  async ngOnInit() {
    const user = this.auth.user$.value || firebaseServices.auth.currentUser;
    if (user) {
      await this.loadServices(user.uid);
    } else {
      this.authSub = this.auth.user$.subscribe(async current => {
        if (current) {
          await this.loadServices(current.uid);
        }
      });
    }
  }

  ngOnDestroy() {
    this.authSub?.unsubscribe();
  }

  private async loadServices(ownerId: string) {
    this.loading = true;
    try {
      const list = await this.servicesApi.listByOwner(ownerId);
      this.services = list.map(service => {
        if ((service.createdAt as any)?.seconds) {
          return { ...service, createdAt: (service.createdAt as any).seconds * 1000 };
        }
        return service;
      });
    } finally {
      this.loading = false;
    }
  }

  editService(service: WoyaService) {
    if (!service.id) { return; }
    this.router.navigate(['/services', service.id, 'edit']);
  }

  viewService(service: WoyaService) {
    if (!service.id) { return; }
    this.router.navigate(['/services', service.id]);
  }

  async deleteService(service: WoyaService) {
    if (!service.id) return;
    const confirmed = window.confirm('Supprimer définitivement ce service ?');
    if (!confirmed) return;

    this.deletingId = service.id;
    try {
      await this.servicesApi.remove(service.id);
      this.services = this.services.filter(s => s.id !== service.id);
    } finally {
      this.deletingId = null;
    }
  }

  async toggleVisibility(service: WoyaService) {
    if (!service.id) return;
    this.togglingId = service.id;
    try {
      const next = service.isActive === false;
      await this.servicesApi.update(service.id, { isActive: next });
      service.isActive = next;
    } finally {
      this.togglingId = null;
    }
  }

  trackByService(_index: number, service: WoyaService) {
    return service.id;
  }

  formatPrice(service: WoyaService) {
    return formatServicePrice(service);
  }
}
