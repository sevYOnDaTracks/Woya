import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { doc, getDoc } from 'firebase/firestore';
import { Subscription } from 'rxjs';
import { AuthStore } from '../core/store/auth.store';
import { BookingsService } from '../core/services/bookings';
import { ServiceBooking } from '../core/models/booking.model';
import { Services } from '../core/services/services';
import { firebaseServices } from '../app.config';

interface DashboardAction {
  id: string;
  title: string;
  description: string;
  route: string | any[];
  icon: DashboardActionIcon;
  accent?: boolean;
  badge?: string;
}

type DashboardActionIcon =
  | 'services'
  | 'providers'
  | 'my-services'
  | 'reservations'
  | 'appointments'
  | 'messages'
  | 'notifications'
  | 'publish';

interface UpcomingAppointment {
  title: string;
  dateLabel: string;
  roleLabel: string;
  status: 'confirmed' | 'pending';
  role: 'provider' | 'client';
  bookingId?: string;
  route: any[];
  coverUrl?: string | null;
  counterpartName?: string;
  counterpartAvatar?: string | null;
  counterpartLink?: any[] | null;
}

const BASE_DASHBOARD_ACTIONS: ReadonlyArray<Omit<DashboardAction, 'badge'>> = [
  {
    id: 'services',
    title: 'Trouver un service',
    description: 'Explore les annonces et réserve en quelques clics.',
    route: '/services',
    icon: 'services',
  },
  // {
  //   id: 'providers',
  //   title: 'Voir les prestataires',
  //   description: 'Découvre les profils vérifiés proches de toi.',
  //   route: '/prestataires',
  //   icon: 'providers',
  // },
  // {
  //   id: 'my-services',
  //   title: 'Mes services',
  //   description: 'Gère et mets à jour tes offres publiées.',
  //   route: '/mes-services',
  //   icon: 'my-services',
  // },
  // {
  //   id: 'reservations',
  //   title: 'Mon Agenda',
  //   description: 'Suis tes demandes et interventions à venir.',
  //   route: '/agenda',
  //   icon: 'reservations',
  // },
  // {
  //   id: 'messages',
  //   title: 'Ma Messagerie',
  //   description: 'Discute avec tes clients et prestataires.',
  //   route: '/messagerie',
  //   icon: 'messages',
  // },
  // {
  //   id: 'notifications',
  //   title: 'Mes Notifications',
  //   description: 'Avis, confirmations et alertes importantes.',
  //   route: '/notifications',
  //   icon: 'notifications',
  // },
  {
    id: 'publish',
    title: 'Publier un service',
    description: 'Ajoute une nouvelle annonce en quelques minutes.',
    route: '/services/new',
    icon: 'publish',
   // accent: true,
  },
];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export default class DashboardPage implements OnInit, OnDestroy {
  userName = 'Woya!';
  userLoading = true;
  dashboardActions: DashboardAction[] = [];
  nextAppointment?: UpcomingAppointment | null;
  appointmentLoading = false;
  pendingRequests = 0;
  pendingReservations = 0;
  cancellingNext = false;
  cancelNextError = '';

  private currentUid: string | null = null;
  private subs: Subscription[] = [];
  private serviceCoverCache = new Map<string, string | null>();
  private serviceCoverPlaceholder = 'assets/icone.png';
  private hasLoadedDashboardData = false;
  private userNameCache = new Map<string, string | null>();

  constructor(
    private auth: AuthStore,
    private bookings: BookingsService,
    private servicesApi: Services,
    private router: Router,
  ) {
    this.refreshActions();
  }

  ngOnInit() {

    this.subs.push(

      this.auth.user$.subscribe(user => {

        const previousUid = this.currentUid;

        const uid = user?.uid ?? null;

        this.currentUid = uid;

        const uidChanged = previousUid !== uid;



        if (!uid) {

          this.userLoading = false;

          this.userName = 'Invité';

          this.nextAppointment = null;

          this.pendingRequests = 0;

          this.pendingReservations = 0;

          this.hasLoadedDashboardData = false;

          this.refreshActions();

          this.router.navigate(['/login'], { queryParams: { redirect: '/mon-espace' } });

          return;

        }



        if (uidChanged) {

          this.pendingRequests = 0;

          this.pendingReservations = 0;

          this.nextAppointment = null;

          this.hasLoadedDashboardData = false;

        }



        this.userLoading = !!user?.profileLoading;

        this.userName = this.userLoading ? 'Chargement...' : this.displayName(user);



        if (!this.userLoading && !this.hasLoadedDashboardData) {

          this.hasLoadedDashboardData = true;

          this.loadDashboardData();

        }

      }),

    );

  }

  ngOnDestroy() {
    this.subs.forEach(sub => sub.unsubscribe());
  }

  trackByActionId(_: number, action: DashboardAction) {
    return action.id;
  }

  get canCancelNextAppointment() {
    return (
      !!this.nextAppointment &&
      this.nextAppointment.status === 'pending' &&
      this.nextAppointment.role === 'client' &&
      !!this.nextAppointment.bookingId
    );
  }

  private async loadDashboardData() {
    if (!this.currentUid) return;
    const uid = this.currentUid;
    this.appointmentLoading = true;
    try {
      const [providerBookings, clientBookings] = await Promise.all([
        this.bookings.listForProvider(uid),
        this.bookings.listForClient(uid),
      ]);

      if (uid !== this.currentUid) return;

      this.pendingRequests = providerBookings.filter(booking => booking.status === 'pending').length;
      this.pendingReservations = clientBookings.filter(booking => booking.status === 'pending').length;
      await this.computeNextAppointment(providerBookings, clientBookings, uid);
      this.cancelNextError = '';
      this.refreshActions();
    } finally {
      if (uid === this.currentUid) {
        this.appointmentLoading = false;
      }
    }
  }

  private async computeNextAppointment(
    providerBookings: ServiceBooking[],
    clientBookings: ServiceBooking[],
    uidToken: string | null,
  ) {
    const now = Date.now();
    const combined = [
      ...providerBookings.map(booking => ({ booking, role: 'provider' as const })),
      ...clientBookings.map(booking => ({ booking, role: 'client' as const })),
    ]
      .filter(({ booking, role }) => {
        const isUpcoming = (booking.startTime ?? 0) >= now;
        if (!isUpcoming) {
          return false;
        }
        if (booking.status === 'confirmed') {
          return true;
        }
        return role === 'client' && booking.status === 'pending';
      })
      .sort((a, b) => (a.booking.startTime ?? 0) - (b.booking.startTime ?? 0));

    const next = combined[0];
    if (!next) {
      this.nextAppointment = null;
      return;
    }

    const { booking, role } = next;
    const coverUrl = await this.getServiceCover(booking.serviceId);

    if (uidToken !== this.currentUid) {
      return;
    }

    const status: 'confirmed' | 'pending' =
      booking.status === 'pending' && role === 'client' ? 'pending' : 'confirmed';

    const counterpartId = role === 'provider' ? booking.clientId : booking.providerId;
    const counterpart = counterpartId ? await this.getUserDisplayName(counterpartId) : null;

    this.nextAppointment = {
      title: booking.serviceTitle || 'Service',
      dateLabel: this.formatDate(booking.startTime),
      roleLabel: role === 'provider' ? 'En tant que prestataire' : 'En tant que client',
      status,
      role,
      bookingId: booking.id,
      route: [role === 'provider' ? '/mes-rendez-vous' : '/mes-reservations'],
      coverUrl: coverUrl ?? this.serviceCoverPlaceholder,
      counterpartName: counterpart,
      counterpartLink: counterpartId ? ['/prestataires', counterpartId] : null,
    };
  }

  private refreshActions() {
    this.dashboardActions = BASE_DASHBOARD_ACTIONS.map(action => {
      let badge: string | undefined;
      if (action.id === 'appointments' && this.pendingRequests) {
        badge = this.formatBadge(this.pendingRequests);
      }
      if (action.id === 'reservations' && this.pendingReservations) {
        badge = this.formatBadge(this.pendingReservations);
      }
      return { ...action, badge };
    });
  }

  private formatBadge(value: number) {
    if (value <= 0) return undefined;
    return value > 99 ? '99+' : String(value);
  }

  private displayName(user: any) {
    if (!user) return 'Utilisateur';
    if (user.pseudo && user.pseudo.trim().length) {
      return user.pseudo;
    }
    const firstname = user.firstname || 'Utilisateur';
    const lastname = user.lastname ? ` ${user.lastname}` : '';
    return `${firstname}${lastname}`;
  }

  private formatDate(timestamp?: number) {
    if (!timestamp) return 'Date à confirmer';
    try {
      return new Intl.DateTimeFormat('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(timestamp));
    } catch {
      return new Date(timestamp).toLocaleString();
    }
  }

  private async getServiceCover(serviceId?: string | null) {
    if (!serviceId) return null;
    if (this.serviceCoverCache.has(serviceId)) {
      return this.serviceCoverCache.get(serviceId) ?? null;
    }

    try {
      const snap = await this.servicesApi.getById(serviceId);
      if (snap.exists()) {
        const data = snap.data() as any;
        const cover =
          data?.coverUrl ||
          (Array.isArray(data?.extraImages) ? data.extraImages.find((img: any) => !!img) : null) ||
          null;
        this.serviceCoverCache.set(serviceId, cover);
        return cover;
      }
    } catch (error) {
      console.error('Unable to load service cover', error);
    }
    this.serviceCoverCache.set(serviceId, null);
    return null;
  }

  async cancelNextAppointment() {
    if (!this.nextAppointment || !this.canCancelNextAppointment) return;
    const bookingId = this.nextAppointment.bookingId;
    if (!bookingId) return;

    const shouldCancel = typeof confirm === 'function'
      ? confirm('Annuler cette reservation ?')
      : true;
    if (!shouldCancel) return;

    this.cancellingNext = true;
    this.cancelNextError = '';
    try {
      await this.bookings.cancelPendingBookingByClient(bookingId);
      await this.loadDashboardData();
    } catch (error: any) {
      console.error('Unable to cancel dashboard booking', error);
      if (error instanceof Error && error.message === 'BOOKING_NOT_PENDING') {
        this.cancelNextError = 'Ce rendez-vous vient d etre confirme.';
      } else if (error instanceof Error && error.message === 'BOOKING_NOT_FOUND') {
        this.cancelNextError = 'Ce rendez-vous n\'existe plus.';
      } else {
        this.cancelNextError = 'Impossible d\'annuler ce rendez-vous.';
      }
    } finally {
      this.cancellingNext = false;
    }
  }

  private async getUserDisplayName(uid?: string | null) {
    if (!uid) return null;
    if (this.userNameCache.has(uid)) {
      return this.userNameCache.get(uid) ?? null;
    }
    try {
      const ref = doc(firebaseServices.db, 'users', uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data() as any;
        const name =
          data?.pseudo ||
          [data?.firstname, data?.lastname].filter(Boolean).join(' ').trim() ||
          data?.email ||
          null;
        this.userNameCache.set(uid, name);
        return name;
      }
    } catch (error) {
      console.warn('Unable to load user name', error);
    }
    this.userNameCache.set(uid, null);
    return null;
  }
}
