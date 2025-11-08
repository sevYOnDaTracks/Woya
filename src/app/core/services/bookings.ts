import { Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  Timestamp,
  QueryDocumentSnapshot,
  DocumentData,
  updateDoc,
} from 'firebase/firestore';
import { firebaseServices } from '../../app.config';
import { BookingStatus, CreateBookingInput, ServiceBooking } from '../models/booking.model';

@Injectable({ providedIn: 'root' })
export class BookingsService {
  private db = firebaseServices.db;
  private col = collection(this.db, 'bookings');

  async listByService(serviceId: string): Promise<ServiceBooking[]> {
    const q = query(this.col, where('serviceId', '==', serviceId));
    const snap = await getDocs(q);
    return snap.docs
      .map(docSnap => this.mapBooking(docSnap))
      .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
  }

  async listForProvider(providerId: string): Promise<ServiceBooking[]> {
    const q = query(this.col, where('providerId', '==', providerId));
    const snap = await getDocs(q);
    return snap.docs
      .map(docSnap => this.mapBooking(docSnap))
      .sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0));
  }

  async listForClient(clientId: string): Promise<ServiceBooking[]> {
    const q = query(this.col, where('clientId', '==', clientId));
    const snap = await getDocs(q);
    return snap.docs
      .map(docSnap => this.mapBooking(docSnap))
      .sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0));
  }

  async create(input: CreateBookingInput) {
    const startTimestamp = Timestamp.fromMillis(input.startTime);
    const endTimestamp = Timestamp.fromMillis(input.startTime + input.durationMinutes * 60000);

    const payload = {
      serviceId: input.serviceId,
      serviceTitle: input.serviceTitle,
      providerId: input.providerId,
      clientId: input.clientId,
      startTime: startTimestamp,
      endTime: endTimestamp,
      durationMinutes: input.durationMinutes,
      status: 'pending' as const,
      createdAt: serverTimestamp(),
    };

    const ref = await addDoc(this.col, payload);
    return ref.id;
  }

  async updateStatus(bookingId: string, status: BookingStatus) {
    const ref = doc(this.db, 'bookings', bookingId);
    await updateDoc(ref, {
      status,
      updatedAt: serverTimestamp(),
    });
  }

  private mapBooking(docSnap: QueryDocumentSnapshot<DocumentData>): ServiceBooking {
    const data = docSnap.data() as any;
    const startTime = this.toMillis(data.startTime) ?? Date.now();
    const duration = data.durationMinutes ?? 60;
    const endTime = this.toMillis(data.endTime) ?? startTime + duration * 60000;

    return {
      id: docSnap.id,
      serviceId: data.serviceId,
      serviceTitle: data.serviceTitle,
      providerId: data.providerId,
      clientId: data.clientId,
      startTime,
      endTime,
      durationMinutes: duration,
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
}
