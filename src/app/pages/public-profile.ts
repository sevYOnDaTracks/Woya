import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { ProfilesService, GalleryItem, UserReview } from '../core/services/profiles';
import { Services } from '../core/services/services';
import { WoyaService } from '../core/models/service.model';
import { MessagingService } from '../core/services/messaging';
import { AuthStore } from '../core/store/auth.store';
import { TimeAgoPipe } from '../shared/time-ago.pipe';
import { firebaseServices } from '../app.config';

type ProfileTab = 'services' | 'gallery' | 'reviews' | 'about';

@Component({
  selector: 'app-public-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, TimeAgoPipe],
  templateUrl: './public-profile.html',
  styleUrl: './public-profile.css',
})
export default class PublicProfile implements OnInit, OnDestroy {
  profile: any = null;
  services: WoyaService[] = [];
  gallery: GalleryItem[] = [];
  reviews: UserReview[] = [];
  averageRating = 0;
  activeTab: ProfileTab = 'services';
  loading = true;
  reviewForm = { rating: 0, comment: '' };
  submittingReview = false;
  reviewError = '';
  replyForms: Record<string, string> = {};
  replySubmitting: Record<string, boolean> = {};
  private subs: Subscription[] = [];
  private viewedUid: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private profilesService: ProfilesService,
    private servicesApi: Services,
    private messaging: MessagingService,
    private auth: AuthStore,
    private router: Router,
  ) {}

  ngOnInit() {
    const sub = this.route.paramMap.subscribe(params => {
      const uid = params.get('id');
      if (!uid) {
        this.router.navigate(['/services']);
        return;
      }
      this.viewedUid = uid;
      this.loadProfile(uid);
    });
    this.subs.push(sub);
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
  }

  get isOwnProfile() {
    const current = this.auth.user$.value;
    return current && this.profile && current.uid === this.profile.id;
  }

  get canReview() {
    const current = this.auth.user$.value;
    return !!current && !this.isOwnProfile;
  }

  get isLoggedIn() {
    return !!this.auth.user$.value;
  }

  switchTab(tab: ProfileTab) {
    this.activeTab = tab;
  }

  async submitReview() {
    if (!this.viewedUid || !this.canReview) {
      this.router.navigate(['/login'], { queryParams: { redirect: this.router.url } });
      return;
    }
    if (this.reviewForm.rating < 1) {
      this.reviewError = 'Choisis une note.';
      return;
    }
    this.reviewError = '';
    this.submittingReview = true;
    try {
      await this.profilesService.saveReview(this.viewedUid, this.reviewForm.rating, this.reviewForm.comment);
      this.reviewForm = { rating: 0, comment: '' };
      await this.loadReviews(this.viewedUid);
    } catch (error: any) {
      this.reviewError = error?.message || 'Impossible d\'enregistrer ton avis pour le moment.';
    } finally {
      this.submittingReview = false;
    }
  }

  async contactUser() {
    if (!this.viewedUid || this.isOwnProfile) return;
    const current = this.auth.user$.value || firebaseServices.auth.currentUser;
    if (!current) {
      this.router.navigate(['/login'], { queryParams: { redirect: this.router.url } });
      return;
    }
    const conversationId = await this.messaging.ensureConversation(this.viewedUid);
    if (conversationId) {
      this.router.navigate(['/messagerie', conversationId]);
    }
  }

  viewService(service: WoyaService) {
    if (service?.id) {
      this.router.navigate(['/services', service.id]);
    }
  }

  get stars() {
    return [1, 2, 3, 4, 5];
  }

  get averageRatingLabel() {
    return this.reviews.length ? this.averageRating.toFixed(1) : '—';
  }

  trackByReview(_: number, review: UserReview) {
    return review.id;
  }

  async submitReply(review: UserReview) {
    if (!this.viewedUid || !review?.id) return;
    const message = (this.replyForms[review.id] || '').trim();
    if (!message) return;
    this.reviewError = '';
    this.replySubmitting[review.id] = true;
    try {
      await this.profilesService.addReviewReply(review.id, message);
      this.replyForms[review.id] = '';
      await this.loadReviews(this.viewedUid);
    } catch (error: any) {
      this.reviewError = error?.message || 'Impossible d\'ajouter une réponse.';
    } finally {
      this.replySubmitting[review.id] = false;
    }
  }

  private async loadProfile(uid: string) {
    this.loading = true;
    try {
      this.profile = await this.profilesService.getPublicProfile(uid);
      if (!this.profile) {
        this.router.navigate(['/services']);
        return;
      }
      this.services = await this.servicesApi.listByOwner(uid);
      this.gallery = await this.profilesService.getGallery(uid);
      await this.loadReviews(uid);
      await this.syncReviewState();
    } finally {
      this.loading = false;
    }
  }

  private async loadReviews(uid: string) {
    this.reviews = await this.profilesService.getReviews(uid);
    if (this.reviews.length) {
      const total = this.reviews.reduce((sum, review) => sum + (review.rating ?? 0), 0);
      this.averageRating = total / this.reviews.length;
    } else {
      this.averageRating = 0;
    }
    this.reviews.forEach(review => {
      if (!(review.id in this.replyForms)) {
        this.replyForms[review.id] = '';
      }
    });
  }

  private async syncReviewState() {
    const current = this.auth.user$.value;
    if (!current || !this.viewedUid) return;
    const existing = await this.profilesService.getUserReview(this.viewedUid, current.uid);
    if (existing) {
      this.reviewForm.rating = existing.rating;
      this.reviewForm.comment = existing.comment;
    }
  }
}
