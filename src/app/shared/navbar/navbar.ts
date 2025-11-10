import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { RouterLink, Router, RouterLinkActive } from '@angular/router';
import { AuthStore } from '../../core/store/auth.store';
import { CommonModule } from '@angular/common';
import { MessagingService } from '../../core/services/messaging';
import { Subscription } from 'rxjs';
import { Services } from '../../core/services/services';
import { ProfilesService, UserReview } from '../../core/services/profiles';
import {
  collection,
  onSnapshot,
  query,
  where,
  Unsubscribe,
  DocumentData,
  QuerySnapshot,
} from 'firebase/firestore';
import { firebaseServices } from '../../app.config';
import { BookingStatus } from '../../core/models/booking.model';

type MenuSectionKey = 'navigation' | 'client' | 'profile' | 'provider';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, CommonModule, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar implements OnInit, OnDestroy {
  isMenuOpen = false;
  unreadCount = 0;
  userMenuOpen = false;
  logoutConfirmOpen = false;
  mobileProfileMenuOpen = false;
  pendingRequests = 0;
  pendingReservations = 0;
  currentUser: any | null = null;

  private currentUid: string | null = null;
  private authSub?: Subscription;
  private inboxSub?: Subscription;
  private providerBookingsSub?: Unsubscribe;
  private clientBookingsSub?: Unsubscribe;
  searchTerm = '';
  searchResults: SearchResult[] = [];
  searchOpen = false;
  searchLoading = false;
  private searchDebounce?: any;
  private searchMin = 2;
  notifications: NavbarNotification[] = [];
  notificationMenuOpen = false;
  notificationBadgeCount = 0;
  userMenuSections: Record<MenuSectionKey, boolean> = {
    navigation: true,
    client: true,
    profile: true,
    provider: true,
  };
  mobileMenuSections: Record<MenuSectionKey, boolean> = {
    navigation: true,
    client: true,
    profile: true,
    provider: true,
  };
  private reviewNotifications: NavbarNotification[] = [];
  private bookingNotifications: NavbarNotification[] = [];
  private providerSnapshotReady = false;
  private clientSnapshotReady = false;
  private providerBookingStates = new Map<string, BookingDoc>();
  private clientBookingStates = new Map<string, BookingDoc>();
  private notificationsLastSeen = this.getStoredNotificationsLastSeen();

  constructor(
    public auth: AuthStore,
    private router: Router,
    private messaging: MessagingService,
    private services: Services,
    private profiles: ProfilesService,
  ) {}

  ngOnInit(): void {
    this.authSub = this.auth.user$.subscribe(user => {
      this.currentUser = user ?? null;
      const uid = this.currentUser?.uid ?? null;
      if (this.currentUid === uid) {
        if (!uid) {
          this.clearInbox();
          this.closeUserMenu();
        }
        return;
      }

      this.currentUid = uid;
      this.resetNotifications();
      this.clearInbox();
      this.clearBookingCounters();
      if (!this.currentUid) {
        this.currentUser = null;
        this.closeUserMenu();
        return;
      }

      this.bindInbox();
      this.bindBookingCounters();
      this.loadRecentReviews();
    });
  }

  ngOnDestroy(): void {
    this.authSub?.unsubscribe();
    this.clearInbox();
    this.clearBookingCounters();
    this.resetNotifications();
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
    if (this.isMenuOpen) {
      this.closeMobileProfileMenu();
    }
    if (this.isMenuOpen) {
      this.userMenuOpen = false;
      this.logoutConfirmOpen = false;
    }
    if (!this.isMenuOpen) {
      this.logoutConfirmOpen = false;
    }
    this.notificationMenuOpen = false;
  }

  requestLogout() {
    this.logoutConfirmOpen = true;
    this.userMenuOpen = false;
    this.isMenuOpen = false;
    this.closeMobileProfileMenu();
    this.closeNotificationMenu();
  }

  confirmLogout() {
    this.performLogout();
  }

  cancelLogout() {
    this.logoutConfirmOpen = false;
  }

  private performLogout() {
    if (!this.logoutConfirmOpen) return;
    this.auth.logout();
    this.closeUserMenu();
    this.closeNotificationMenu();
    this.isMenuOpen = false;
    this.logoutConfirmOpen = false;
    this.router.navigate(['/']);
  }

  private bindInbox() {
    this.clearInbox();

    if (!this.currentUid) {
      return;
    }

    this.inboxSub = this.messaging.listenInbox(this.currentUid).subscribe({
      next: conversations => {
        this.unreadCount = conversations.reduce((count, conversation) => {
          return count + ((conversation.readBy ?? []).includes(this.currentUid!) ? 0 : 1);
        }, 0);
      },
      error: error => console.error('Unable to load inbox in navbar', error),
    });
  }

  private clearInbox() {
    this.inboxSub?.unsubscribe();
    this.inboxSub = undefined;
    this.unreadCount = 0;
  }

  private bindBookingCounters() {
    this.clearBookingCounters();
    if (!this.currentUid) return;
    const col = collection(firebaseServices.db, 'bookings');

    this.providerBookingsSub = onSnapshot(query(col, where('providerId', '==', this.currentUid)), snapshot =>
      this.handleProviderBookings(snapshot),
    );

    this.clientBookingsSub = onSnapshot(query(col, where('clientId', '==', this.currentUid)), snapshot =>
      this.handleClientBookings(snapshot),
    );
  }

  private clearBookingCounters() {
    this.providerBookingsSub?.();
    this.clientBookingsSub?.();
    this.providerBookingsSub = undefined;
    this.clientBookingsSub = undefined;
    this.pendingRequests = 0;
    this.pendingReservations = 0;
    this.providerSnapshotReady = false;
    this.clientSnapshotReady = false;
    this.providerBookingStates.clear();
    this.clientBookingStates.clear();
  }

  toggleUserMenu() {
    this.userMenuOpen = !this.userMenuOpen;
    if (this.userMenuOpen) {
      this.notificationMenuOpen = false;
    }
  }

  closeUserMenu() {
    this.userMenuOpen = false;
    this.logoutConfirmOpen = false;
  }

  toggleNotificationMenu() {
    this.notificationMenuOpen = !this.notificationMenuOpen;
    if (this.notificationMenuOpen) {
      this.userMenuOpen = false;
      this.logoutConfirmOpen = false;
      this.loadRecentReviews();
      this.markNotificationsAsSeen();
    }
  }

  toggleUserSection(section: MenuSectionKey) {
    this.userMenuSections[section] = !this.userMenuSections[section];
  }

  toggleMobileSection(section: MenuSectionKey) {
    this.mobileMenuSections[section] = !this.mobileMenuSections[section];
  }

  closeNotificationMenu() {
    this.notificationMenuOpen = false;
  }

  openNotification(notification: NavbarNotification) {
    this.markNotificationsAsSeen();
    if (notification.queryParams) {
      this.router.navigate(notification.route, { queryParams: notification.queryParams });
    } else {
      this.router.navigate(notification.route);
    }
    this.closeNotificationMenu();
  }

  goToAccount() {
    this.router.navigate(['/mon-compte']);
  }

  goToWebsite() {
    this.router.navigate(['/']);
  }

  goToDashboard() {
    this.router.navigate(['/mon-espace']);
  }

  goToMessages() {
    this.router.navigate(['/messagerie']);
  }

  goToNotifications() {
    this.markNotificationsAsSeen();
    this.router.navigate(['/notifications']);
  }

  toggleMobileProfileMenu() {
    if (!this.currentUser) {
      this.router.navigate(['/login']);
      return;
    }
    this.mobileProfileMenuOpen = !this.mobileProfileMenuOpen;
    if (this.mobileProfileMenuOpen) {
      this.isMenuOpen = false;
      this.userMenuOpen = false;
      this.closeNotificationMenu();
    }
  }

  closeMobileProfileMenu() {
    this.mobileProfileMenuOpen = false;
  }

  goToAgendaTab(tab: 'client' | 'provider') {
    this.router.navigate(['/agenda'], { queryParams: { tab } });
    this.closeMobileProfileMenu();
  }

  goToPublicProfile() {
    if (!this.currentUser?.uid) return;
    this.router.navigate(['/prestataires', this.currentUser.uid]);
    this.closeMobileProfileMenu();
  }

  goToFavorites() {
    this.router.navigate(['/favoris']);
    this.closeMobileProfileMenu();
  }

  handleMobileLogout() {
    this.closeMobileProfileMenu();
    this.requestLogout();
  }

  @HostListener('document:click', ['$event'])
  handleDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (this.userMenuOpen) {
      if (target && target.closest('.user-menu')) {
        // keep open
      } else {
        this.userMenuOpen = false;
      }
    }
    if (this.notificationMenuOpen) {
      if (target && target.closest('.notification-menu')) {
        // keep open
      } else {
        this.notificationMenuOpen = false;
      }
    }
    if (this.searchOpen) {
      if (target && target.closest('.global-search')) {
        // keep open
      } else {
        this.closeSearchDropdown();
      }
    }
  }

  displayName(user: any | null | undefined) {
    if (!user) return 'Profil';
    if (user.pseudo && user.pseudo.trim().length > 0) {
      return user.pseudo;
    }
    const firstname = user.firstname || 'Profil';
    const lastname = user.lastname ? ` ${user.lastname}` : '';
    return `${firstname}${lastname}`;
  }

  private toMillis(value: any): number | undefined {
    if (!value) return undefined;
    if (typeof value === 'number') return value;
    if (value.seconds) return value.seconds * 1000;
    return undefined;
  }

  onSearchInput(value: string) {
    this.searchTerm = value;
    if (this.searchDebounce) {
      clearTimeout(this.searchDebounce);
    }
    if (!value || value.trim().length < this.searchMin) {
      this.searchResults = [];
      this.searchOpen = false;
      return;
    }
    this.searchDebounce = setTimeout(() => this.fetchSearchSuggestions(value.trim()), 250);
  }

  onSearchFocus() {
    if (this.searchResults.length) {
      this.searchOpen = true;
    }
  }

  async fetchSearchSuggestions(term: string) {
    this.searchLoading = true;
    this.searchOpen = true;
    try {
      const [services, users] = await Promise.all([
        this.services.searchServices(term, 5),
        this.profiles.searchProfiles(term).then(list => list.slice(0, 5)),
      ]);
      const results: SearchResult[] = [
        ...users.map(user => ({
          id: user.id,
          label: this.displayName(user),
          description: user.profession || user.city || '',
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
      ];
      this.searchResults = results.slice(0, 8);
    } finally {
      this.searchLoading = false;
    }
  }

  goToResult(result: SearchResult) {
    this.router.navigate(result.route);
    this.closeSearchDropdown();
  }

  submitSearch() {
    const term = this.searchTerm.trim();
    if (!term) return;
    this.closeSearchDropdown();
    this.router.navigate(['/recherche'], { queryParams: { term } });
  }

  closeSearchDropdown() {
    this.searchOpen = false;
  }

  private async loadRecentReviews() {
    if (!this.currentUid) return;
    const targetUid = this.currentUid;
    try {
      const reviews = await this.profiles.getReviews(targetUid);
      if (targetUid !== this.currentUid) {
        return;
      }
      this.reviewNotifications = reviews
        .map(review => this.mapReviewNotification(review))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
        .slice(0, 10);
      this.mergeNotifications();
    } catch (error) {
      console.error('Unable to load review notifications', error);
    }
  }

  private mergeNotifications() {
    const combined = [...this.bookingNotifications, ...this.reviewNotifications];
    combined.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    this.notifications = combined.slice(0, 10);
    this.updateNotificationBadge();
  }

  private resetNotifications() {
    this.notifications = [];
    this.reviewNotifications = [];
    this.bookingNotifications = [];
    this.notificationMenuOpen = false;
    this.notificationBadgeCount = 0;
    this.providerBookingStates.clear();
    this.clientBookingStates.clear();
    this.providerSnapshotReady = false;
    this.clientSnapshotReady = false;
    this.notificationsLastSeen = this.getStoredNotificationsLastSeen();
  }

  private updateNotificationBadge() {
    const lastSeen = this.notificationsLastSeen;
    this.notificationBadgeCount = this.notifications.filter(
      notification => (notification.createdAt ?? 0) > lastSeen,
    ).length;
  }

  private markNotificationsAsSeen() {
    const newest = this.notifications.length
      ? this.notifications[0].createdAt ?? Date.now()
      : Date.now();
    this.notificationsLastSeen = newest;
    this.persistNotificationsLastSeen(newest);
    this.updateNotificationBadge();
  }

  private getStoredNotificationsLastSeen() {
    if (typeof window === 'undefined' || !window.localStorage) {
      return 0;
    }
    const stored = Number(window.localStorage.getItem(this.getNotificationStorageKey()));
    return Number.isFinite(stored) ? stored : 0;
  }

  private persistNotificationsLastSeen(value: number) {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    window.localStorage.setItem(this.getNotificationStorageKey(), String(value));
  }

  private getNotificationStorageKey() {
    return this.currentUid
      ? `navbarNotifications:lastSeen:${this.currentUid}`
      : 'navbarNotifications:lastSeen';
  }

  private mapReviewNotification(review: UserReview): NavbarNotification {
    const identity =
      review.reviewer?.pseudo ||
      [review.reviewer?.firstname, review.reviewer?.lastname].filter(Boolean).join(' ').trim();
    const name = identity && identity.length ? identity : 'Un client';
    const ratingLabel = review.rating ? `Note ${review.rating}/5` : 'Nouvel avis';
    const comment = (review.comment || '').trim();
    const preview =
      comment.length > 90 ? `${comment.slice(0, 90).trim()}…` : comment;
    const description = preview ? `${ratingLabel} · ${preview}` : ratingLabel;

    return {
      id: `review-${review.id}`,
      kind: 'review',
      title: `${name} a laissé un avis`,
      description,
      createdAt: review.createdAt ?? Date.now(),
      route: ['/notifications'],
      queryParams: { highlight: review.id },
    };
  }

  private handleProviderBookings(snapshot: QuerySnapshot<DocumentData>) {
    const bookings = snapshot.docs
      .map(docSnap => this.mapBookingDoc(docSnap.id, docSnap.data()))
      .filter((booking): booking is BookingDoc => !!booking);
    const now = Date.now();
    this.pendingRequests = bookings.filter(
      booking => booking.status === 'pending' && (booking.startTime ?? 0) >= now,
    ).length;

    if (!this.providerSnapshotReady) {
      bookings.forEach(booking => this.providerBookingStates.set(booking.id, booking));
      this.providerSnapshotReady = true;
      return;
    }

    const ids = new Set(bookings.map(booking => booking.id));
    Array.from(this.providerBookingStates.keys()).forEach(id => {
      if (!ids.has(id)) {
        this.providerBookingStates.delete(id);
      }
    });

    bookings.forEach(booking => this.processBookingNotification(booking, 'provider'));
  }

  private handleClientBookings(snapshot: QuerySnapshot<DocumentData>) {
    const bookings = snapshot.docs
      .map(docSnap => this.mapBookingDoc(docSnap.id, docSnap.data()))
      .filter((booking): booking is BookingDoc => !!booking);
    const now = Date.now();
    this.pendingReservations = bookings.filter(
      booking => booking.status === 'pending' && (booking.startTime ?? 0) >= now,
    ).length;

    if (!this.clientSnapshotReady) {
      bookings.forEach(booking => this.clientBookingStates.set(booking.id, booking));
      this.clientSnapshotReady = true;
      return;
    }

    const ids = new Set(bookings.map(booking => booking.id));
    Array.from(this.clientBookingStates.keys()).forEach(id => {
      if (!ids.has(id)) {
        this.clientBookingStates.delete(id);
      }
    });

    bookings.forEach(booking => this.processBookingNotification(booking, 'client'));
  }

  private processBookingNotification(booking: BookingDoc, role: 'provider' | 'client') {
    const store = role === 'provider' ? this.providerBookingStates : this.clientBookingStates;
    const previous = store.get(booking.id);
    if (!previous) {
      store.set(booking.id, booking);
      if (role === 'provider' && booking.status === 'pending') {
        this.emitBookingEvent(booking, role, 'pending');
      }
      return;
    }

    if (previous.status !== booking.status) {
      this.emitBookingEvent(booking, role, booking.status);
    }
    store.set(booking.id, booking);
  }

  private emitBookingEvent(booking: BookingDoc, role: 'provider' | 'client', status: BookingStatus) {
    if (status === 'pending' && role !== 'provider') {
      return;
    }

    const serviceTitle = booking.serviceTitle || 'Ton service';
    let title = '';
    let description = '';
    switch (status) {
      case 'pending':
        title = 'Nouvelle demande';
        description = `Nouvelle demande pour "${serviceTitle}"`;
        break;
      case 'confirmed':
        title = 'Réservation confirmée';
        description =
          role === 'provider'
            ? `"${serviceTitle}" est confirmée`
            : `Ta réservation "${serviceTitle}" est confirmée`;
        break;
      case 'cancelled':
        title = 'Réservation annulée';
        description =
          role === 'provider'
            ? `Le rendez-vous "${serviceTitle}" a été annulé`
            : `Ta réservation "${serviceTitle}" a été annulée`;
        break;
      default:
        return;
    }

    const baseTimestamp = booking.updatedAt ?? booking.createdAt ?? Date.now();
    const timestamp = status === 'pending' ? baseTimestamp : Date.now();
    const notification: NavbarNotification = {
      id: `booking-${booking.id}-${status}-${timestamp}`,
      kind: 'booking',
      title,
      description,
      createdAt: timestamp,
      route: [role === 'provider' ? '/mes-rendez-vous' : '/mes-reservations'],
    };

    this.bookingNotifications = [notification, ...this.bookingNotifications.filter(n => n.id !== notification.id)]
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .slice(0, 10);
    this.mergeNotifications();
  }

  private mapBookingDoc(id: string, data: any): BookingDoc | null {
    if (!data) return null;
    return {
      id,
      status: (data.status ?? 'pending') as BookingStatus,
      serviceTitle: data.serviceTitle ?? 'Service',
      createdAt: this.toMillis(data.createdAt) ?? Date.now(),
      updatedAt: this.toMillis(data.updatedAt) ?? this.toMillis(data.createdAt) ?? Date.now(),
      startTime: this.toMillis(data.startTime) ?? undefined,
    };
  }
}

interface SearchResult {
  id: string;
  label: string;
  description?: string;
  avatar?: string | null;
  route: any[];
  kind: 'service' | 'user';
}

interface NavbarNotification {
  id: string;
  kind: 'review' | 'booking';
  title: string;
  description: string;
  createdAt?: number;
  route: any[];
  queryParams?: Record<string, any>;
}

interface BookingDoc {
  id: string;
  status: BookingStatus;
  serviceTitle?: string;
  createdAt?: number;
  updatedAt?: number;
  startTime?: number;
}
