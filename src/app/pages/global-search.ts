import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { SharedImports } from '../shared/shared-imports';
import { Services } from '../core/services/services';
import { ProfilesService } from '../core/services/profiles';
import { WoyaService } from '../core/models/service.model';
import { CITY_OPTIONS, CityOption } from '../core/models/cities';

@Component({
  selector: 'app-global-search',
  standalone: true,
  imports: [...SharedImports, RouterLink],
  templateUrl: './global-search.html',
  styleUrl: './global-search.css',
})
export default class GlobalSearch implements OnInit, OnDestroy {
  term = '';
  cityFilter = '';
  private cityFilterKey = '';
  private cityCatalog: CityOption[] = CITY_OPTIONS;
  loading = false;
  servicesResults: WoyaService[] = [];
  userResults: any[] = [];
  private sub?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private servicesApi: Services,
    private profiles: ProfilesService,
  ) {}

  ngOnInit() {
    this.sub = this.route.queryParamMap.subscribe(params => {
      this.term = params.get('term') ?? '';
      this.setCityFilter(params.get('city'));
      this.search();
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  async search() {
    const query = this.term.trim();
    if (!query) {
      this.servicesResults = [];
      this.userResults = [];
      return;
    }
    this.loading = true;
    try {
      const [services, users] = await Promise.all([
        this.servicesApi.searchServices(query, 20),
        this.profiles.searchProfiles(query),
      ]);
      this.servicesResults = this.applyCityFilterOnServices(services);
      this.userResults = this.applyCityFilterOnUsers(users);
    } finally {
      this.loading = false;
    }
  }

  displayUserName(user: any) {
    if (!user) return 'Utilisateur';
    if (user.pseudo) return user.pseudo;
    return [user.firstname, user.lastname].filter(Boolean).join(' ').trim() || 'Utilisateur';
  }

  onMobileSearchInput(value: string) {
    this.term = value;
  }

  submitMobileSearch() {
    const query = this.term.trim();
    if (!query) return;
    const params: any = { term: query };
    if (this.cityFilter) {
      params.city = this.cityFilter;
    }
    this.router.navigate(['/recherche'], { queryParams: params });
  }

  private applyCityFilterOnServices(services: WoyaService[]) {
    if (!this.cityFilterKey) return services;
    return services.filter(service => (service.city || '').trim().toLowerCase() === this.cityFilterKey);
  }

  private applyCityFilterOnUsers(users: any[]) {
    if (!this.cityFilterKey) return users;
    return users.filter(user => (user.city || '').trim().toLowerCase() === this.cityFilterKey);
  }

  private setCityFilter(value: string | null) {
    const trimmed = (value || '').trim();
    if (!trimmed) {
      this.cityFilter = '';
      this.cityFilterKey = '';
      return;
    }
    const match = this.findCityOption(trimmed);
    const normalized = match?.name || trimmed;
    this.cityFilter = normalized;
    this.cityFilterKey = normalized.toLowerCase();
  }

  private findCityOption(value: string | null): CityOption | undefined {
    const lower = (value || '').trim().toLowerCase();
    if (!lower) return undefined;
    return this.cityCatalog.find(option => {
      if (option.name.toLowerCase() === lower) return true;
      return (option.aliases ?? []).some(alias => alias.toLowerCase() === lower);
    });
  }
}
