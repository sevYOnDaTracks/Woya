import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { SharedImports } from '../shared/shared-imports';
import { AuthStore } from '../core/store/auth.store';
import { firebaseServices } from '../app.config';
import { BookingsService } from '../core/services/bookings';
import { ProfilesService } from '../core/services/profiles';
import { MessagingService } from '../core/services/messaging';
import { ServiceBooking } from '../core/models/booking.model';
import { TimeAgoPipe } from '../shared/time-ago.pipe';

type BookingView = 'upcoming' | 'history';

@Component({
  selector: 'app-client-bookings',
  standalone: true,
  imports: [...SharedImports, RouterLink, TimeAgoPipe],
  templateUrl: './client-bookings.html',
  styleUrl: './client-bookings.css',
})
export default class ClientBookings implements OnInit, OnDestroy {
  loading = true;
  error = '';
  bookings: ServiceBooking[] = [];
  view: BookingView = 'upcoming';
  contactingId: string | null = null;

  private clientId: string | null = null;
  private authSub?: Subscription;
  private providerCache = new Map<string, any>();

  constructor(
    private auth: AuthStore,
    private router: Router,
    private bookingsService: BookingsService,
    private profiles: ProfilesService,
    private messaging: MessagingService,
  ) {}

  async ngOnInit() {
    const immediate = this.auth.user$.value || firebaseServices.auth.currentUser;
    if (immediate?.uid) {
      this.clientId = immediate.uid;
      await this.refresh();
    } else {
      this.authSub = this.auth.user$.subscribe(async user => {
        if (user?.uid) {
          this.clientId = user.uid;
          await this.refresh();
        }
      });
    }
  }

  ngOnDestroy() {
    this.authSub?.unsubscribe();
  }

  async refresh() {
    if (!this.clientId) return;
    this.loading = true;
    this.error = '';
    try {
      this.bookings = await this.bookingsService.listForClient(this.clientId);
      await this.hydrateProviders(this.bookings.map(b => b.providerId));
    } catch (error) {
      console.error('Unable to load client bookings', error);
      this.error = 'Impossible de récupérer tes réservations.';
    } finally {
      this.loading = false;
    }
  }

  switchView(mode: BookingView) {
    this.view = mode;
  }

  get filteredBookings() {
    const now = Date.now();
    return this.bookings
      .filter(booking =>
        this.view === 'upcoming' ? booking.startTime >= now : booking.startTime < now,
      )
      .sort((a, b) =>
        this.view === 'upcoming' ? a.startTime - b.startTime : b.startTime - a.startTime,
      );
  }

  providerName(booking: ServiceBooking) {
    const profile = this.providerCache.get(booking.providerId);
    if (!profile) return 'Prestataire';
    if (profile.pseudo) return profile.pseudo;
    return [profile.firstname, profile.lastname].filter(Boolean).join(' ').trim() || 'Prestataire';
  }

  statusBadgeClass(status: ServiceBooking['status']) {
    switch (status) {
      case 'confirmed':
        return 'status-badge success';
      case 'cancelled':
        return 'status-badge danger';
      default:
        return 'status-badge warn';
    }
  }

  async contactProvider(booking: ServiceBooking) {
    if (!booking.providerId || !booking.serviceId) return;
    this.contactingId = booking.id ?? booking.serviceId;
    try {
      const conversationId = await this.messaging.ensureConversation(booking.providerId);
      if (conversationId) {
        this.router.navigate(['/messagerie', conversationId]);
      } else {
        this.router.navigate(['/messagerie']);
      }
    } catch (error) {
      console.error('Unable to open conversation for booking', error);
      this.error = 'Impossible d’ouvrir la messagerie pour ce rendez-vous.';
    } finally {
      this.contactingId = null;
    }
  }

  private async hydrateProviders(ids: string[]) {
    const unique = Array.from(
      new Set(ids.filter((id): id is string => typeof id === 'string' && !this.providerCache.has(id))),
    );
    await Promise.all(
      unique.map(async id => {
        const profile = await this.profiles.getPublicProfile(id);
        this.providerCache.set(id, profile);
      }),
    );
  }
}
