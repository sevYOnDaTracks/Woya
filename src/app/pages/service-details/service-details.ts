import { Component } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SharedImports } from '../../shared/shared-imports';
import { firebaseServices } from '../../app.config';
import { doc, getDoc } from 'firebase/firestore';
import { ServiceAvailabilityDay, WoyaService } from '../../core/models/service.model';
import { TimeAgoPipe } from '../../shared/time-ago.pipe';
import { MessagingService } from '../../core/services/messaging';
import { BookingsService } from '../../core/services/bookings';
import { ServiceBooking } from '../../core/models/booking.model';
import { EmailService } from '../../core/services/email';

interface DateOption {
  date: Date;
  iso: string;
  weekday: string;
  dayLabel: string;
}

interface SlotOption {
  label: string;
  startTime: number;
  disabled: boolean;
}

@Component({
  selector: 'app-service-details',
  standalone: true,
  imports: [...SharedImports, TimeAgoPipe , RouterLink],
  templateUrl: './service-details.html'
})
export class ServiceDetails {

  service!: WoyaService;
  gallery: string[] = [];
  currentIndex = 0;
  owner: any = null;
  contacting = false;
  availabilityDays: ServiceAvailabilityDay[] = [];
  dateOptions: DateOption[] = [];
  selectedDate?: DateOption;
  slots: SlotOption[] = [];
  selectedSlot?: SlotOption;
  bookingError = '';
  bookingSuccess = '';
  bookingLoading = false;
  private bookedSlots = new Set<number>();
  private slotDuration = 60;
  private readonly weekDays = [
    { value: 1, label: 'Lundi', short: 'Lun.' },
    { value: 2, label: 'Mardi', short: 'Mar.' },
    { value: 3, label: 'Mercredi', short: 'Mer.' },
    { value: 4, label: 'Jeudi', short: 'Jeu.' },
    { value: 5, label: 'Vendredi', short: 'Ven.' },
    { value: 6, label: 'Samedi', short: 'Sam.' },
    { value: 0, label: 'Dimanche', short: 'Dim.' },
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private messaging: MessagingService,
    private bookings: BookingsService,
    private emails: EmailService,
  ) {
    this.load();
  }

  async load() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    const ref = doc(firebaseServices.db, 'services', id);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const data = snap.data() as WoyaService;

      this.service = {
        id: snap.id,
        ...data
      };

      // ✅ Convert Timestamp → millisecondes
      if (this.service.createdAt && (this.service.createdAt as any).seconds) {
        this.service.createdAt = (this.service.createdAt as any).seconds * 1000;
      }

      this.gallery = [
        this.service.coverUrl ?? '',
        ...(this.service.extraImages ?? [])
      ].filter((url): url is string => !!url);

      if (!this.gallery.length) {
        this.gallery = ['assets/icone.png'];
      }

      if (this.service.ownerId) {
        await this.loadOwner(this.service.ownerId);
      }

