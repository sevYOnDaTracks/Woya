import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { SharedImports } from '../shared/shared-imports';
import { AuthStore } from '../core/store/auth.store';
import { firebaseServices } from '../app.config';
import { BookingsService } from '../core/services/bookings';
import { ProfilesService } from '../core/services/profiles';
import { ServiceBooking } from '../core/models/booking.model';
import { TimeAgoPipe } from '../shared/time-ago.pipe';

type BookingView = 'upcoming' | 'history';

@Component({
  selector: 'app-provider-bookings',
  standalone: true,
  imports: [...SharedImports, RouterLink, TimeAgoPipe],
  templateUrl: './provider-bookings.html',
  styleUrl: './provider-bookings.css',
})
export default class ProviderBookings implements OnInit, OnDestroy {
  loading = true;
  error = '';
  bookings: ServiceBooking[] = [];
  view: BookingView = 'upcoming';
  updatingId: string | null = null;

  private providerId: string | null = null;
  private authSub?: Subscription;
  private profileCache = new Map<string, any>();

  constructor(
    private auth: AuthStore,
    private router: Router,
    private bookingsService: BookingsService,
    private profiles: ProfilesService,
  ) {}

  async ngOnInit() {
    const immediate = this.auth.user$.value || firebaseServices.auth.currentUser;
    if (immediate?.uid) {
      this.providerId = immediate.uid;
      await this.refresh();
    } else {
      this.authSub = this.auth.user$.subscribe(async user => {
        if (user?.uid) {
          this.providerId = user.uid;
          await this.refresh();
        }
      });
    }
  }

  ngOnDestroy() {
    this.authSub?.unsubscribe();
  }

  async refresh() {
    if (!this.providerId) return;
    this.loading = true;
    this.error = '';
    try {
      this.bookings = await this.bookingsService.listForProvider(this.providerId);
      await this.hydrateProfiles(this.bookings.map(b => b.clientId));
    } catch (error) {
      console.error('Unable to load provider bookings', error);
      this.error = 'Impossible de récupérer tes rendez-vous pour le moment.';
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

  clientName(booking: ServiceBooking) {
    const profile = this.profileCache.get(booking.clientId);
    if (!profile) return 'Client·e Woya';
    if (profile.pseudo) return profile.pseudo;
    return [profile.firstname, profile.lastname].filter(Boolean).join(' ').trim() || 'Client·e Woya';
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

  isPast(booking: ServiceBooking) {
    return booking.startTime < Date.now();
  }

  async confirmBooking(booking: ServiceBooking) {
    await this.updateStatus(booking, 'confirmed');
  }

  async cancelBooking(booking: ServiceBooking) {
    await this.updateStatus(booking, 'cancelled');
  }

  async updateStatus(booking: ServiceBooking, nextStatus: ServiceBooking['status']) {
    if (!booking.id || booking.status === nextStatus) return;
    this.updatingId = booking.id;
    try {
      await this.bookingsService.updateStatus(booking.id, nextStatus);
      booking.status = nextStatus;
    } catch (error) {
      console.error('Unable to update booking status', error);
      this.error = 'Impossible de mettre à jour ce rendez-vous.';
    } finally {
      this.updatingId = null;
    }
  }

  private async hydrateProfiles(ids: string[]) {
    const unique = Array.from(
      new Set(ids.filter((id): id is string => typeof id === 'string' && !this.profileCache.has(id))),
    );
    await Promise.all(
      unique.map(async id => {
        const profile = await this.profiles.getPublicProfile(id);
        this.profileCache.set(id, profile);
      }),
    );
  }
}
