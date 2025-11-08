import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { ProfilesService } from '../core/services/profiles';
import { MessagingService } from '../core/services/messaging';
import { AuthStore } from '../core/store/auth.store';
import { TimeAgoPipe } from '../shared/time-ago.pipe';
import { firebaseServices } from '../app.config';
import { CITY_OPTIONS, CityOption } from '../core/models/cities';

@Component({
  selector: 'app-search-users',
  standalone: true,
  imports: [CommonModule, FormsModule, TimeAgoPipe],
  templateUrl: './search-users.html',
  styleUrl: './search-users.css',
})
export default class SearchUsers implements OnInit, OnDestroy {
  term = '';
  loading = false;
  error = '';
  results: any[] = [];
  cityFilter = '';
  private cityFilterKey = '';
  private cityCatalog: CityOption[] = CITY_OPTIONS;
  private searchInput$ = new Subject<string>();
  private sub?: Subscription;
  private paramSub?: Subscription;

  constructor(
    private profiles: ProfilesService,
    private messaging: MessagingService,
    private auth: AuthStore,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    this.sub = this.searchInput$
      .pipe(debounceTime(200), distinctUntilChanged())
      .subscribe(value => this.runSearch(value));

    this.paramSub = this.route.queryParamMap.subscribe(params => {
      const term = params.get('term') ?? '';
      this.setCityFilter(params.get('city'));
      if (term && term !== this.term) {
        this.term = term;
        this.searchInput$.next(term);
      } else if (!term) {
        this.term = '';
      }
      if (!term && this.cityFilter) {
        this.results = [];
      }
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    this.paramSub?.unsubscribe();
  }

  private async runSearch(value: string) {
    const query = (value ?? '').trim();
    if (!query) {
      this.results = [];
      this.error = '';
      this.loading = false;
      return;
    }
    if (query.length < 2) {
      this.error = 'Saisis au moins 2 caractères.';
      this.results = [];
      this.loading = false;
      return;
    }
    this.error = '';
    this.loading = true;
    try {
      const normalized = query.toLowerCase();
      const fetched = await this.profiles.searchProfiles(query);
      this.results = fetched
        .filter(user => this.matchesUser(user, normalized))
        .filter(user => this.matchesCity(user));
    } catch {
      this.error = 'Impossible de lancer la recherche pour le moment.';
    } finally {
      this.loading = false;
    }
  }

  onTermChange(value: string) {
    this.term = value;
    this.searchInput$.next(value);
  }

  get buttonLabel() {
    return `Rechercher (${this.results.length})`;
  }

  viewProfile(user: any) {
    this.router.navigate(['/prestataires', user.id]);
  }

  async contact(user: any) {
    if (!user?.id) return;
    const current = this.auth.user$.value || firebaseServices.auth.currentUser;
    if (!current) {
      this.router.navigate(['/login'], { queryParams: { redirect: this.router.url } });
      return;
    }
    const conversationId = await this.messaging.ensureConversation(user.id);
    if (conversationId) {
      this.router.navigate(['/messagerie', conversationId]);
    }
  }

  onSubmit(event: Event) {
    event.preventDefault();
    this.runSearch(this.term);
  }

  private matchesUser(user: any, term: string) {
    if (!term) return true;
    const haystack = [
      user?.pseudo,
      user?.firstname,
      user?.lastname,
      user?.profession,
      user?.city,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(term);
  }

  private matchesCity(user: any) {
    if (!this.cityFilterKey) return true;
    return ((user?.city || '').trim().toLowerCase() === this.cityFilterKey);
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
