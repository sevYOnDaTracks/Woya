import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { SharedImports } from '../shared/shared-imports';
import { AuthStore } from '../core/store/auth.store';
import { firebaseServices } from '../app.config';
import { BookingsService } from '../core/services/bookings';
import { ProfilesService } from '../core/services/profiles';
import { ServiceBooking } from '../core/models/booking.model';
import { EmailService } from '../core/services/email';
import { MessagingService } from '../core/services/messaging';
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
  statusFilter: 'all' | 'pending' | 'confirmed' | 'cancelled' = 'all';
  serviceFilter = '';
  searchTerm = '';
  contactingId: string | null = null;
  readonly weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  activeDate = this.startOfDay(Date.now()).getTime();
  visibleMonth = this.startOfMonth(Date.now());

  private providerId: string | null = null;
  private authSub?: Subscription;
  private profileCache = new Map<string, any>();

  constructor(
    private auth: AuthStore,
    private router: Router,
    private bookingsService: BookingsService,
    private profiles: ProfilesService,
    private emails: EmailService,
    private messaging: MessagingService,
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
      this.ensureActiveDateHasContext();
    } catch (error) {
      console.error('Unable to load provider bookings', error);
      this.error = 'Impossible de récupérer tes rendez-vous pour le moment.';
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
      .filter(booking =>
        this.matchesSearch(booking),
      )
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
      await this.notifyClientByEmail(booking);
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

  private async notifyClientByEmail(booking: ServiceBooking) {
    const profile = await this.ensureProfile(booking.clientId);
    const email = profile?.email;
    if (!email) return;
    const dateLabel = this.formatDate(booking.startTime);
    const subject =
      booking.status === 'confirmed'
        ? `Votre rendez-vous "${booking.serviceTitle}" est confirmé`
        : booking.status === 'cancelled'
        ? `Votre rendez-vous "${booking.serviceTitle}" a été annulé`
        : `Mise à jour pour "${booking.serviceTitle}"`;
    const body =
      booking.status === 'confirmed'
        ? `
Bonjour ${profile?.firstname || profile?.pseudo || 'cher client'},

Le prestataire a confirmé votre rendez-vous pour "${booking.serviceTitle}" prévu le ${dateLabel}.
Vous pouvez retrouver le détail dans l'espace Mes réservations.

À bientôt,
L'équipe Woya!
        `.trim()
        : booking.status === 'cancelled'
        ? `
Bonjour ${profile?.firstname || profile?.pseudo || 'cher client'},

Le prestataire a annulé votre rendez-vous pour "${booking.serviceTitle}" prévu le ${dateLabel}.
N'hésitez pas à choisir un autre créneau ou un autre prestataire.

À bientôt,
L'équipe Woya!
        `.trim()
        : `
Une mise à jour a été effectuée pour votre rendez-vous "${booking.serviceTitle}".
Retrouvez tous les détails dans l'espace Mes réservations.
        `.trim();
    await this.emails.send({ to: email, subject, body });
  }

  private async ensureProfile(id: string) {
    if (this.profileCache.has(id)) {
      return this.profileCache.get(id);
    }
    const profile = await this.profiles.getPublicProfile(id);
    this.profileCache.set(id, profile);
    return profile;
  }

  private formatDate(timestamp?: number) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  clientProfileLink(booking: ServiceBooking) {
    return ['/prestataires', booking.clientId];
  }

  private matchesSearch(booking: ServiceBooking) {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) return true;
    const haystack = [booking.serviceTitle || '', this.clientName(booking)].join(' ').toLowerCase();
    return haystack.includes(term);
  }

  async contactClient(booking: ServiceBooking) {
    if (!booking.clientId) return;
    this.contactingId = booking.id ?? booking.clientId;
    try {
      const conversationId = await this.messaging.ensureConversation(booking.clientId);
      if (conversationId) {
        this.router.navigate(['/messagerie', conversationId]);
      } else {
        this.router.navigate(['/messagerie']);
      }
    } finally {
      this.contactingId = null;
    }
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
    const weekday = (firstDay.getDay() + 6) % 7; // shift to Monday-first offset
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
