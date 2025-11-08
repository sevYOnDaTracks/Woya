import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  collection,
  onSnapshot,
  query,
  Unsubscribe,
  where,
  DocumentData,
  QuerySnapshot,
} from 'firebase/firestore';
import { firebaseServices } from '../app.config';
import { AuthStore } from '../core/store/auth.store';
import { ServiceBooking } from '../core/models/booking.model';

interface Toast {
  id: string;
  message: string;
  role: 'provider' | 'client';
  actionLabel: string;
  route: string;
}

@Component({
  selector: 'app-booking-alerts',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './booking-alerts.html',
  styleUrl: './booking-alerts.css',
})
export class BookingAlerts implements OnInit, OnDestroy {
  toasts: Toast[] = [];

  private authSub?: Subscription;
  private providerUnsub?: Unsubscribe;
  private clientUnsub?: Unsubscribe;
  private providerInitialized = false;
  private clientInitialized = false;
  private providerStates = new Map<string, ServiceBooking>();
  private clientStates = new Map<string, ServiceBooking>();

  constructor(private auth: AuthStore, private router: Router) {}

  ngOnInit(): void {
    this.authSub = this.auth.user$.subscribe(user => {
      this.teardown();
      if (user?.uid) {
        this.bind(user.uid);
      }
    });
  }

  ngOnDestroy(): void {
    this.teardown();
    this.authSub?.unsubscribe();
  }

  dismiss(id: string) {
    this.toasts = this.toasts.filter(t => t.id !== id);
  }

  navigate(toast: Toast) {
    this.router.navigate([toast.route]);
    this.dismiss(toast.id);
  }

  private bind(uid: string) {
    const col = collection(firebaseServices.db, 'bookings');
    this.providerInitialized = false;
    this.clientInitialized = false;
    this.providerStates.clear();
    this.clientStates.clear();

    this.providerUnsub = onSnapshot(query(col, where('providerId', '==', uid)), snapshot =>
      this.handleProviderSnapshot(snapshot),
    );
    this.clientUnsub = onSnapshot(query(col, where('clientId', '==', uid)), snapshot =>
      this.handleClientSnapshot(snapshot),
    );
  }

  private teardown() {
    this.providerUnsub?.();
    this.clientUnsub?.();
    this.providerUnsub = undefined;
    this.clientUnsub = undefined;
    this.providerStates.clear();
    this.clientStates.clear();
    this.toasts = [];
  }

  private handleProviderSnapshot(snapshot: QuerySnapshot<DocumentData>) {
    const bookings = snapshot.docs.map(docSnap => this.mapBooking(docSnap.id, docSnap.data()));
    if (!this.providerInitialized) {
      bookings.forEach(booking => {
        if (booking) this.providerStates.set(booking.id!, booking);
      });
      this.providerInitialized = true;
      return;
    }

    bookings.forEach(booking => {
      if (!booking?.id) return;
      const previous = this.providerStates.get(booking.id);
      if (!previous && booking.status === 'pending') {
        this.pushToast({
          id: `provider-new-${booking.id}`,
          role: 'provider',
          message: `Nouvelle demande pour "${booking.serviceTitle}" le ${this.formatDate(
            booking.startTime,
          )}`,
          actionLabel: 'Ouvrir',
          route: '/mes-rendez-vous',
        });
      } else if (previous && previous.status !== booking.status) {
        this.pushToast({
          id: `provider-status-${booking.id}-${booking.status}`,
          role: 'provider',
          message: `Mise à jour: "${booking.serviceTitle}" est maintenant "${this.translateStatus(
            booking.status,
          )}"`,
          actionLabel: 'Voir',
          route: '/mes-rendez-vous',
        });
      }
      this.providerStates.set(booking.id, booking);
    });
  }

  private handleClientSnapshot(snapshot: QuerySnapshot<DocumentData>) {
    const bookings = snapshot.docs.map(docSnap => this.mapBooking(docSnap.id, docSnap.data()));
    if (!this.clientInitialized) {
      bookings.forEach(booking => {
        if (booking) this.clientStates.set(booking.id!, booking);
      });
      this.clientInitialized = true;
      return;
    }

    bookings.forEach(booking => {
      if (!booking?.id) return;
      const previous = this.clientStates.get(booking.id);
      if (previous && previous.status !== booking.status) {
        this.pushToast({
          id: `client-status-${booking.id}-${booking.status}`,
          role: 'client',
          message: `Ton rendez-vous "${booking.serviceTitle}" est ${this.translateStatus(
            booking.status,
          )}`,
          actionLabel: 'Détails',
          route: '/mes-reservations',
        });
      }
      this.clientStates.set(booking.id, booking);
    });
  }

  private pushToast(toast: Toast) {
    this.toasts = [...this.toasts.filter(t => t.id !== toast.id), toast];
    setTimeout(() => this.dismiss(toast.id), 6000);
  }

  private mapBooking(id: string, data: any): ServiceBooking | null {
    if (!data) return null;
    const startTime = this.toMillis(data.startTime);
    const endTime = this.toMillis(data.endTime) ?? (startTime ?? Date.now());
    return {
      id,
      serviceId: data.serviceId,
      serviceTitle: data.serviceTitle,
      providerId: data.providerId,
      clientId: data.clientId,
      startTime: startTime ?? Date.now(),
      endTime,
      durationMinutes: data.durationMinutes ?? 60,
      status: data.status ?? 'pending',
      createdAt: this.toMillis(data.createdAt) ?? Date.now(),
    };
  }

  private toMillis(value: any): number | undefined {
    if (!value) return undefined;
    if (typeof value === 'number') return value;
    if (value.seconds) return value.seconds * 1000;
    return undefined;
  }

  private formatDate(timestamp?: number) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private translateStatus(status: ServiceBooking['status']) {
    switch (status) {
      case 'confirmed':
        return 'confirmé';
      case 'cancelled':
        return 'annulé';
      default:
        return 'en attente';
    }
  }
}
