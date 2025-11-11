import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthStore } from '../../core/store/auth.store';
import { ProfilesService, UserReview } from '../../core/services/profiles';
import { TimeAgoPipe } from '../../shared/time-ago.pipe';
import { BookingsService } from '../../core/services/bookings';
import { ServiceBooking } from '../../core/models/booking.model';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, TimeAgoPipe],
  templateUrl: './notifications.html',
  styleUrl: './notifications.css',
})
export default class NotificationsPage implements OnInit, OnDestroy {
  @Input() mode: 'page' | 'panel' = 'page';
  @Output() countChange = new EventEmitter<number>();
  loading = true;
  notifications: NotificationItem[] = [];

  private subs: Subscription[] = [];
  private currentUid: string | null = null;
  private dismissedNotificationIds = new Set<string>();
  private lastSeenCache = 0;

  constructor(
    private auth: AuthStore,
    private profiles: ProfilesService,
    private bookings: BookingsService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.subs.push(
      this.auth.user$.subscribe(user => {
        this.currentUid = user?.uid ?? null;
        if (!this.currentUid) {
          this.notifications = [];
          this.emitCount();
          this.router.navigate(['/login'], { queryParams: { redirect: '/notifications' } });
          return;
        }
        this.loadDismissedNotifications();
        this.loadNotifications();
      }),
    );
  }

  ngOnDestroy() {
    this.subs.forEach(sub => sub.unsubscribe());
  }

  async loadNotifications() {
    if (!this.currentUid) return;
    this.loading = true;
    try {
      const [reviews, providerBookings, clientBookings] = await Promise.all([
        this.profiles.getReviews(this.currentUid),
        this.bookings.listForProvider(this.currentUid),
        this.bookings.listForClient(this.currentUid),
      ]);

      const lastSeen = this.getLastSeen();
      const reviewNotifications = reviews.map(review => this.mapReviewNotification(review, lastSeen));
      const providerNotifications = providerBookings.map(booking =>
        this.mapBookingNotification(booking, 'provider', lastSeen),
      );
      const clientNotifications = clientBookings.map(booking =>
        this.mapBookingNotification(booking, 'client', lastSeen),
      );

      const merged = [...reviewNotifications, ...providerNotifications, ...clientNotifications]
        .filter(notification => !this.dismissedNotificationIds.has(notification.id))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

      this.notifications = merged;
      const newest = this.notifications.length ? this.notifications[0].createdAt ?? Date.now() : Date.now();
      this.setLastSeen(newest);
      this.emitCount();
    } finally {
      this.loading = false;
    }
  }

  openNotification(notification: NotificationItem) {
    if (!notification.route) return;
    this.router.navigate(notification.route);
    this.setLastSeen(Date.now());
  }

  dismissNotification(notification: NotificationItem) {
    this.dismissedNotificationIds.add(notification.id);
    this.notifications = this.notifications.filter(item => item.id !== notification.id);
    this.persistDismissedNotifications();
    this.emitCount();
  }

  private mapReviewNotification(review: UserReview, lastSeen: number): NotificationItem {
    const createdAt = this.extractTimestamp(review.createdAt);
    const reviewerId =
      review.reviewerId || (review.reviewer as any)?.uid || (review.reviewer as any)?.id || null;
    const identity =
      review.reviewer?.pseudo ||
      [review.reviewer?.firstname, review.reviewer?.lastname].filter(Boolean).join(' ').trim();
    const name = identity && identity.length ? identity : 'Un client';
    const comment = (review.comment || '').trim();
    const description = comment.length ? comment : 'Nouvel avis reçu.';

    return {
      id: `review-${review.id}`,
      kind: 'review',
      title: `${name} a laissé un avis`,
      description,
      createdAt,
      isNew: createdAt > lastSeen,
      route: reviewerId ? ['/prestataires', reviewerId] : ['/notifications'],
      actionLabel: reviewerId ? 'Voir le profil' : 'Ouvrir',
    };
  }

  private emitCount() {
    this.countChange.emit(this.notifications.length);
  }

  private mapBookingNotification(
    booking: ServiceBooking,
    role: 'provider' | 'client',
    lastSeen: number,
  ): NotificationItem {
    const status = booking.status;
    const serviceTitle = booking.serviceTitle || 'Service réservé';
    const createdAt = booking.updatedAt ?? booking.createdAt ?? Date.now();
    const title =
      status === 'pending'
        ? role === 'provider'
          ? 'Nouvelle demande'
          : 'Demande envoyée'
        : status === 'confirmed'
        ? 'Réservation confirmée'
        : 'Réservation annulée';
    const description =
      status === 'pending'
        ? role === 'provider'
          ? `Nouvelle demande pour "${serviceTitle}"`
          : `Ta demande pour "${serviceTitle}" est en attente`
        : status === 'confirmed'
        ? role === 'provider'
          ? `"${serviceTitle}" a été confirmé`
          : `Ta réservation "${serviceTitle}" est confirmée`
        : role === 'provider'
        ? `Le rendez-vous "${serviceTitle}" a été annulé`
        : `Ta réservation "${serviceTitle}" a été annulée`;

    return {
      id: `booking-${role}-${booking.id}`,
      kind: 'booking',
      title,
      description,
      createdAt,
      isNew: createdAt > lastSeen,
      route: [role === 'provider' ? '/mes-rendez-vous' : '/mes-reservations'],
      actionLabel: 'Voir les détails',
    };
  }

  private loadDismissedNotifications() {
    this.dismissedNotificationIds.clear();
    const stored = this.readStorage('dismissed');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as string[];
        parsed.forEach(id => this.dismissedNotificationIds.add(id));
      } catch {
        // ignore invalid JSON
      }
    }
  }

  private persistDismissedNotifications() {
    this.writeStorage('dismissed', JSON.stringify(Array.from(this.dismissedNotificationIds)));
  }

  private getLastSeen() {
    if (this.lastSeenCache) {
      return this.lastSeenCache;
    }
    const stored = this.readStorage('lastSeen');
    const value = stored ? Number(stored) : 0;
    this.lastSeenCache = Number.isFinite(value) ? value : 0;
    return this.lastSeenCache;
  }

  private setLastSeen(timestamp: number) {
    this.lastSeenCache = timestamp;
    this.writeStorage('lastSeen', String(timestamp));
  }

  private readStorage(suffix: string) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    return window.localStorage.getItem(this.storageKey(suffix));
  }

  private writeStorage(suffix: string, value: string) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    window.localStorage.setItem(this.storageKey(suffix), value);
  }

  private storageKey(suffix: string) {
    return this.currentUid ? `notifications:${suffix}:${this.currentUid}` : `notifications:${suffix}`;
  }

  private extractTimestamp(value: any): number {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if ((value as any).seconds) return (value as any).seconds * 1000;
    return Number(value) || 0;
  }
}

interface NotificationItem {
  id: string;
  kind: 'review' | 'booking';
  title: string;
  description: string;
  createdAt: number;
  isNew: boolean;
  route?: any[];
  actionLabel: string;
}
