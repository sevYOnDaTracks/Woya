import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { ProfilesService } from '../core/services/profiles';
import { MessagingService } from '../core/services/messaging';
import { AuthStore } from '../core/store/auth.store';
import { TimeAgoPipe } from '../shared/time-ago.pipe';
import { firebaseServices } from '../app.config';

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
  private searchInput$ = new Subject<string>();
  private sub?: Subscription;

  constructor(
    private profiles: ProfilesService,
    private messaging: MessagingService,
    private auth: AuthStore,
    private router: Router,
  ) {}

  ngOnInit() {
    this.sub = this.searchInput$
      .pipe(debounceTime(200), distinctUntilChanged())
      .subscribe(value => this.runSearch(value));
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
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
      this.results = fetched.filter(user => this.matchesUser(user, normalized));
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
}
