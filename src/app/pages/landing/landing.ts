import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthStore } from '../../core/store/auth.store';
import { Services } from '../../core/services/services';
import { WoyaService } from '../../core/models/service.model';
import { ProfilesService } from '../../core/services/profiles';

@Component({
  selector: 'app-landing',
  imports: [CommonModule],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing implements OnInit, OnDestroy {
  recentRequests: WoyaService[] = [];
  authModalOpen = false;
  serviceCount = 0;
  serviceStatLabel = 'Aucun service actif';
  searchMode: 'services' | 'providers' = 'services';
  searchTerm = '';
  searchResults: any[] = [];
  searchLoading = false;
  searchError = '';
  private searchDebounce?: ReturnType<typeof setTimeout>;
  private numberFormatter = new Intl.NumberFormat('fr-FR');

  constructor(
    private router: Router,
    private auth: AuthStore,
    private servicesApi: Services,
    private profiles: ProfilesService,
  ) {}

  async ngOnInit() {
    await this.loadRecentRequests();
  }

  ngOnDestroy() {
    if (this.searchDebounce) {
      clearTimeout(this.searchDebounce);
    }
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

  openServiceDetails(serviceId?: string) {
    if (!serviceId) return;
    this.router.navigate(['/services', serviceId]);
  }

  onHeroSearchInput(value: string) {
    this.searchTerm = value;
    this.scheduleHeroSearch();
  }

  setSearchMode(mode: 'services' | 'providers') {
    if (this.searchMode === mode) return;
    this.searchMode = mode;
    this.searchResults = [];
    this.searchError = '';
    if (this.searchTerm.trim().length >= 2) {
      this.scheduleHeroSearch();
    }
  }

  submitHeroSearch() {
    const term = this.searchTerm.trim();
    if (!term) {
      this.searchError = 'Saisis un mot-clé.';
      return;
    }
    if (term.length < 2) {
      this.searchError = 'Tape au moins 2 caractères.';
      return;
    }
    if (this.searchMode === 'services') {
      this.router.navigate(['/global-search'], { queryParams: { term } });
    } else {
      this.router.navigate(['/search-users'], { queryParams: { term } });
    }
  }

  async goToSuggestion(item: any) {
    if (!item) return;
    if (this.searchMode === 'services') {
      this.router.navigate(['/services', item.id]);
    } else {
      this.router.navigate(['/prestataires', item.id]);
    }
  }

  get heroSearchPlaceholder() {
    return this.searchMode === 'services'
      ? 'Ex: coiffure à domicile, baby-sitting, livraison...'
      : 'Nom, pseudo ou métier (ex: Mariam, Plombier)';
  }

  get hasSearchTerm() {
    return this.searchTerm.trim().length >= 2;
  }

  displayProviderName(user: any) {
    if (!user) return 'Prestataire';
    if (user.pseudo) return user.pseudo;
    return [user.firstname, user.lastname].filter(Boolean).join(' ').trim() || 'Prestataire';
  }

  providerSubtitle(user: any) {
    const parts = [user?.profession, user?.city].filter(Boolean);
    return parts.join(' • ') || 'Disponible partout';
  }

  serviceSubtitle(service: WoyaService) {
    const parts = [service.category, service.city].filter(Boolean);
    return parts.join(' • ') || 'Service local';
  }

  private async loadRecentRequests() {
    const all = await this.servicesApi.list();
    this.serviceCount = all.length;
    this.serviceStatLabel = this.formatServiceCount(this.serviceCount);

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

  private scheduleHeroSearch() {
    if (this.searchDebounce) {
      clearTimeout(this.searchDebounce);
    }
    const term = this.searchTerm.trim();
    if (!term) {
      this.searchResults = [];
      this.searchError = '';
      this.searchLoading = false;
      return;
    }
    if (term.length < 2) {
      this.searchResults = [];
      this.searchError = 'Tape au moins 2 caractères.';
      return;
    }
    this.searchError = '';
    this.searchDebounce = setTimeout(() => this.runHeroSearch(term), 350);
  }

  private async runHeroSearch(term: string) {
    const query = term.trim();
    if (query.length < 2) return;
    this.searchLoading = true;
    try {
      let results: any[] = [];
      if (this.searchMode === 'services') {
        results = await this.servicesApi.searchServices(query, 5);
      } else {
        const fetched = await this.profiles.searchProfiles(query);
        results = fetched.slice(0, 5);
      }
      if (query === this.searchTerm.trim()) {
        this.searchResults = results;
      }
    } catch {
      this.searchError = 'Recherche indisponible pour le moment.';
    } finally {
      this.searchLoading = false;
    }
  }

  private formatServiceCount(count: number) {
    if (count <= 0) {
      return 'Aucun service actif';
    }
    if (count > 3000) {
      return 'Plus de 3 000 services actifs';
    }
    if (count === 1) {
      return '1 service actif';
    }
    return `Plus de ${this.numberFormatter.format(count)} services actifs`;
  }

}
