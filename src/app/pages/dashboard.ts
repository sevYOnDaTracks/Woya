import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Subscription } from 'rxjs';
import { AuthStore } from '../core/store/auth.store';
import { BookingsService } from '../core/services/bookings';
import { ServiceBooking } from '../core/models/booking.model';
import { Services } from '../core/services/services';
import { firebaseServices } from '../app.config';
import { ProfilesService } from '../core/services/profiles';
import { matchProfessionOption, OTHER_PROFESSION_OPTION, PROFESSION_OPTIONS, resolveProfessionValue } from '../core/constants/professions';

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

interface ProfileModalForm {
  pseudo: string;
  firstname: string;
  lastname: string;
  profession: string;
  phone: string;
  birthdate: string;
  city: string;
  address: string;
  bio: string;
}

const BASE_DASHBOARD_ACTIONS: ReadonlyArray<Omit<DashboardAction, 'badge'>> = [
  {
    id: 'services',
    title: 'Trouver un service',
    description: 'Explore les annonces et rÃ©serve en quelques clics.',
    route: '/services',
    icon: 'services',
  },
  // {
  //   id: 'providers',
  //   title: 'Voir les prestataires',
  //   description: 'DÃ©couvre les profils vÃ©rifiÃ©s proches de toi.',
  //   route: '/prestataires',
  //   icon: 'providers',
  // },
  // {
  //   id: 'my-services',
  //   title: 'Mes services',
  //   description: 'GÃ¨re et mets Ã  jour tes offres publiÃ©es.',
  //   route: '/mes-services',
  //   icon: 'my-services',
  // },
  // {
  //   id: 'reservations',
  //   title: 'Mon Agenda',
  //   description: 'Suis tes demandes et interventions Ã  venir.',
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
  imports: [CommonModule, FormsModule, RouterLink],
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
  showProfileWarning = false;
  requireProfileModal = false;
  profileModalForm: ProfileModalForm = this.createProfileModalForm();
  professionOptions = PROFESSION_OPTIONS;
  readonly professionOtherValue = OTHER_PROFESSION_OPTION;
  profileSelectedProfession = '';
  profileCustomProfession = '';
  profileModalError = '';
  profileModalSaving = false;
  profilePseudoStatus: 'idle' | 'checking' | 'available' | 'taken' | 'error' = 'idle';
  profilePhotoPreview: string | null = null;
  profilePhotoFile: File | null = null;
  coverPhotoPreview: string | null = null;
  coverPhotoFile: File | null = null;

  private currentUid: string | null = null;
  private subs: Subscription[] = [];
  private serviceCoverCache = new Map<string, string | null>();
  private serviceCoverPlaceholder = 'assets/icone.png';
  private hasLoadedDashboardData = false;
  private userNameCache = new Map<string, string | null>();
  private profileModalPseudoTimeout?: ReturnType<typeof setTimeout>;
  private originalProfilePseudo = '';

  constructor(
    private auth: AuthStore,
    private bookings: BookingsService,
    private servicesApi: Services,
    private router: Router,
    private profiles: ProfilesService,
  ) {
    this.refreshActions();
    this.syncProfileProfessionSelection(this.profileModalForm.profession);
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

          this.userName = 'InvitÃ©';
          this.showProfileWarning = false;

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
        this.showProfileWarning = this.shouldShowProfileWarning(user);
        this.requireProfileModal = this.shouldForceProfileModal(user);
        if (this.requireProfileModal) {
          this.populateProfileModal(user);
        } else {
          this.profilePseudoStatus = 'idle';
          this.profileModalError = '';
          this.profilePhotoFile = null;
          this.coverPhotoFile = null;
          this.profilePhotoPreview = user?.photoURL || null;
          this.coverPhotoPreview = user?.coverURL || null;
        }



        if (!this.userLoading && !this.hasLoadedDashboardData) {

          this.hasLoadedDashboardData = true;

          this.loadDashboardData();

        }

      }),

    );

  }

  ngOnDestroy() {
    this.subs.forEach(sub => sub.unsubscribe());
    if (this.profileModalPseudoTimeout) {
      clearTimeout(this.profileModalPseudoTimeout);
      this.profileModalPseudoTimeout = undefined;
    }
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

  private shouldShowProfileWarning(user: any | null | undefined) {
    if (!user) return false;
    const fields = [
      user.firstname,
      user.lastname,
      user.pseudo,
      user.profession,
      user.birthdate,
      user.phone,
      user.city,
      user.address,
    ];
    return fields.every(value => !this.hasValue(value));
  }

  private shouldForceProfileModal(user: any | null | undefined) {
    if (!user || user.profileLoading) return false;
    const requiredFields: (keyof ProfileModalForm)[] = ['pseudo', 'firstname', 'lastname', 'phone', 'city', 'profession'];
    const missingRequired = requiredFields.some(field => !this.hasValue(user[field]));
    if (!missingRequired) {
      return false;
    }
    return user.onboardingCompleted !== true;
  }

  private hasValue(value: any) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    return !!value;
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
    if (!timestamp) return 'Date Ã  confirmer';
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

  private createProfileModalForm(): ProfileModalForm {
    return {
      pseudo: '',
      firstname: '',
      lastname: '',
      profession: '',
      phone: '',
      birthdate: '',
      city: '',
      address: '',
      bio: '',
    };
  }

  private populateProfileModal(user: any | null | undefined) {
    this.profileModalForm = {
      pseudo: user?.pseudo || '',
      firstname: user?.firstname || '',
      lastname: user?.lastname || '',
      profession: user?.profession || '',
      phone: user?.phone || '',
      birthdate: user?.birthdate || '',
      city: user?.city || '',
      address: user?.address || '',
      bio: user?.bio || '',
    };
    this.syncProfileProfessionSelection(this.profileModalForm.profession);
    this.originalProfilePseudo = user?.pseudo || '';
    this.profilePhotoPreview = user?.photoURL || null;
    this.coverPhotoPreview = user?.coverURL || null;
    this.profilePhotoFile = null;
    this.coverPhotoFile = null;
  }

  onProfileModalPseudoChange(value: string) {
    if (this.profileModalPseudoTimeout) {
      clearTimeout(this.profileModalPseudoTimeout);
    }
    const normalizedOriginal = (this.originalProfilePseudo || '').trim().toLowerCase();
    const normalizedValue = (value || '').trim().toLowerCase();
    if (!normalizedValue) {
      this.profilePseudoStatus = 'idle';
      return;
    }
    if (normalizedValue === normalizedOriginal) {
      this.profilePseudoStatus = 'available';
      return;
    }
    this.profilePseudoStatus = 'checking';
    this.profileModalPseudoTimeout = setTimeout(async () => {
      try {
        const available = await this.profiles.isPseudoAvailable(value, this.currentUid ?? undefined);
        this.profilePseudoStatus = available ? 'available' : 'taken';
      } catch (error) {
        console.warn('Unable to verify pseudo', error);
        this.profilePseudoStatus = 'error';
      }
    }, 400);
  }

  onProfileProfessionChange(value: string) {
    this.profileSelectedProfession = value;
    if (value !== this.professionOtherValue) {
      this.profileCustomProfession = '';
    }
  }

  onSelectProfilePhoto(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!this.isImageFile(file)) {
      this.profileModalError = 'Merci de sÃ©lectionner une image valide pour la photo de profil.';
      input.value = '';
      return;
    }
    this.profilePhotoFile = file;
    const reader = new FileReader();
    reader.onload = () => (this.profilePhotoPreview = reader.result as string);
    reader.readAsDataURL(file);
  }

  onSelectCoverPhoto(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!this.isImageFile(file)) {
      this.profileModalError = 'Merci de sÃ©lectionner une image valide pour la couverture.';
      input.value = '';
      return;
    }
    this.coverPhotoFile = file;
    const reader = new FileReader();
    reader.onload = () => (this.coverPhotoPreview = reader.result as string);
    reader.readAsDataURL(file);
  }

  async saveProfileModal() {
    if (!this.currentUid) {
      this.profileModalError = 'Utilisateur non identifiÃ©.';
      return;
    }
    const profession = this.getProfileProfession();
    this.profileModalForm.profession = profession;
    if (!profession) {
      this.profileModalError = 'Merci de choisir ta profession.';
      return;
    }
    const requiredFields: (keyof ProfileModalForm)[] = ['pseudo', 'firstname', 'lastname', 'phone', 'city', 'profession'];
    const missing = requiredFields.find(field => !this.hasValue(this.profileModalForm[field]));
    if (missing) {
      this.profileModalError = 'Merci de renseigner tous les champs obligatoires.';
      return;
    }
    const trimmedPseudo = this.profileModalForm.pseudo.trim();
    const normalizedOriginal = (this.originalProfilePseudo || '').trim().toLowerCase();
    if (trimmedPseudo.toLowerCase() !== normalizedOriginal) {
      try {
        const available = await this.profiles.isPseudoAvailable(trimmedPseudo, this.currentUid);
        if (!available) {
          this.profilePseudoStatus = 'taken';
          this.profileModalError = 'Ce pseudo est dÃ©jÃ  utilisÃ©.';
          return;
        }
      } catch (error) {
        console.warn('Unable to verify pseudo', error);
        this.profileModalError = 'Impossible de vÃ©rifier le pseudo.';
        return;
      }
    }

    const payload: Record<string, any> = {
      pseudo: trimmedPseudo,
      pseudoLowercase: trimmedPseudo.toLowerCase(),
      firstname: this.profileModalForm.firstname.trim(),
      lastname: this.profileModalForm.lastname.trim(),
      profession,
      phone: this.profileModalForm.phone.trim(),
      birthdate: this.profileModalForm.birthdate || null,
      city: this.profileModalForm.city.trim(),
      address: this.profileModalForm.address.trim(),
      bio: this.profileModalForm.bio.trim(),
      onboardingCompleted: true,
      updatedAt: Date.now(),
      searchKeywords: this.buildSearchKeywords({
        firstname: this.profileModalForm.firstname,
        lastname: this.profileModalForm.lastname,
        pseudo: trimmedPseudo,
      }),
    };

    this.profileModalSaving = true;
    this.profileModalError = '';
    try {
      if (this.profilePhotoFile) {
        const storage = getStorage();
        const avatarRef = storageRef(storage, `users/${this.currentUid}/profile.jpg`);
        await uploadBytes(avatarRef, this.profilePhotoFile);
        payload['photoURL'] = await getDownloadURL(avatarRef);
        this.profilePhotoPreview = payload['photoURL'];
      }
      if (this.coverPhotoFile) {
        payload['coverURL'] = await this.profiles.saveCover(this.currentUid, this.coverPhotoFile);
        this.coverPhotoPreview = payload['coverURL'];
      }

      const ref = doc(firebaseServices.db, 'users', this.currentUid);
      await setDoc(ref, payload, { merge: true });
      const currentUser = this.auth.user$.value;
      if (currentUser) {
        this.auth.user$.next({
          ...currentUser,
          ...payload,
          profileLoading: false,
        });
      }
      this.requireProfileModal = false;
      this.originalProfilePseudo = payload['pseudo'];
      this.profilePseudoStatus = 'available';
      this.profilePhotoFile = null;
      this.coverPhotoFile = null;
    } catch (error) {
      console.error('Unable to save onboarding profile', error);
      this.profileModalError = 'Impossible de sauvegarder tes informations pour le moment.';
    } finally {
      this.profileModalSaving = false;
    }
  }

  private buildSearchKeywords(values: { firstname?: string; lastname?: string; pseudo?: string }) {
    const tokens = new Set<string>();
    const addValue = (value?: string) => {
      if (!value) return;
      const normalized = value.trim().toLowerCase();
      if (!normalized) return;
      tokens.add(normalized);
      normalized.split(/[\s-]+/).forEach(part => {
        if (part) tokens.add(part);
      });
    };
    addValue(values.pseudo);
    addValue(values.firstname);
    addValue(values.lastname);
    addValue(`${values.firstname ?? ''} ${values.lastname ?? ''}`);
    return Array.from(tokens);
  }

  private syncProfileProfessionSelection(value: string) {
    const match = matchProfessionOption(value);
    if (match) {
      this.profileSelectedProfession = match;
      this.profileCustomProfession = '';
      return;
    }
    if (value?.trim()) {
      this.profileSelectedProfession = this.professionOtherValue;
      this.profileCustomProfession = value;
      return;
    }
    this.profileSelectedProfession = '';
    this.profileCustomProfession = '';
  }

  private getProfileProfession() {
    return resolveProfessionValue(this.profileSelectedProfession, this.profileCustomProfession);
  }

  private isImageFile(file: File) {
    const mime = (file.type || '').toLowerCase();
    if (mime && mime.startsWith('image/')) return true;
    const ext = (file.name || '').toLowerCase();
    return /\.(png|jpe?g|gif|bmp|webp|avif|heic|heif)$/.test(ext);
  }
}
