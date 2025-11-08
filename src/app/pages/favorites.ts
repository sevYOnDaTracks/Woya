import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { FavoritesService, FavoriteEntry } from '../core/services/favorites';
import { ProfilesService } from '../core/services/profiles';
import { MessagingService } from '../core/services/messaging';
import { AuthStore } from '../core/store/auth.store';
import { firebaseServices } from '../app.config';

@Component({
  selector: 'app-favorites',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './favorites.html',
  styleUrl: './favorites.css',
})
export default class FavoritesPage implements OnInit, OnDestroy {
  loading = true;
  entries: Array<FavoriteEntry & { provider?: any }> = [];
  private authSub?: Subscription;
  private ownerId: string | null = null;

  constructor(
    private favorites: FavoritesService,
    private profiles: ProfilesService,
    private messaging: MessagingService,
    private auth: AuthStore,
    private router: Router,
  ) {}

  ngOnInit() {
    const user = this.auth.user$.value;
    if (user?.uid) {
      this.ownerId = user.uid;
      this.load();
    } else {
      this.authSub = this.auth.user$.subscribe(current => {
        if (current?.uid) {
          this.ownerId = current.uid;
          this.load();
        }
      });
    }
  }

  ngOnDestroy() {
    this.authSub?.unsubscribe();
  }

  async contact(entry: FavoriteEntry & { provider?: any }) {
    if (!entry.providerId) return;
    const current = this.auth.user$.value || firebaseServices.auth.currentUser;
    if (!current) {
      this.router.navigate(['/login'], { queryParams: { redirect: this.router.url } });
      return;
    }
    const conversationId = await this.messaging.ensureConversation(entry.providerId);
    if (conversationId) {
      this.router.navigate(['/messagerie', conversationId]);
    }
  }

  async remove(entry: FavoriteEntry) {
    await this.favorites.removeFavorite(entry.id);
    this.entries = this.entries.filter(item => item.id !== entry.id);
  }

  private async load() {
    if (!this.ownerId) return;
    this.loading = true;
    try {
      const raw = await this.favorites.list(this.ownerId);
      const providers = await Promise.all(
        raw.map(async entry => ({ ...entry, provider: await this.profiles.getPublicProfile(entry.providerId) })),
      );
      this.entries = providers.filter(item => !!item.provider);
    } finally {
      this.loading = false;
    }
  }

  displayName(user: any) {
    if (!user) return 'Prestataire';
    if (user.pseudo) return user.pseudo;
    return [user.firstname, user.lastname].filter(Boolean).join(' ').trim() || 'Prestataire';
  }
}