      if (this.service.availability?.days?.length) {
        this.slotDuration = this.service.availability.durationMinutes || 60;
        this.availabilityDays = this.service.availability.days;
        this.dateOptions = this.generateDateOptions();
        this.selectedDate = this.dateOptions[0];
        await this.loadBookings();
        this.refreshSlots();
      } else {
        this.availabilityDays = [];
        this.dateOptions = [];
        this.slots = [];
      }
    }
  }


  prev() {
    if (this.gallery.length === 0) return;
    this.currentIndex = (this.currentIndex - 1 + this.gallery.length) % this.gallery.length;
  }

  next() {
    if (this.gallery.length === 0) return;
    this.currentIndex = (this.currentIndex + 1) % this.gallery.length;
  }

  whatsapp() {
    const phone = this.service.contact.replace(/[^0-9]/g, '');
    return `https://wa.me/${phone}`;
  }

  call() {
    window.location.href = `tel:${this.service.contact}`;
  }

  async contactOwner() {
    if (!this.service?.ownerId || this.contacting) return;

    const current = firebaseServices.auth.currentUser;
    if (!current) {
      this.router.navigate(['/login']);
      return;
    }

    if (current.uid === this.service.ownerId) {
      this.router.navigate(['/messagerie']);
      return;
    }

    try {
      this.contacting = true;
      const conversationId = await this.messaging.ensureConversation(this.service.ownerId);
      if (conversationId) {
        this.router.navigate(['/messagerie', conversationId]);
      }
    } catch (error) {
      console.error('Unable to initiate conversation', error);
    } finally {
      this.contacting = false;
    }
  }

  private async loadOwner(ownerId: string) {
    try {
      const ref = doc(firebaseServices.db, 'users', ownerId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data: any = snap.data() ?? {};
        if (data.lastSeen && (data.lastSeen as any).seconds) {
          data.lastSeen = (data.lastSeen as any).seconds * 1000;
        }
        this.owner = { id: snap.id, ...data };
      }
    } catch (error) {
      console.error('Unable to load owner information', error);
      this.owner = null;
    }
  }

  displayName(user: any | null | undefined) {
    if (!user) return 'Prestataire';
    if (user.pseudo && user.pseudo.trim().length > 0) {
      return user.pseudo;
    }
    const firstname = user.firstname || 'Prestataire';
    const lastname = user.lastname ? ` ${user.lastname}` : '';
    return `${firstname}${lastname}`;
  }

  selectDate(option: DateOption) {
    this.selectedDate = option;
    this.bookingError = '';
    this.bookingSuccess = '';
    this.refreshSlots();
  }

  selectSlot(slot: SlotOption) {
    if (slot.disabled) return;
    this.selectedSlot = slot;
    this.bookingError = '';
    this.bookingSuccess = '';
  }

  async bookSelectedSlot() {
    if (!this.service || !this.selectedSlot) {
      this.bookingError = 'Sélectionne un créneau disponible.';
      return;
    }
    if (!this.service.ownerId) {
      this.bookingError = 'Impossible d’identifier le prestataire.';
      return;
    }

    const current = firebaseServices.auth.currentUser;
    if (!current) {
      this.router.navigate(['/login'], { queryParams: { redirect: this.router.url } });
      return;
    }
    if (current.uid === this.service.ownerId) {
      this.bookingError = 'Tu ne peux pas réserver ton propre service.';
      return;
    }
    if (this.bookedSlots.has(this.selectedSlot.startTime)) {
      this.bookingError = 'Ce créneau vient d’être réservé. Choisis-en un autre.';
      this.refreshSlots();
      return;
    }

    this.bookingLoading = true;
    this.bookingError = '';
    this.bookingSuccess = '';

    try {
      await this.bookings.create({
        serviceId: this.service.id!,
        serviceTitle: this.service.title,
        providerId: this.service.ownerId,
        clientId: current.uid,
        startTime: this.selectedSlot.startTime,
        durationMinutes: this.slotDuration,
      });
      this.bookedSlots.add(this.selectedSlot.startTime);
      this.bookingSuccess = 'Demande envoyée ! Le prestataire te confirmera le rendez-vous.';
      await this.notifyProviderByEmail(current);
      this.selectedSlot = undefined;
      this.refreshSlots();
    } catch (error) {
      console.error('Unable to book slot', error);
      this.bookingError = 'Impossible de réserver ce créneau pour le moment.';
    } finally {
      this.bookingLoading = false;
    }
  }

  private async notifyProviderByEmail(currentUser: any) {
    if (!this.owner?.email || !this.selectedDate) return;
    const requester =
      currentUser?.displayName ||
      currentUser?.email ||
      'Un client Woya';
    const dateLabel = this.formatDate(this.selectedSlot?.startTime);
    await this.emails.send({
      to: this.owner.email,
      subject: `Nouvelle demande de rendez-vous - ${this.service.title}`,
      body: `
Bonjour ${this.displayName(this.owner)},

${requester} vient de demander un créneau pour "${this.service.title}" le ${dateLabel}.
Rendez-vous dans ton espace Mes rendez-vous pour confirmer ou annuler: https://woya.shop/mes-rendez-vous

À très vite,
L'équipe Woya!
      `.trim(),
    });
  }

  private async loadBookings() {
    if (!this.service?.id) return;
    try {
      const bookings: ServiceBooking[] = await this.bookings.listByService(this.service.id);
      this.bookedSlots = new Set(
        bookings
          .filter(booking => booking.status !== 'cancelled')
          .map(booking => booking.startTime)
          .filter((time): time is number => typeof time === 'number'),
      );
    } catch (error) {
      console.error('Unable to load bookings for service', error);
      this.bookedSlots = new Set<number>();
    }
  }

  private refreshSlots() {
    const selectedDate = this.selectedDate;
    if (!selectedDate) {
      this.slots = [];
      return;
    }
    const rule = this.availabilityDays.find(day => day.day === selectedDate.date.getDay());
    if (!rule) {
      this.slots = [];
      this.selectedSlot = undefined;
      return;
    }

    const duration = Math.max(this.slotDuration || 60, 15);
    const startMinutes = this.timeToMinutes(rule.start);
    const endMinutes = this.timeToMinutes(rule.end);
    if (endMinutes <= startMinutes) {
      this.slots = [];
      this.selectedSlot = undefined;
      return;
    }

    const dayStart = new Date(selectedDate.date);
    dayStart.setHours(0, 0, 0, 0);

    const slots: SlotOption[] = [];
    for (let minutes = startMinutes; minutes + duration <= endMinutes; minutes += duration) {
      const startTime = dayStart.getTime() + minutes * 60000;
      slots.push({
        label: this.minutesToLabel(minutes),
        startTime,
        disabled: this.bookedSlots.has(startTime),
      });
    }

    const currentSlot = this.selectedSlot;
    const stillAvailable = currentSlot
      ? slots.find(slot => slot.startTime === currentSlot.startTime && !slot.disabled)
      : null;
    if (!stillAvailable) {
      this.selectedSlot = undefined;
    }

    this.slots = slots;
  }

  private generateDateOptions(): DateOption[] {
    if (!this.availabilityDays.length) return [];
    const allowedDays = new Set(this.availabilityDays.map(day => day.day));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const options: DateOption[] = [];

    for (let i = 0; i < 21; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      if (!allowedDays.has(date.getDay())) continue;
      options.push({
        date,
        iso: date.toISOString().split('T')[0],
        weekday: this.weekdayLabel(date.getDay()),
        dayLabel: date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
      });
    }

    return options;
  }

  private timeToMinutes(value: string) {
    const [h, m] = value.split(':').map(part => parseInt(part, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) return 0;
    return h * 60 + m;
  }

  private minutesToLabel(minutes: number) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}h${mins.toString().padStart(2, '0')}`;
  }

  private weekdayLabel(day: number) {
    return this.weekDays.find(item => item.value === day)?.short ?? '';
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
}
