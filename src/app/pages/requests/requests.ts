import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { firebaseServices } from '../../app.config';
import { RequestsService } from '../../core/services/requests';
import { RequestPost } from '../../core/models/request.model';
import { MessagingService } from '../../core/services/messaging';
import { AuthStore } from '../../core/store/auth.store';
import { matchProfessionOption, PROFESSION_OPTIONS } from '../../core/constants/professions';

@Component({
  selector: 'app-requests',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './requests.html',
  styleUrl: './requests.css',
})
export default class RequestsFeed implements OnInit, OnDestroy {
  categories = PROFESSION_OPTIONS;
  form = {
    category: '',
    description: '',
  };
  files: File[] = [];
  previewUrls: string[] = [];
  loading = false;
  feedLoading = false;
  error = '';
  feedError = '';
  requests: RequestPost[] = [];
  private cursor: any = null;
  private sub?: Subscription;
  user: any = null;
  showForm = false;

  constructor(
    private requestsApi: RequestsService,
    private messaging: MessagingService,
    private auth: AuthStore,
    private router: Router,
  ) {}

  ngOnInit() {
    this.sub = this.auth.user$.subscribe(user => (this.user = user));
    this.loadFeed();
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  async loadFeed(loadMore = false) {
    if (this.feedLoading) return;
    this.feedLoading = true;
    this.feedError = '';
    try {
      const result = await this.requestsApi.listLatest({
        pageSize: 10,
        cursor: loadMore ? this.cursor : null,
        category: this.form.category || undefined,
      });
      this.cursor = result.cursor;
      this.requests = loadMore ? [...this.requests, ...result.items] : result.items;
    } catch (error) {
      this.feedError = 'Impossible de charger les annonces.';
    } finally {
      this.feedLoading = false;
    }
  }

  onCategoryFilterChange(value: string) {
    this.form.category = value;
    this.cursor = null;
    this.loadFeed(false);
  }

  selectPhotos(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []).slice(0, 3);
    this.files = files;
    this.previewUrls = [];
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        this.previewUrls.push(reader.result as string);
      };
      reader.readAsDataURL(file);
    });
  }

  async submit() {
    if (!this.user) {
      this.error = 'Connecte-toi pour publier une annonce.';
      return;
    }
    if (this.user?.profileLoading) {
      await this.auth.waitForProfileReady().catch(() => null);
      this.user = this.auth.user$.value;
    }
    const gap = this.getProfileGap(this.user);
    if (gap.missing.length) {
      this.error = `Complète ton profil (${gap.missing.join(', ')}) avant de publier.`;
      return;
    }
    if (!this.form.category) {
      this.error = 'Choisis une catégorie.';
      return;
    }
    if (!this.form.description || this.form.description.trim().length < 10) {
      this.error = 'Ajoute une description (10 caractères min).';
      return;
    }
    this.error = '';
    this.loading = true;
    try {
      await this.requestsApi.create({
        category: this.form.category,
        description: this.form.description,
        photos: this.files,
        owner: {
          uid: this.user.uid,
          pseudo: this.user.pseudo,
          city: this.user.city,
        },
      });
      this.form.description = '';
      this.files = [];
      this.previewUrls = [];
      this.cursor = null;
      await this.loadFeed(false);
      // Optionnel : notifier les prestataires via messagerie (simplifié)
      // await this.notifyProviders(this.form.category, this.form.description);
    } catch (error: any) {
      this.error = 'Impossible de publier cette annonce.';
    } finally {
      this.loading = false;
    }
  }

  async contactOwner(request: RequestPost) {
    if (!this.user) {
      this.router.navigate(['/login'], { queryParams: { redirect: `/annonces` } });
      return;
    }
    const convoId = await this.messaging.ensureConversation(request.ownerId);
    if (convoId) {
      await this.messaging.sendMessage(convoId, `Bonjour, je suis intéressé par ton annonce: "${request.description.slice(0, 80)}..."`);
      this.router.navigate(['/messagerie', convoId]);
    }
  }

  get hasMore() {
    return !!this.cursor;
  }

  private hasProfileGap(user: any | null | undefined) {
    return this.getProfileGap(user).missing.length > 0;
  }

  private getProfileGap(user: any | null | undefined) {
    if (!user || user.profileLoading) {
      return { missing: ['profil non chargé'] };
    }
    const required: [keyof RequestPost | string, string][] = [
      ['pseudo', 'pseudo'],
      ['firstname', 'nom'],
      ['lastname', 'prénom'],
      ['phone', 'téléphone'],
      ['city', 'ville'],
      ['profession', 'profession'],
    ];
    const missing = required
      .filter(([key]) => {
        const value = (user as any)[key];
        return !value || (typeof value === 'string' && !value.trim());
      })
      .map(([, label]) => label);
    return { missing };
  }
}
