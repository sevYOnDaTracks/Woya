import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { SharedImports } from '../shared/shared-imports';
import { Services } from '../core/services/services';
import { ProfilesService } from '../core/services/profiles';
import { WoyaService } from '../core/models/service.model';
import { CITY_OPTIONS, CityOption } from '../core/models/cities';

type SearchSuggestionKind = 'service' | 'user';

interface SearchSuggestion {
  id: string;
  label: string;
  description: string;
  avatar?: string | null;
  route: any[];
  kind: SearchSuggestionKind;
}

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
  suggestions: SearchSuggestion[] = [];
  suggestionsOpen = false;
  suggestionsLoading = false;
  private suggestionDebounce?: any;
  private autoSearchDebounce?: any;
  private suggestionRequestId = 0;
  private readonly mobileSearchMin = 2;

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
    if (this.suggestionDebounce) {
      clearTimeout(this.suggestionDebounce);
    }
    if (this.autoSearchDebounce) {
      clearTimeout(this.autoSearchDebounce);
    }
  }

  get hasQuery() {
    return this.term.trim().length > 0;
  }

  async search() {
    const query = this.term.trim();
    if (!query) {
      this.servicesResults = [];
      this.userResults = [];
      this.loading = false;
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
    this.scheduleAutoSearch();
    this.scheduleSuggestionFetch();
  }

  onMobileSearchFocus() {
    if (this.suggestions.length) {
      this.suggestionsOpen = true;
    }
  }

  onMobileSearchBlur() {
    setTimeout(() => this.closeSuggestions(), 150);
  }

  submitMobileSearch() {
    this.navigateWithTerm(this.term);
    this.closeSuggestions();
  }

  selectSuggestion(suggestion: SearchSuggestion) {
    this.router.navigate(suggestion.route);
    this.suggestions = [];
    this.closeSuggestions();
  }

  closeSuggestions() {
    this.suggestionsOpen = false;
    this.suggestionsLoading = false;
    if (this.suggestionDebounce) {
      clearTimeout(this.suggestionDebounce);
      this.suggestionDebounce = undefined;
    }
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

  private scheduleAutoSearch() {
    if (this.autoSearchDebounce) {
      clearTimeout(this.autoSearchDebounce);
    }
    this.autoSearchDebounce = setTimeout(() => {
      this.navigateWithTerm(this.term);
    }, 400);
  }

  private navigateWithTerm(raw: string) {
    const trimmed = raw.trim();
    const currentTerm = this.route.snapshot.queryParamMap.get('term') ?? '';
    if (trimmed === currentTerm) {
      if (!trimmed) {
        this.servicesResults = [];
        this.userResults = [];
      }
      return;
    }
    const queryParams: Record<string, string | null> = { term: trimmed || null };
    if (this.cityFilter) {
      queryParams['city'] = this.cityFilter;
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private scheduleSuggestionFetch() {
    if (this.suggestionDebounce) {
      clearTimeout(this.suggestionDebounce);
    }
    const trimmed = this.term.trim();
    if (trimmed.length < this.mobileSearchMin) {
      this.suggestions = [];
      this.suggestionsOpen = false;
      this.suggestionsLoading = false;
      this.suggestionRequestId++;
      return;
    }
    this.suggestionDebounce = setTimeout(() => this.fetchMobileSuggestions(trimmed), 250);
  }

  private async fetchMobileSuggestions(term: string) {
    const requestId = ++this.suggestionRequestId;
    this.suggestionsLoading = true;
    this.suggestionsOpen = true;
    try {
      const [services, users] = await Promise.all([
        this.servicesApi.searchServices(term, 5),
        this.profiles.searchProfiles(term).then(list => list.slice(0, 5)),
      ]);
      if (requestId !== this.suggestionRequestId) {
        return;
      }
      this.suggestions = [
        ...users.map(user => ({
          id: user.id,
          label: this.displayUserName(user),
          description: user.profession || user.city || 'Prestataire',
          avatar: user.photoURL,
          route: ['/prestataires', user.id],
          kind: 'user' as const,
        })),
        ...services.map(service => ({
          id: service.id!,
          label: service.title,
          description: `${service.category} • ${service.city || 'Ville non renseignée'}`,
          avatar: service.coverUrl,
          route: ['/services', service.id!],
          kind: 'service' as const,
        })),
      ].slice(0, 6);
      this.suggestionsOpen = true;
    } catch (error) {
      console.error('Unable to fetch search suggestions', error);
    } finally {
      if (requestId === this.suggestionRequestId) {
        this.suggestionsLoading = false;
        if (!this.suggestions.length) {
          this.suggestionsOpen = false;
        }
      }
    }
  }
}
