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

interface CalendarDay {
  timestamp: number;
  label: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  count: number;
}

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
  cancellingId: string | null = null;
  statusFilter: 'all' | 'pending' | 'confirmed' | 'cancelled' = 'all';
  serviceFilter = '';
  searchTerm = '';
  readonly weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  activeDate = this.startOfDay(Date.now()).getTime();
  visibleMonth = this.startOfMonth(Date.now());

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
      this.ensureActiveDateHasContext();
    } catch (error) {
      console.error('Unable to load client bookings', error);
      this.error = 'Impossible de récupérer tes réservations.';
    } finally {
      this.loading = false;
    }
  }

  switchView(mode: BookingView) {
    this.view = mode;
    this.ensureActiveDateHasContext(true);
  }

  get filteredBookings() {
    const now = Date.now();
    return this.bookings
      .filter(booking => {
        if (this.view === 'history') {
          return booking.status === 'cancelled' || booking.startTime < now;
        }
        return booking.status !== 'cancelled' && booking.startTime >= now;
      })
      .filter(booking => this.statusFilter === 'all' || booking.status === this.statusFilter)
      .filter(booking =>
        !this.serviceFilter ||
        booking.serviceTitle?.toLowerCase().includes(this.serviceFilter.trim().toLowerCase()),
      )
      .filter(booking => this.matchesSearch(booking))
      .sort((a, b) =>
        this.view === 'upcoming' ? a.startTime - b.startTime : b.startTime - a.startTime,
      );
  }

  get bookingsForSelectedDate() {
    const key = this.activeDate;
    return this.filteredBookings.filter(
      booking => this.startOfDay(booking.startTime).getTime() === key,
    );
  }

  get calendarWeeks(): CalendarDay[][] {
    const counts = this.buildDailyCounts(this.filteredBookings);
    const start = this.getCalendarGridStart(this.visibleMonth);
    const cursor = new Date(start);
    const month = this.visibleMonth;
    const todayKey = this.startOfDay(Date.now()).getTime();
    const weeks: CalendarDay[][] = [];

    for (let week = 0; week < 6; week++) {
      const days: CalendarDay[] = [];
      for (let day = 0; day < 7; day++) {
        const current = new Date(cursor);
        const timestamp = current.getTime();
        days.push({
          timestamp,
          label: current.getDate(),
          inCurrentMonth:
            current.getMonth() === month.getMonth() && current.getFullYear() === month.getFullYear(),
          isToday: timestamp === todayKey,
          count: counts.get(timestamp) ?? 0,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(days);
    }

    return weeks;
  }

  get monthLabel() {
    return this.visibleMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }

  get selectedDateLabel() {
    return new Date(this.activeDate).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  get serviceOptions() {
    return Array.from(new Set(this.bookings.map(b => b.serviceTitle))).filter(Boolean);
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

  async cancelBooking(booking: ServiceBooking) {
    if (!booking.id || booking.status !== 'pending') return;
    const confirmCancel = typeof confirm === 'function'
      ? confirm('Annuler cette réservation ?')
      : true;
    if (!confirmCancel) return;

    this.cancellingId = booking.id;
    this.error = '';
    try {
      await this.bookingsService.cancelPendingBookingByClient(booking.id);
      booking.status = 'cancelled';
      this.ensureActiveDateHasContext(true);
    } catch (error: any) {
      console.error('Unable to cancel booking as client', error);
      if (error instanceof Error && error.message === 'BOOKING_NOT_PENDING') {
        this.error = 'Ce rendez-vous a deja ete confirme par le prestataire.';
      } else if (error instanceof Error && error.message === 'BOOKING_NOT_FOUND') {
        this.error = 'Ce rendez-vous n\'existe plus.';
      } else {
        this.error = 'Impossible d\'annuler ce rendez-vous.';
      }
    } finally {
      this.cancellingId = null;
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

  providerProfileLink(booking: ServiceBooking) {
    return ['/prestataires', booking.providerId];
  }

  private matchesSearch(booking: ServiceBooking) {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) return true;
    const haystack = [booking.serviceTitle || '', this.providerName(booking)].join(' ').toLowerCase();
    return haystack.includes(term);
  }

  changeMonth(step: number) {
    this.visibleMonth = this.addMonths(this.visibleMonth, step);
    if (!this.isSameMonth(this.activeDate, this.visibleMonth)) {
      this.activeDate = this.startOfMonth(this.visibleMonth).getTime();
    }
  }

  selectDate(timestamp: number) {
    const normalized = this.startOfDay(timestamp);
    this.activeDate = normalized.getTime();
    this.visibleMonth = this.startOfMonth(normalized);
  }

  private ensureActiveDateHasContext(force = false) {
    const filtered = this.filteredBookings;
    if (!filtered.length) {
      const today = this.startOfDay(Date.now());
      this.activeDate = today.getTime();
      this.visibleMonth = this.startOfMonth(today);
      return;
    }

    const hasSelectedDay = filtered.some(
      booking => this.startOfDay(booking.startTime).getTime() === this.activeDate,
    );

    if (!hasSelectedDay || force) {
      const anchor = filtered[0];
      const anchorDay = this.startOfDay(anchor.startTime);
      this.activeDate = anchorDay.getTime();
      this.visibleMonth = this.startOfMonth(anchorDay);
    } else if (!this.isSameMonth(this.activeDate, this.visibleMonth)) {
      this.visibleMonth = this.startOfMonth(this.activeDate);
    }
  }

  private buildDailyCounts(bookings: ServiceBooking[]) {
    return bookings.reduce((acc, booking) => {
      if (!booking.startTime) return acc;
      const key = this.startOfDay(booking.startTime).getTime();
      acc.set(key, (acc.get(key) ?? 0) + 1);
      return acc;
    }, new Map<number, number>());
  }

  private getCalendarGridStart(month: Date) {
    const firstDay = this.startOfMonth(month);
    const weekday = (firstDay.getDay() + 6) % 7;
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - weekday);
    return start;
  }

  private startOfDay(value: number | Date) {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private startOfMonth(value: number | Date) {
    const date = this.startOfDay(value);
    date.setDate(1);
    return date;
  }

  private addMonths(date: Date, offset: number) {
    const next = new Date(date.getFullYear(), date.getMonth() + offset, 1);
    return this.startOfMonth(next);
  }

  private isSameMonth(a: number | Date, b: number | Date) {
    const first = new Date(a);
    const second = new Date(b);
    return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth();
  }
}
