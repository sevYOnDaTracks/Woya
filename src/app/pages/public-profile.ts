import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { ProfilesService, GalleryAlbum, UserReview } from '../core/services/profiles';
import { Services } from '../core/services/services';
import { WoyaService } from '../core/models/service.model';
import { MessagingService } from '../core/services/messaging';
import { AuthStore } from '../core/store/auth.store';
import { TimeAgoPipe } from '../shared/time-ago.pipe';
import { firebaseServices } from '../app.config';
import { FavoritesService } from '../core/services/favorites';
import { formatServicePrice } from '../core/utils/price';
import { LoadingIndicatorService } from '../core/services/loading-indicator.service';

type ProfileTab = 'services' | 'gallery' | 'reviews' | 'about';
type ReviewWithState = UserReview & {
  likesCount: number;
  currentUserLiked: boolean;
  isEdited: boolean;
  isOwnReview: boolean;
};

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
  galleries: GalleryAlbum[] = [];
  reviews: ReviewWithState[] = [];
  averageRating = 0;
  activeTab: ProfileTab = 'services';
  loading = true;
  reviewForm = { rating: 0, comment: '' };
  submittingReview = false;
  reviewError = '';
  replyForms: Record<string, string> = {};
  replySubmitting: Record<string, boolean> = {};
  likeSubmitting: Record<string, boolean> = {};
  favoriteId: string | null = null;
  favoriteLoading = false;
  favoriteError = '';
  editingReviewId: string | null = null;
  deletingReviewId: string | null = null;
  private currentUserId: string | null = null;
  private subs: Subscription[] = [];
  private viewedUid: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private profilesService: ProfilesService,
    private servicesApi: Services,
    private messaging: MessagingService,
    private favorites: FavoritesService,
    private auth: AuthStore,
    private router: Router,
    private loadingIndicator: LoadingIndicatorService,
  ) {}

  ngOnInit() {
    const authSub = this.auth.user$.subscribe(user => {
      this.currentUserId = user?.uid || firebaseServices.auth.currentUser?.uid || null;
    });
    this.subs.push(authSub);

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
    return !!this.currentUserId && this.profile && this.currentUserId === this.profile.id;
  }

  get canReview() {
    return !!this.currentUserId && !this.isOwnProfile;
  }

  get isLoggedIn() {
    return !!this.currentUserId;
  }

  get isEditingReview() {
    return !!this.editingReviewId;
  }

  get reviewSubmitLabel() {
    return this.editingReviewId ? 'Mettre à jour mon avis' : 'Publier mon avis';
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
      await this.loadReviews(this.viewedUid);
      await this.syncReviewState();
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

  trackByReview(_: number, review: ReviewWithState) {
    return review.id;
  }

  startEditReview(review: ReviewWithState) {
    this.editingReviewId = review.id;
    this.reviewForm = {
      rating: review.rating,
      comment: review.comment,
    };
    this.reviewError = '';
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  async removeReview(review: ReviewWithState) {
    if (!review?.id) return;
    const confirmDelete =
      typeof confirm === 'function' ? confirm('Supprimer cet avis ?') : true;
    if (!confirmDelete) return;

    this.deletingReviewId = review.id;
    this.reviewError = '';
    try {
      await this.profilesService.deleteReview(review.id);
      if (this.viewedUid) {
        await this.loadReviews(this.viewedUid);
        await this.syncReviewState();
      }
      if (this.editingReviewId === review.id) {
        this.editingReviewId = null;
        this.reviewForm = { rating: 0, comment: '' };
      }
    } catch (error: any) {
      this.reviewError = error?.message || 'Impossible de supprimer cet avis.';
    } finally {
      this.deletingReviewId = null;
    }
  }

  async removeOwnReview() {
    if (!this.editingReviewId) return;
    const review = this.reviews.find(r => r.id === this.editingReviewId);
    if (review) {
      await this.removeReview(review);
    }
  }

  async toggleReviewLike(review: ReviewWithState) {
    if (!review?.id) return;
    if (!this.isLoggedIn) {
      this.router.navigate(['/login'], { queryParams: { redirect: this.router.url } });
      return;
    }
    const nextState = !review.currentUserLiked;
    this.likeSubmitting[review.id] = true;
    try {
      await this.profilesService.toggleReviewLike(review.id, nextState);
      review.currentUserLiked = nextState;
      review.likesCount = Math.max(0, (review.likesCount ?? 0) + (nextState ? 1 : -1));
    } catch (error) {
      console.error('Unable to toggle review like', error);
      this.reviewError = 'Impossible de mettre a jour ton like pour le moment.';
    } finally {
      this.likeSubmitting[review.id] = false;
    }
  }

  async submitReply(review: ReviewWithState) {
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
    this.loadingIndicator.show();
    try {
      if (!this.currentUserId) {
        const immediate = this.auth.user$.value || firebaseServices.auth.currentUser;
        this.currentUserId = immediate?.uid ?? null;
      }
      this.profile = await this.profilesService.getPublicProfile(uid);
      if (!this.profile) {
        this.router.navigate(['/services']);
        return;
      }
      this.services = await this.servicesApi.listByOwner(uid);
      this.galleries = await this.profilesService.getGalleries(uid);
      await this.loadReviews(uid);
      await this.syncReviewState();
      await this.syncFavoriteState();
    } finally {
      this.loading = false;
      this.loadingIndicator.hide();
    }
  }

  private async loadReviews(uid: string) {
    const rawReviews = await this.profilesService.getReviews(uid);
    this.reviews = this.decorateReviews(rawReviews);
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
    if (!this.currentUserId || !this.viewedUid) return;
    const existing = await this.profilesService.getUserReview(this.viewedUid, this.currentUserId);
    if (existing) {
      this.reviewForm.rating = existing.rating;
      this.reviewForm.comment = existing.comment;
      this.editingReviewId = existing.id;
    } else {
      this.editingReviewId = null;
      this.reviewForm = { rating: 0, comment: '' };
    }
  }

  async toggleFavorite() {
    if (this.isOwnProfile || !this.viewedUid) return;
    const current = this.auth.user$.value || firebaseServices.auth.currentUser;
    if (!current) {
      this.router.navigate(['/login'], { queryParams: { redirect: this.router.url } });
      return;
    }
    this.favoriteLoading = true;
    this.favoriteError = '';
    try {
      if (this.favoriteId) {
        await this.favorites.removeFavorite(this.favoriteId);
        this.favoriteId = null;
      } else {
        this.favoriteId = await this.favorites.ensureFavorite(current.uid, this.viewedUid);
      }
    } catch (error) {
      console.error('favorite toggle error', error);
      this.favoriteError = 'Impossible de mettre à jour tes favoris.';
    } finally {
      this.favoriteLoading = false;
    }
  }

  private async syncFavoriteState() {
    const current = this.auth.user$.value || firebaseServices.auth.currentUser;
    if (!current || !this.viewedUid || this.isOwnProfile) {
      this.favoriteId = null;
      return;
    }
    const fav = await this.favorites.findEntry(current.uid, this.viewedUid);
    this.favoriteId = fav?.id ?? null;
  }

  formatPrice(service: WoyaService) {
    return formatServicePrice(service);
  }

  private decorateReviews(reviews: UserReview[]): ReviewWithState[] {
    const currentUid = this.currentUserId;
    return reviews.map(review => {
      const likedBy = review.likedBy ?? [];
      const likesCount = review.likesCount ?? likedBy.length;
      const createdAt = review.createdAt ?? 0;
      const updatedAt = review.updatedAt ?? createdAt;
      return {
        ...review,
        likesCount,
        currentUserLiked: !!currentUid && likedBy.includes(currentUid),
        isEdited: Boolean(updatedAt && createdAt && updatedAt !== createdAt),
        isOwnReview: !!currentUid && review.reviewerId === currentUid,
      };
    });
  }
}
